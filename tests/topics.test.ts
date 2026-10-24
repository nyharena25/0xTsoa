import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TOPICS, MIN_TOPIC_ENTRIES, liveTopics, primaryTopic, topicDescription, topicForFacet } from '../src/lib/topics';
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
  it('have unique slugs that do not collide with existing routes', () => {
    const slugs = TOPICS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const routes = fs.readdirSync(path.resolve('src/pages')).map((f) => f.replace(/\.(astro|ts)$/, ''));
    for (const slug of slugs) expect(routes, slug).not.toContain(slug);
  });

  it('fit search result limits, with the largest possible entry count', () => {
    for (const t of TOPICS) {
      expect(t.title.length, t.slug).toBeLessThanOrEqual(TITLE_MAX);
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
