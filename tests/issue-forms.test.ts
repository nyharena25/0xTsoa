import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { DISTRO_LABELS, configSchema } from '../src/lib/schema';
import { convertIssueToConfig, parseKeybindings } from '../scripts/issue-to-config';

const form = fs.readFileSync('.github/ISSUE_TEMPLATE/new-config.yml', 'utf-8');
const bot = fs.readFileSync('scripts/issue-to-config.ts', 'utf-8');

/** Labels of the form's answer fields (not markdown blocks, not the checklist). */
const formLabels = [...form.matchAll(/^ {2}- type: (?:input|textarea|dropdown|checkboxes)\n {4}id: \w+\n {4}attributes:\n {6}label: "?([^"\n]+)"?$/gm)]
  .map((m) => m[1])
  .filter((l) => l !== 'Submission Checklist');
/** Labels the bot reads (`fields['…']`), without the old name it still accepts. */
const botLabels = [...new Set([...bot.matchAll(/fields\['([^']+)'\]/g)].map((m) => m[1]))].filter((l) => l !== 'Configuration Name');

const answer = (fields: Record<string, string>) => Object.entries(fields).map(([k, v]) => `### ${k}\n\n${v}\n`).join('\n');
const base = {
  'Project Name': 'Paper Dots',
  Slug: 'paper-dots',
  'Short Summary': 'A calm Hyprland desktop with Waybar and Kitty.',
  'Desktop Part': 'Dotfiles & full rices',
  'Window Manager': 'Hyprland',
  'Theme Style': 'Minimalist',
  'Display Server': 'Wayland',
  Distributions: '- [X] Arch Linux',
  'Screenshots URLs': 'https://raw.githubusercontent.com/alice/dots/v1.0.0/shot.png',
  'Source Repository': 'https://github.com/alice/dots',
  'Git Ref': 'v1.0.0',
  'Install: Dependencies': 'sudo pacman -S --needed hyprland waybar',
};

describe('the new-config form and the bot', () => {
  it('ask for exactly the fields the bot reads', () => {
    expect(formLabels.toSorted()).toEqual(botLabels.toSorted());
  });

  it('offer every component the schema and the spec table know', () => {
    const specKeys = Object.keys((configSchema as unknown as { shape: { specs: { unwrap: () => { shape: object } } } }).shape.specs.unwrap().shape);
    expect(specKeys.toSorted()).toEqual(['bar', 'editor', 'launcher', 'notifications', 'shell', 'terminal', 'theme']);
    for (const label of ['Status Bar', 'Editor', 'Launcher', 'Notifications', 'Shell', 'Terminal', 'Theme']) expect(formLabels).toContain(label);
  });

  it('name distros and display servers the way the site does', async () => {
    const distros = [...form.slice(form.indexOf('label: Distributions')).matchAll(/^ {8}- label: (.+)$/gm)].slice(0, Object.keys(DISTRO_LABELS).length).map((m) => m[1]);
    expect(distros).toEqual(Object.values(DISTRO_LABELS));
    const servers = { Wayland: 'wayland', X11: 'x11', 'Wayland & X11': 'both' };
    for (const [option, value] of Object.entries(servers)) {
      expect(form).toContain(`        - ${option}\n`);
      const { config } = await convertIssueToConfig('alice', answer({ ...base, 'Display Server': option }));
      expect(config.displayServer).toBe(value);
    }
    const { config } = await convertIssueToConfig('alice', answer({ ...base, Distributions: '- [X] Linux Mint\n- [X] Void Linux\n- [ ] Fedora' }));
    expect(config.distros).toEqual(['mint', 'void']);
  });

  it('reads keyboard shortcuts, the README path and the new components', async () => {
    expect(parseKeybindings('SUPER + Return | Open a terminal\nno separator\nSUPER + Q | killactive | Close the window')).toEqual([
      { keys: 'SUPER + Return', action: 'Open a terminal' },
      { keys: 'SUPER + Q', action: 'killactive', effect: 'Close the window' },
    ]);
    const { config } = await convertIssueToConfig('alice', answer({ ...base, 'README Path': 'docs/README.md', Notifications: 'mako', Editor: 'Neovim' }));
    expect(config.source.readme).toBe('docs/README.md');
    expect(config.specs).toMatchObject({ notifications: 'mako', editor: 'Neovim' });
    expect(configSchema.safeParse(config).success).toBe(true);
  });
});

describe('who a submission is credited to', () => {
  it('credits the repository owner and verifies a submitter who owns it', async () => {
    const { config, author, ownership } = await convertIssueToConfig('Alice', answer(base), { issue: 7 });
    expect(author).toBe('alice');
    expect(config.author).toMatchObject({ github: 'alice', verified: { by: 'Alice', issue: 7 } });
    expect(ownership.owns).toBe(true);
  });

  it("never credits someone else's project to whoever opened the issue", async () => {
    const isPublicMember = vi.fn(async () => false);
    const { config, author, ownership } = await convertIssueToConfig('mallory', answer(base), { issue: 8, isPublicMember });
    expect(author).toBe('alice');
    expect(config.author.github).toBe('alice');
    expect(config.author.verified).toBeUndefined();
    expect(ownership.owns).toBe(false);
  });

  it('verifies a public member of the owning organization', async () => {
    const repo = { 'Source Repository': 'https://github.com/catppuccin/dots', 'Screenshots URLs': 'https://raw.githubusercontent.com/catppuccin/dots/v1.0.0/shot.png' };
    const { config } = await convertIssueToConfig('bob', answer({ ...base, ...repo }), { issue: 9, isPublicMember: async (org, user) => org === 'catppuccin' && user === 'bob' });
    expect(config.author).toMatchObject({ github: 'catppuccin', verified: { by: 'bob' } });
  });

  it('credits the submitter, unverified, off GitHub', async () => {
    const repo = { 'Source Repository': 'https://codeberg.org/alice/dots', 'Screenshots URLs': 'https://codeberg.org/alice/dots/raw/tag/v1.0.0/shot.png' };
    const { config } = await convertIssueToConfig('alice', answer({ ...base, ...repo }), { issue: 10 });
    expect(config.author.github).toBe('alice');
    expect(config.author.verified).toBeUndefined();
  });
});
