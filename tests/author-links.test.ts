import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { badgeMarkdown, configPageUrl, entryChangeUrl, claimEntryUrl, BADGE_URL } from '../src/lib/author-links';
import { REPO_URL, SITE_URL } from '../site.config';

const root = path.resolve('configs');
const ids = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((author) =>
  fs.readdirSync(path.join(root, author.name)).filter((f) => f.endsWith('.json')).map((f) => `${author.name}/${f.slice(0, -5)}`),
);

describe('author box links', () => {
  it('points every badge at its own entry page on the canonical host', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(configPageUrl(id)).toBe(`${SITE_URL}/configs/${id}/`);
      expect(badgeMarkdown(id)).toBe(`[![Indexed on 0xTsoa](${SITE_URL}/badge.svg)](${SITE_URL}/configs/${id}/)`);
    }
  });

  it('links to a badge image that exists in public/', () => {
    expect(BADGE_URL).toBe(`${SITE_URL}/badge.svg`);
    expect(fs.existsSync('public/badge.svg')).toBe(true);
  });

  it('prefills the entry-change form with the entry id and the request in the title', () => {
    const edit = new URL(entryChangeUrl('catppuccin/hyprland-theme', 'edit'));
    expect(`${edit.origin}${edit.pathname}`).toBe(`${REPO_URL}/issues/new`);
    expect(edit.searchParams.get('template')).toBe('entry-change.yml');
    expect(edit.searchParams.get('entry')).toBe('catppuccin/hyprland-theme');
    expect(edit.searchParams.get('title')).toBe('[Edit]: catppuccin/hyprland-theme');
    expect(new URL(entryChangeUrl('a/b-c', 'remove')).searchParams.get('title')).toBe('[Removal]: a/b-c');
  });

  it('prefills the claim form the same way', () => {
    const claim = new URL(claimEntryUrl('catppuccin/hyprland-theme'));
    expect(claim.searchParams.get('template')).toBe('claim-entry.yml');
    expect(claim.searchParams.get('entry')).toBe('catppuccin/hyprland-theme');
    expect(claim.searchParams.get('title')).toBe('[Claim]: catppuccin/hyprland-theme');
  });

  it('prefills a field both forms actually have, under the label the claim bot reads', () => {
    for (const form of ['entry-change.yml', 'claim-entry.yml']) {
      expect(fs.readFileSync(`.github/ISSUE_TEMPLATE/${form}`, 'utf-8'), form).toMatch(/^\s+id: entry\n\s+attributes:\n\s+label: Entry$/m);
    }
  });
});
