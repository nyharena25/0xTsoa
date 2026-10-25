import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TOPICS, TOPIC_GROUPS, MIN_TOPIC_ENTRIES, liveTopics, primaryTopic, topicDescription, topicForFacet, topicPath, topicText, topicModified, choosePicks, retiredEntries } from '../src/lib/topics';
import { TITLE_MAX, DESCRIPTION_MAX } from '../src/lib/seo';
import { configSchema, type ConfigData } from '../src/lib/schema';

const root = path.resolve('configs');
const registry = fs
  .readdirSync(root)
  .filter((a) => fs.statSync(path.join(root, a)).isDirectory())
  .flatMap((a) =>
    fs
      .readdirSync(path.join(root, a))
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ id: `${a}/${f.replace(/\.json$/, '')}`, data: configSchema.parse(JSON.parse(fs.readFileSync(path.join(root, a, f), 'utf-8'))) })),
  );
const find = (id: string) => registry.find((e) => e.id === id)!.data;

describe('topic definitions', () => {
  it('have unique slugs that do not collide with other docs pages', () => {
    const slugs = TOPICS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const routes = fs.readdirSync(path.resolve('src/pages/docs')).map((f) => f.replace(/\.(astro|ts)$/, ''));
    for (const slug of slugs) expect(routes, slug).not.toContain(slug);
    expect(topicPath('hyprland')).toBe('/docs/hyprland/');
  });

  it('are each listed in exactly one Docs index group', () => {
    const grouped = TOPIC_GROUPS.flatMap((g) => g.slugs);
    expect([...grouped].sort()).toEqual(TOPICS.map((t) => t.slug).sort());
  });

  it('fit search result limits, with the largest possible entry count', () => {
    for (const t of TOPICS) {
      expect(topicText(t.title).length, t.slug).toBeLessThanOrEqual(TITLE_MAX);
      expect(topicDescription(t, 999).length, t.slug).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(t.description).toContain('{n}');
      expect(t.intro.length).toBeGreaterThan(0);
      expect(t.faq.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('liveTopics', () => {
  it(`publishes only topics with at least ${MIN_TOPIC_ENTRIES} entries`, () => {
    const live = liveTopics(registry);
    expect(live.length).toBeGreaterThan(0);
    for (const { entries } of live) expect(entries.length).toBeGreaterThanOrEqual(MIN_TOPIC_ENTRIES);
    const few = registry.slice(0, MIN_TOPIC_ENTRIES - 1).map((e) => ({ ...e, data: { ...e.data, wm: 'hyprland' as const, category: 'dotfiles' as const } }));
    expect(liveTopics(few)).toEqual([]);
  });
});

describe('primaryTopic', () => {
  const live = liveTopics(registry).map((t) => t.topic);
  const slug = (data: ConfigData) => primaryTopic(data, live)?.slug;

  it('files dotfiles under their window manager, and parts under their category', () => {
    expect(slug(find('end-4/dots-hyprland'))).toBe('hyprland');
    expect(slug(find('alexays/waybar'))).toBe('bars');
    expect(slug(find('jas-singhfsu/hyprpanel'))).toBe('bars');
    expect(slug(find('vinceliuice/orchis-theme'))).toBe('gtk-themes');
  });

  it('falls back to the window manager, then the palette', () => {
    expect(slug(find('aunetx/blur-my-shell'))).toBe('gnome');
    expect(slug(find('catppuccin/grub'))).toBe('catppuccin');
  });

  it('returns nothing when no published topic fits', () => {
    expect(slug({ ...find('alexays/waybar'), category: 'boot', wm: 'river', themeStyle: 'other' })).toBeUndefined();
    expect(topicForFacet(live, { kind: 'wm', value: 'river' })).toBeUndefined();
  });
});

describe('topic text and dates', () => {
  it('fills {year} and keeps titles within limits for any four-digit year', () => {
    const hyprland = TOPICS.find((t) => t.slug === 'hyprland')!;
    expect(topicText(hyprland.title, 2026)).toBe('Best Hyprland Dotfiles in 2026, Compared');
    for (const t of TOPICS) expect(topicText(t.title, 2099).length, t.slug).toBeLessThanOrEqual(TITLE_MAX);
  });

  it('dates a topic by its text review or its newest entry, whichever is later', () => {
    const topic = { ...TOPICS[0], updated: '2026-01-01' };
    expect(topicModified(topic, [])).toBe('2026-01-01');
    expect(topicModified(topic, [{ data: { ...find('alexays/waybar'), updatedAt: '2026-05-02' } }, { data: { ...find('alexays/waybar'), updatedAt: '2025-01-01' } }])).toBe('2026-05-02');
    for (const t of TOPICS) expect(t.updated, t.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('picks and retired entries', () => {
  const live = liveTopics(registry);

  it('only name entries that belong to the topic', () => {
    for (const { topic, entries } of live) {
      const ids = new Set(entries.map((e) => e.id));
      for (const pick of topic.picks ?? []) for (const c of pick.candidates) expect(ids, `${topic.slug}: ${c.id}`).toContain(c.id);
      for (const r of topic.retired ?? []) {
        expect(ids, `${topic.slug}: ${r.id}`).toContain(r.id);
        for (const to of r.to ?? []) expect(registry.some((e) => e.id === to), to).toBe(true);
      }
    }
  });

  it('give every Hyprland need a pick, each entry at most once and never a retired one', () => {
    const { topic, entries } = live.find((t) => t.topic.slug === 'hyprland')!;
    const retired = new Set((topic.retired ?? []).map((r) => r.id));
    const picks = choosePicks(topic, entries, (e) => retired.has(e.id));
    expect(picks.length).toBe(topic.picks!.length);
    expect(new Set(picks.map((p) => p.entry.id)).size).toBe(picks.length);
    for (const p of picks) expect(retired.has(p.entry.id)).toBe(false);
  });

  it('falls back to the next candidate when the first is retired or already picked', () => {
    const topic = {
      ...TOPICS[0],
      picks: [
        { need: 'A', candidates: [{ id: 'x/one', reason: 'r1' }, { id: 'x/two', reason: 'r2' }] },
        { need: 'B', candidates: [{ id: 'x/two', reason: 'r3' }, { id: 'x/three', reason: 'r4' }] },
        { need: 'C', candidates: [{ id: 'x/missing', reason: 'r5' }] },
      ],
    };
    const entries = [{ id: 'x/one' }, { id: 'x/two' }, { id: 'x/three' }];
    const picks = choosePicks(topic, entries, (e) => e.id === 'x/one');
    expect(picks.map((p) => [p.need, p.entry.id, p.reason])).toEqual([
      ['A', 'x/two', 'r2'],
      ['B', 'x/three', 'r4'],
    ]);
  });

  it('lists archived entries first, then the ones retired by hand', () => {
    const topic = { ...TOPICS[0], retired: [{ id: 'x/old', note: 'Replaced.', to: ['x/new'] }, { id: 'x/gone', note: 'Hand note.' }] };
    const entries = [{ id: 'x/old' }, { id: 'x/gone' }, { id: 'x/fine' }];
    const out = retiredEntries(topic, entries, (e) => e.id === 'x/gone');
    expect(out.map((r) => [r.entry.id, r.note, r.to])).toEqual([
      ['x/gone', 'Hand note.', undefined],
      ['x/old', 'Replaced.', ['x/new']],
    ]);
  });
});
