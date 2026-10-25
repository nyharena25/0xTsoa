import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { configSchema } from '../src/lib/schema';
import { changeComment, parseRequest, speaksForEntry } from '../scripts/entry-change';

const base = configSchema.parse(JSON.parse(fs.readFileSync('configs/catppuccin/hyprland-theme.json', 'utf-8')));
const notMember = async () => false;

describe('edit and removal requests', () => {
  it('reads the request type from the form', () => {
    expect(parseRequest('### Request\n\nRemove this entry\n')).toBe('remove');
    expect(parseRequest('### Request\n\nFix the install steps\n')).toBe('edit');
  });

  it('trusts the repository owner and the verified author, nobody else', async () => {
    expect((await speaksForEntry(base, 'catppuccin', notMember)).owns).toBe(true);
    expect((await speaksForEntry(base, 'mallory', notMember)).owns).toBe(false);
    const verified = { ...base, author: { ...base.author, verified: { by: 'maintainer-x', at: '2026-10-25', issue: 3 } } };
    expect((await speaksForEntry(verified, 'Maintainer-X', notMember)).owns).toBe(true);
  });

  it('keeps an entry listed when someone else asks for its removal', async () => {
    const comment = changeComment('remove', await speaksForEntry(base, 'mallory', notMember));
    expect(comment).toMatch(/does not come from the project's owner/);
    expect(comment).toMatch(/stays listed/);
    expect(changeComment('remove', { owns: true, reason: '@catppuccin owns it.' })).toMatch(/^✓ .*will remove the entry/);
  });
});
