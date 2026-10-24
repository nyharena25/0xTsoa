import { describe, it, expect } from 'vitest';
import { parseNameStatus, selectIndexNowUrls } from '../scripts/indexnow';

const SITE = 'https://www.0xtsoa.dev';
const ALL = [`${SITE}/`, `${SITE}/about/`, `${SITE}/catalogue/`, `${SITE}/configs/a/b/`, `${SITE}/configs/c/d/`];
const changes = (...paths: string[]) => paths.map((path) => ({ path }));

describe('parseNameStatus', () => {
  it('keeps every touched path, including both sides of a rename', () => {
    const out = 'M\tconfigs/a/b.json\nD\tconfigs/x/y.json\nR100\tconfigs/old/one.json\tconfigs/new/one.json\n';
    expect(parseNameStatus(out).map((c) => c.path)).toEqual([
      'configs/a/b.json',
      'configs/x/y.json',
      'configs/old/one.json',
      'configs/new/one.json',
    ]);
  });

  it('returns nothing for an empty diff', () => {
    expect(parseNameStatus('')).toEqual([]);
  });
});

describe('selectIndexNowUrls', () => {
  it('sends a changed config page with the pages that list it', () => {
    const { urls } = selectIndexNowUrls(changes('configs/a/b.json', 'README.md'), ALL, SITE);
    expect(urls).toEqual([`${SITE}/configs/a/b/`, `${SITE}/`, `${SITE}/catalogue/`]);
  });

  it('also sends deleted config pages, so engines drop them', () => {
    const { urls } = selectIndexNowUrls(changes('configs/gone/away.json'), ALL, SITE);
    expect(urls).toContain(`${SITE}/configs/gone/away/`);
  });

  it('sends every page when the site code changes', () => {
    expect(selectIndexNowUrls(changes('src/layouts/Base.astro'), ALL, SITE).urls).toEqual(ALL);
    expect(selectIndexNowUrls(changes('site.config.ts'), ALL, SITE).urls).toEqual(ALL);
  });

  it('sends only the listing pages for vote and star data', () => {
    const { urls } = selectIndexNowUrls(changes('src/generated/repo-stats.json'), ALL, SITE);
    expect(urls).toEqual([`${SITE}/`, `${SITE}/catalogue/`]);
  });

  it('sends nothing when no page changed', () => {
    const picked = selectIndexNowUrls(changes('.github/workflows/validate.yml', 'tests/x.test.ts', 'docs/a.md'), ALL, SITE);
    expect(picked.urls).toEqual([]);
    expect(picked.reason).toBe('no page changed');
  });

  it('ignores JSON outside configs/<author>/<slug>.json', () => {
    expect(selectIndexNowUrls(changes('configs/LICENSE', 'schema/example.config.json'), ALL, SITE).urls).toEqual([]);
  });
});
