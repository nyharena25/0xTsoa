import { describe, it, expect } from 'vitest';
import { relatedConfigs, maintainedAlternatives, relatednessScore, type RelatedEntry } from '../src/lib/related';
import { topLevelBlocks, readmeExcerpt, nestReadmeHeadings, sanitizeAndRewriteHtml, extractScreenshotsFromReadme, renderMarkdownToGithubHtml, README_IMAGE_ALT } from '../src/lib/readme';
import { maintenanceForConfig } from '../src/lib/stats';
import { configSchema, type ConfigData } from '../src/lib/schema';

const make = (id: string, over: Partial<ConfigData>): RelatedEntry => ({
  id,
  data: {
    ...configSchema.parse({
      name: id,
      author: { name: 'A', github: 'a' },
      summary: 'A test entry for related configs.',
      license: 'MIT',
      updatedAt: '2026-10-01',
      distros: ['any'],
      category: 'bar',
      wm: 'any',
      displayServer: 'wayland',
      themeStyle: 'other',
      screenshots: [{ url: '/p.png', alt: 'preview' }],
      source: { repo: 'https://github.com/a/b', ref: 'v1.0.0' },
      install: { steps: [{ id: 'deps', title: 'Install', commands: ['sudo pacman -S waybar'] }] },
    }),
    ...over,
  },
});

describe('relatedConfigs', () => {
  const current = make('me/hypr-bar', { category: 'bar', wm: 'hyprland', tags: ['waybar', 'archived'] });
  const all = [
    current,
    make('a/other-bar', { category: 'bar' }),
    make('b/hypr-dots', { category: 'dotfiles', wm: 'hyprland' }),
    make('c/hypr-bar-archived', { category: 'bar', wm: 'hyprland', tags: ['archived'] }),
    make('d/hypr-bar-live', { category: 'bar', wm: 'hyprland' }),
    make('e/icons', { category: 'icons' }),
  ];
  const opts = {
    stars: (id: string) => ({ 'a/other-bar': 50, 'b/hypr-dots': 900 })[id] ?? 0,
    status: (_id: string, data: ConfigData) => (data.tags.includes('archived') ? ('archived' as const) : null),
  };

  it('ranks by what they share, maintained before archived, and skips unrelated entries', () => {
    expect(relatedConfigs(current, all, opts).map((e) => e.id)).toEqual(['d/hypr-bar-live', 'c/hypr-bar-archived', 'a/other-bar', 'b/hypr-dots']);
  });

  it('ignores the "archived" tag when scoring', () => {
    expect(relatednessScore(current.data, all[3].data)).toBe(relatednessScore(current.data, all[4].data));
  });

  it('offers maintained alternatives of the same category for an archived entry', () => {
    expect(maintainedAlternatives(current, all, opts).map((e) => e.id)).toEqual(['d/hypr-bar-live', 'a/other-bar']);
  });

  it('never offers an X11-only alternative for a Wayland-only entry', () => {
    const x11 = make('f/x11-bar', { category: 'bar', displayServer: 'x11' });
    const both = make('g/any-bar', { category: 'bar', displayServer: 'both' });
    const ids = maintainedAlternatives(current, [...all, x11, both], { ...opts, limit: 5 }).map((e) => e.id);
    expect(ids).not.toContain('f/x11-bar');
    expect(ids).toContain('g/any-bar');
  });
});

describe('maintenanceForConfig', () => {
  it('falls back to the hand-written tag until the sync has data', () => {
    expect(maintenanceForConfig('nobody/unknown', ['archived'])).toBe('archived');
    expect(maintenanceForConfig('nobody/unknown', ['waybar'])).toBeNull();
  });
});

