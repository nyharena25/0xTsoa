import { describe, it, expect } from 'vitest';
import {
  extractCanonical,
  extractOgUrl,
  extractLocs,
  extractSitemapLines,
  foreignUrls,
  redirectProblem,
} from '../scripts/check-live';

const SITE = 'https://0xtsoa.dev';

describe('extractCanonical / extractOgUrl', () => {
  it('reads the canonical href whatever the attribute order', () => {
    expect(extractCanonical(`<link rel="canonical" href="${SITE}/">`)).toBe(`${SITE}/`);
    expect(extractCanonical(`<link href="${SITE}/about/" rel='canonical' />`)).toBe(`${SITE}/about/`);
  });

  it('ignores other link tags and returns null without a canonical', () => {
    expect(extractCanonical('<link rel="icon" href="/x.svg"><link rel="sitemap" href="/s.xml">')).toBeNull();
  });

  it('reads og:url', () => {
    expect(extractOgUrl(`<meta property="og:type" content="website"><meta property="og:url" content="${SITE}/">`)).toBe(`${SITE}/`);
    expect(extractOgUrl('<meta name="description" content="x">')).toBeNull();
  });
});

describe('extractLocs / extractSitemapLines', () => {
  it('lists every <loc> of a sitemap or sitemap index', () => {
    const xml = `<urlset><url><loc>${SITE}/</loc></url><url><loc> ${SITE}/about/ </loc></url></urlset>`;
    expect(extractLocs(xml)).toEqual([`${SITE}/`, `${SITE}/about/`]);
  });

  it('reads Sitemap: lines case-insensitively and skips the rest of robots.txt', () => {
    const robots = `# comment\nUser-agent: *\nAllow: /\nsitemap: ${SITE}/sitemap-index.xml\n`;
    expect(extractSitemapLines(robots)).toEqual([`${SITE}/sitemap-index.xml`]);
  });
});

describe('foreignUrls', () => {
  it('flags other hosts, http and www, but not the site itself', () => {
    const urls = [
      `${SITE}/`,
      `${SITE}/configs/a/b/`,
      'https://0xtsoa.vercel.app/',
      'https://www.0xtsoa.dev/catalogue/',
      'http://0xtsoa.dev/',
      'https://0xtsoa.dev.evil.example/',
    ];
    expect(foreignUrls(urls, SITE)).toEqual(urls.slice(2));
    expect(foreignUrls(urls.slice(0, 2), `${SITE}/`)).toEqual([]);
  });
});

describe('redirectProblem', () => {
  it('accepts one permanent redirect to the expected URL', () => {
    expect(redirectProblem(308, `${SITE}/catalogue/`, `${SITE}/catalogue/`)).toBeNull();
    expect(redirectProblem(301, `${SITE}/`, `${SITE}/`)).toBeNull();
    expect(redirectProblem(308, '/contribute/', `${SITE}/contribute/`, `${SITE}/contribuer/`)).toBeNull();
  });

  it('rejects a relative Location header when redirecting from a foreign host', () => {
    expect(redirectProblem(308, '/catalogue/', `${SITE}/catalogue/`, 'https://0xtsoa.vercel.app/catalogue/')).toMatch(
      /expected https:\/\/0xtsoa\.dev\/catalogue\//,
    );
  });

  it('rejects temporary redirects with a hint', () => {
    expect(redirectProblem(302, `${SITE}/`, `${SITE}/`)).toMatch(/temporary redirect \(302\)/);
    expect(redirectProblem(307, `${SITE}/`, `${SITE}/`)).toMatch(/temporary/);
  });

  it('rejects a direct answer or a redirect to the wrong place', () => {
    expect(redirectProblem(200, null, `${SITE}/`)).toMatch(/got 200/);
    expect(redirectProblem(308, `${SITE}/`, `${SITE}/catalogue/`)).toMatch(/expected https:\/\/0xtsoa\.dev\/catalogue\//);
    expect(redirectProblem(308, null, `${SITE}/`)).toMatch(/no Location header/);
  });
});
