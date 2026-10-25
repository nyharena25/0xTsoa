import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TOPICS, liveTopics } from '../src/lib/topics';
import { GUIDES_DIR, guideEditUrl, guideSchema, isGuideFile } from '../src/lib/guides';
import { REGISTRY_STATS, registryStat } from '../src/lib/registry-facts';
import { describeImpact, installDifficulty, installImpact } from '../src/lib/install';
import { configSchema } from '../src/lib/schema';

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
const ids = new Set(registry.map((e) => e.id));

const files = fs.readdirSync(path.resolve(GUIDES_DIR)).filter((f) => f.endsWith('.mdx'));
const read = (f: string) => fs.readFileSync(path.resolve(GUIDES_DIR, f), 'utf-8');
const published = files.filter(isGuideFile).map((f) => f.replace(/\.mdx$/, ''));

// Every page a guide may link to with a root-relative path.
const pages = new Set([
  '/',
  '/catalogue/',
  '/contribute/',
  '/about/',
  '/docs/',
  '/llms.txt',
  '/index.json',
  ...[...ids].flatMap((id) => [`/configs/${id}/`, `/configs/${id}/install.sh`]),
  ...liveTopics(registry).map(({ topic }) => `/docs/${topic.slug}/`),
  ...published.map((slug) => `/docs/${slug}/`),
]);

describe('guide files', () => {
  it('are lowercase slugs, or start with "_" and stay unpublished', () => {
    expect(files).toContain('_template.mdx');
    for (const f of files) expect(isGuideFile(f) || f.startsWith('_'), f).toBe(true);
    expect(isGuideFile('_template.mdx')).toBe(false);
  });

  it('never take a topic page URL', () => {
    for (const slug of published) expect(TOPICS.map((t) => t.slug), slug).not.toContain(slug);
  });

  it('only link to pages that exist', () => {
    for (const f of files) {
      const body = read(f).replace(/^---[\s\S]*?\n---\n/, '');
      const links = [...body.matchAll(/\]\((\/[^)\s]*)\)|href=["'](\/[^"']*)["']/g)].map((m) => (m[1] ?? m[2]).replace(/[?#].*$/, ''));
      for (const link of links) expect(pages, `${f}: ${link}`).toContain(link);
    }
  });

  it('never link from a published guide to a draft, which the live site does not build', () => {
    const isDraft = (f: string) => /^draft:\s*true\s*$/m.test(read(f).match(/^---[\s\S]*?\n---\n/)?.[0] ?? '');
    const drafts = files.filter(isGuideFile).filter(isDraft).map((f) => `/docs/${f.replace(/\.mdx$/, '')}/`);
    for (const f of files.filter((f) => isGuideFile(f) && !isDraft(f))) {
      const body = read(f).replace(/^---[\s\S]*?\n---\n/, '');
      for (const d of drafts) expect(body, `${f} links to draft ${d}`).not.toContain(`](${d}`);
    }
  });

  it('only embed registry entries and known counts', () => {
    for (const f of files) {
      const text = read(f);
      const used = [
        ...[...text.matchAll(/<WhatItChanges\s+id=["']([^"']+)["']/g)].map((m) => m[1]),
        ...[...text.matchAll(/<Compare\s+ids=\{\[([^\]]*)\]\}/g)].flatMap((m) => [...m[1].matchAll(/["']([^"']+)["']/g)].map((q) => q[1])),
      ];
      for (const id of used) expect(ids, `${f}: ${id}`).toContain(id);
      for (const [, kind] of text.matchAll(/<RegistryStat\s+kind=["']([^"']+)["']/g)) expect(Object.keys(REGISTRY_STATS), `${f}: ${kind}`).toContain(kind);
    }
  });

  it('name topics that exist', () => {
    for (const f of files) {
      const line = read(f).match(/^topics:\s*\[(.*)\]/m);
      const slugs = line ? line[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
      for (const s of slugs) expect(TOPICS.map((t) => t.slug), `${f}: ${s}`).toContain(s);
    }
  });
});

describe('guideSchema', () => {
  const valid = {
    title: 'How to Install Dotfiles Safely',
    h1: 'How to install dotfiles safely and roll back',
    label: 'Install safely',
    description: 'What a dotfiles install changes on your system, how to preview it first, and how to undo it with backups and a rollback.',
    published: '2026-10-25',
    updated: '2026-10-25',
  };

  it('fills defaults', () => {
    const g = guideSchema.parse(valid);
    expect(g.author).toBe('Ny Harena RAVELOMANANTSOA');
    expect(g.draft).toBe(false);
    expect(g.topics).toEqual([]);
  });

  it('keeps titles and descriptions within search result limits', () => {
    expect(guideSchema.safeParse({ ...valid, title: 'x'.repeat(52) }).success).toBe(false);
    expect(guideSchema.safeParse({ ...valid, description: 'x'.repeat(161) }).success).toBe(false);
  });

  it('rejects an update date before the publication date', () => {
    expect(guideSchema.safeParse({ ...valid, updated: '2026-10-24' }).success).toBe(false);
  });

  it('builds edit links against the branch pull requests target', () => {
    expect(guideEditUrl('ricing')).toMatch(/\/edit\/dev\/guides\/ricing\.mdx$/);
  });
});

describe('registryStat', () => {
  it('counts consistently over the registry', () => {
    const n = (k: keyof typeof REGISTRY_STATS) => registryStat(k, registry);
    expect(n('entries')).toBe(registry.length);
    expect(n('installers')).toBeLessThanOrEqual(n('entries'));
    expect(n('full-rollback')).toBeLessThan(n('installers'));
    expect(n('sudo')).toBeGreaterThan(0);
    expect(n('aur')).toBeLessThanOrEqual(n('packages'));
    expect(n('packages')).toBeLessThanOrEqual(n('installers'));
    expect(n('upstream-installer')).toBeGreaterThan(0);
    expect(n('archived')).toBeGreaterThan(0);
  });
});

describe('describeImpact', () => {
  const of = (id: string) => {
    const data = registry.find((e) => e.id === id)!.data;
    return describeImpact(installDifficulty(data), installImpact(data));
  };

  it('summarises a complete desktop with its own installer', () => {
    const d = of('end-4/dots-hyprland');
    expect(d.changes).toContain("Runs the project's own installer");
    expect(d.short).toContain('own installer');
    expect(d.undo).toMatch(/not undone/);
  });

  it('says a reading list changes nothing', () => {
    const resource = registry.find((e) => installDifficulty(e.data) === null)!;
    expect(describeImpact(null, installImpact(resource.data))).toEqual({ changes: ['Nothing: it is a reading list.'], short: '—', undo: null });
  });
});