describe('README excerpt', () => {
  it('splits sanitized HTML into top-level blocks, nested and void tags included', () => {
    const html = '<h1>Title</h1>\n<p>Intro <a href="x">link</a> text</p>\n<ul><li><ul><li>deep</li></ul></li></ul>\n<img src="a.png" alt="a > b">\n<hr />loose text';
    expect(topLevelBlocks(html)).toEqual([
      '<h1>Title</h1>',
      '<p>Intro <a href="x">link</a> text</p>',
      '<ul><li><ul><li>deep</li></ul></li></ul>',
      '<img src="a.png" alt="a > b">',
      '<hr />',
      'loose text',
    ]);
  });

  it('keeps the opening up to the word budget and says it was cut', () => {
    const para = (n: number) => `<p>${Array.from({ length: n }, (_, i) => `w${i}`).join(' ')}</p>`;
    const html = ['<h1>Name</h1>', para(60), para(60), '<h2>Install</h2>', para(200)].join('\n');
    const out = readmeExcerpt(html, 220);
    expect(out.truncated).toBe(true);
    expect(out.html).toContain('<h1>Name</h1>');
    expect(out.html).not.toContain('Install');
  });

  it('never ends on a heading, and returns short READMEs whole', () => {
    const html = '<p>one two three</p><h2>Usage</h2><p>' + 'x '.repeat(300) + '</p>';
    expect(readmeExcerpt(html, 50).html).toBe('<p>one two three</p>');
    expect(readmeExcerpt('<p>short</p>', 50)).toEqual({ html: '<p>short</p>', truncated: false });
  });

  it('keeps at least the first block, even when it is long', () => {
    const big = `<p>${'word '.repeat(500)}</p>`;
    expect(readmeExcerpt(big + '<p>next</p>', 100).html).toBe(big);
  });
});

describe('tools and reading lists', () => {
  const opts = { stars: () => 0, status: () => null };
  it('need more than the shared category to count as related', () => {
    const swww = make('lgfae/swww', { category: 'tool', tags: ['wallpaper'] });
    const all = [swww, make('h/hyprpaper', { category: 'tool', tags: ['wallpaper'] }), make('f/fastfetch', { category: 'tool', tags: ['fetch'] })];
    expect(relatedConfigs(swww, all, opts).map((e) => e.id)).toEqual(['h/hyprpaper']);
    expect(maintainedAlternatives(swww, all, opts).map((e) => e.id)).toEqual(['h/hyprpaper']);
  });
});

describe('nestReadmeHeadings', () => {
  const levels = (html: string) => [...html.matchAll(/<h(\d)/g)].map((m) => Number(m[1]));

  it('starts at h3 and closes each heading at its new level', () => {
    expect(nestReadmeHeadings('<h1 id="a">A</h1>')).toBe('<h3 id="a">A</h3>');
  });

  it('removes skipped levels but keeps the nesting', () => {
    expect(levels(nestReadmeHeadings('<h1>A</h1><h3>B</h3><h3>C</h3><h2>D</h2><h5>E</h5>'))).toEqual([3, 4, 4, 4, 5]);
  });

  it('never goes past h6', () => {
    expect(levels(nestReadmeHeadings('<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6>'))).toEqual([3, 4, 5, 6, 6, 6]);
  });

  it('ignores text that only looks like a heading', () => {
    const html = '<p title="<h1>">x</p><pre>&lt;h1&gt;</pre>';
    expect(nestReadmeHeadings(html)).toBe(html);
  });
});

describe('README image alt text', () => {
  const root = 'https://raw.githubusercontent.com/u/r/abc/';
  const clean = (html: string) => sanitizeAndRewriteHtml(html, root, root, root, root);

  it('fills in missing and blank alt text', () => {
    expect(clean('<img src="https://example.com/a.png">')).toContain(`alt="${README_IMAGE_ALT}"`);
    expect(clean('<img src="https://example.com/a.png" alt=" ">')).toContain(`alt="${README_IMAGE_ALT}"`);
  });

  it('keeps alt text the author wrote', () => {
    expect(clean('<img src="https://example.com/a.png" alt="Lock screen">')).toContain('alt="Lock screen"');
  });

  it('does not show the fallback as a screenshot caption', () => {
    const [shot] = extractScreenshotsFromReadme(clean(`<img src="${root}preview.png">`));
    expect(shot?.alt).toBe('Desktop showcase capture');
  });
});

describe('README link contents', () => {
  const root = 'https://raw.githubusercontent.com/u/r/abc/';
  const blob = 'https://github.com/u/r/blob/abc/';
  const render = async (md: string) => (await renderMarkdownToGithubHtml(md, root, blob, root, blob, root + 'README.md')).html;

  it('renders a linked badge as an image, not as markdown text', async () => {
    const html = await render('# Waybar [![Licence](https://img.shields.io/x.svg)](LICENSE)');
    expect(html).not.toContain('![');
    expect(html).toContain('<img src="https://img.shields.io/x.svg" alt="Licence"');
    expect(html).toContain(`href="${blob}LICENSE"`);
  });

  it('renders inline formatting inside a link', async () => {
    const html = await render('[**bold** and `code`](https://example.com/)');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('escapes markup in link text', async () => {
    expect(await render('[a <b](https://example.com/)')).not.toContain('<b>');
  });
});
