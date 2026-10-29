import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  planOutreach,
  joinNames,
  readTemplate,
  renderTemplate,
  renderMessage,
  postUrl,
  LARGE_PROJECT_STARS,
  MAX_POST_URL,
  type OutreachEntry,
} from '../scripts/outreach';

const entry = (id: string, over: Partial<OutreachEntry> = {}): OutreachEntry => ({
  id,
  name: id.split('/')[1],
  repo: `https://github.com/${id}`,
  stars: 100,
  maintenance: null,
  verified: false,
  missingScreenshot: false,
  ...over,
});

const template = readTemplate(fs.readFileSync('docs/OUTREACH.md', 'utf-8'));

describe('outreach plan', () => {
  it('sends one message per author, skipping verified, archived and already contacted authors', () => {
    const plan = planOutreach(
      [
        entry('alice/dots', { stars: 50 }),
        entry('alice/bar', { stars: 900 }),
        entry('bob/theme', { verified: true }),
        entry('carol/old', { maintenance: 'archived' }),
        entry('dave/wm'),
        entry('erin/mixed', { maintenance: 'archived' }),
        entry('erin/live'),
      ],
      new Set(['dave']),
    );
    expect(plan.authors.map((a) => a.github)).toEqual(['alice', 'erin']);
    expect(plan.authors[0].entries.map((e) => e.id)).toEqual(['alice/bar', 'alice/dots']);
    expect(plan.authors[0].main.id).toBe('alice/bar');
    expect(plan.authors[1].entries.map((e) => e.id)).toEqual(['erin/live']);
    expect(plan.skipped).toEqual([
      { github: 'dave', reason: 'already contacted' },
      { github: 'bob', reason: 'already verified' },
      { github: 'carol', reason: 'archived upstream' },
    ]);
  });

  it('puts maintained authors first, then the most starred, and large projects last', () => {
    const plan = planOutreach([
      entry('quiet/a', { maintenance: 'quiet', stars: 5000 }),
      entry('nodata/b', { stars: 10 }),
      entry('active/c', { maintenance: 'active', stars: 20 }),
      entry('huge/d', { maintenance: 'active', stars: LARGE_PROJECT_STARS }),
      entry('nodata/e2', { stars: 300 }),
    ]);
    expect(plan.authors.map((a) => a.github)).toEqual(['active', 'nodata', 'quiet', 'huge']);
    expect(plan.authors.at(-1)!.large).toBe(true);
  });
});

describe('outreach message', () => {
  it('joins names, shortening long lists', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
  });

  it('keeps flagged lines only when the flag is set, and indents multi-line values', () => {
    const t = 'a\n{{?x}}b {{v}}\n  c: {{v}}';
    expect(renderTemplate(t, { v: '1\n2' }, { x: false })).toBe('a\n  c: 1\n  2');
    expect(renderTemplate(t, { v: '1' }, { x: true })).toBe('a\nb 1\n  c: 1');
    expect(() => renderTemplate('{{nope}}', {}, {})).toThrow(/Unknown template placeholder/);
  });

  it('fills every placeholder of the template in docs/OUTREACH.md', () => {
    const plan = planOutreach([entry('alice/dots', { name: 'Paper Dots', missingScreenshot: true }), entry('alice/bar', { name: 'Paper Bar' })]);
    const m = renderMessage(template, plan.authors[0]);
    expect(m.title).toBe('Paper Bar and Paper Dots are listed on 0xTsoa');
    expect(m.body).not.toMatch(/\{\{/);
    expect(m.body).toContain('Hi @alice,');
    expect(m.body).toContain('I listed them on');
    expect(m.body).toContain('https://0xtsoa.dev/configs/alice/dots/');
    expect(m.body).toContain('template=claim-entry.yml');
    expect(m.body).toContain('Send a screenshot');
    expect(m.body).toMatch(/\n {2}\[!\[Indexed on 0xTsoa\]\(.+\/configs\/alice\/bar\/\)\n {2}\[!\[Indexed on 0xTsoa\]\(.+\/configs\/alice\/dots\/\)/);
  });

  it('asks for a screenshot only when a page has none', () => {
    const plan = planOutreach([entry('bob/theme')]);
    const m = renderMessage(template, plan.authors[0]);
    expect(m.title).toBe('theme is listed on 0xTsoa');
    expect(m.body).toContain('I listed it on');
    expect(m.body).not.toContain('screenshot');
  });
});

describe('where to post', () => {
  const author = (over: Partial<OutreachEntry> = {}) => planOutreach([entry('alice/dots', over)]).authors[0];
  const msg = { title: 'T', body: 'B' };

  it('opens a prefilled issue by default, and a discussion when the repository has them', () => {
    const a = author();
    expect(postUrl(a, msg)).toBe('https://github.com/alice/dots/issues/new?title=T&body=B');
    a.facts = { hasIssues: true, hasDiscussions: true, archived: false };
    expect(postUrl(a, msg)).toBe('https://github.com/alice/dots/discussions/new?category=general&title=T&body=B');
  });

  it('gives no link off GitHub, with Issues and Discussions off, or past the URL limit', () => {
    expect(postUrl(author({ repo: 'https://codeberg.org/alice/dots' }), msg)).toBeNull();
    const off = author();
    off.facts = { hasIssues: false, hasDiscussions: false, archived: false };
    expect(postUrl(off, msg)).toBeNull();
    expect(postUrl(author(), { title: 'T', body: 'x'.repeat(MAX_POST_URL) })).toBeNull();
  });
});
