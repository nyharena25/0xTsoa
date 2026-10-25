import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { configSchema } from '../src/lib/schema';
import { parseClaimEntry, githubOwner, decideClaim, applyClaim } from '../scripts/claim-entry';

const raw = fs.readFileSync('configs/catppuccin/hyprland-theme.json', 'utf-8');
const base = configSchema.parse(JSON.parse(raw));
const withRepo = (repo: string) => ({ ...base, source: { ...base.source, repo } });
const verified = { by: 'catppuccin-bot', at: '2026-10-25', issue: 42 };
const body = (entry: string) => `### Entry\n\n${entry}\n\n### Confirmation\n\n- [X] I am the author or a maintainer of this project.\n`;

describe('claim issue parsing', () => {
  it('reads the entry id, also from a pasted page URL', () => {
    expect(parseClaimEntry(body('catppuccin/hyprland-theme'))).toBe('catppuccin/hyprland-theme');
    expect(parseClaimEntry(body('https://www.0xtsoa.dev/configs/catppuccin/hyprland-theme/'))).toBe('catppuccin/hyprland-theme');
    expect(parseClaimEntry(body('/configs/end-4/dots-hyprland/'))).toBe('end-4/dots-hyprland');
  });

  it('rejects anything that is not an entry id, so no path can be built from it', () => {
    for (const bad of ['', '_No response_', 'catppuccin', '../../etc/passwd', 'a/b/c', 'catppuccin/../x', 'x/Upper-Case']) {
      expect(() => parseClaimEntry(body(bad)), bad).toThrow(/not an entry id/);
    }
  });

  it('finds the owner of GitHub repositories only', () => {
    expect(githubOwner('https://github.com/catppuccin/hyprland')).toBe('catppuccin');
    expect(githubOwner('https://github.com/end-4/dots-hyprland/')).toBe('end-4');
    expect(githubOwner('https://codeberg.org/someone/dots')).toBeNull();
    expect(githubOwner('https://gitlab.com/someone/dots')).toBeNull();
  });
});

describe('claim verification rules', () => {
  it('verifies the repository owner, whatever the case of the login, without asking the API', async () => {
    const member = vi.fn(async () => false);
    const d = await decideClaim(withRepo('https://github.com/Someone/dots'), 'someone', member);
    expect(d.status).toBe('verified');
    expect(member).not.toHaveBeenCalled();
  });

  it('verifies a public member of the owning organization', async () => {
    const member = vi.fn(async (org: string, user: string) => org === 'catppuccin' && user === 'alice');
    expect((await decideClaim(withRepo('https://github.com/catppuccin/hyprland'), 'alice', member)).status).toBe('verified');
    expect(member).toHaveBeenCalledWith('catppuccin', 'alice');
  });

  it('leaves everyone else to a maintainer', async () => {
    const d = await decideClaim(withRepo('https://github.com/catppuccin/hyprland'), 'mallory', async () => false);
    expect(d.status).toBe('manual');
    expect(d.reason).toMatch(/not a public member of catppuccin/);
  });

  it('leaves non-GitHub repositories to a maintainer, even when the login matches', async () => {
    const d = await decideClaim(withRepo('https://codeberg.org/catppuccin/hyprland'), 'catppuccin', async () => true);
    expect(d.status).toBe('manual');
  });

  it('does nothing for an entry that is already verified', async () => {
    const data = { ...base, author: { ...base.author, verified } };
    expect((await decideClaim(data, 'catppuccin', async () => true)).status).toBe('already');
  });
});

describe('applying a claim', () => {
  it('adds author.verified and leaves the rest of the file as it was', () => {
    const out = applyClaim(raw, verified);
    const before = JSON.parse(raw);
    const after = JSON.parse(out);
    expect(after.author.verified).toEqual(verified);
    delete after.author.verified;
    expect(after).toEqual(before);
    expect(Object.keys(JSON.parse(out))).toEqual(Object.keys(before));
    expect(out.endsWith('}\n')).toBe(true);
    expect(configSchema.safeParse(JSON.parse(out)).success).toBe(true);
  });

  it('is rejected by the schema with a malformed date or issue', () => {
    for (const v of [{ ...verified, at: '25/10/2026' }, { ...verified, issue: 0 }, { ...verified, by: 'bad user' }]) {
      expect(configSchema.safeParse(JSON.parse(applyClaim(raw, v as typeof verified))).success).toBe(false);
    }
  });
});
