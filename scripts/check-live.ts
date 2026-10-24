/**
 * Checks the deployed site the way a search engine sees it, and fails when the signals disagree:
 *  - SITE_URL pages answer 200 directly, and their canonical / og:url point to themselves;
 *  - robots.txt and every sitemap only list SITE_URL URLs;
 *  - each REDIRECT_HOSTS host sends the same path to SITE_URL in one permanent (301/308) redirect.
 * A canonical or sitemap URL that redirects is what kept Bing from crawling the site after the
 * domain move. Runs after every production deploy and nightly (.github/workflows/check-live.yml).
 */
import { SITE_URL, REDIRECT_HOSTS } from '../site.config';

const TIMEOUT_MS = 15_000;
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 30_000;
// Config pages checked one by one (the sitemap check already covers every URL's host).
const CONFIG_SAMPLE = 3;
const HEADERS = { 'User-Agent': '0xTsoa-LiveCheck/1.0 (+https://github.com/nyharena25/0xTsoa)' };

/** Value of `attr` in the first tag matching `tagPattern`, whatever the attribute order. */
function attrOf(html: string, tagPattern: RegExp, attr: string): string | null {
  for (const tag of html.match(tagPattern) ?? []) {
    const m = tag.match(new RegExp(`\\s${attr}=["']([^"']*)["']`, 'i'));
    if (m) return m[1];
  }
  return null;
}

export function extractCanonical(html: string): string | null {
  return attrOf(html, /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, 'href');
}

export function extractOgUrl(html: string): string | null {
  return attrOf(html, /<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/gi, 'content');
}

export function extractLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g), (m) => m[1]);
}

export function extractSitemapLines(robots: string): string[] {
  return robots
    .split('\n')
    .map((l) => l.match(/^\s*sitemap:\s*(\S+)/i)?.[1])
    .filter((v): v is string => Boolean(v));
}

/** URLs that are not under `siteUrl` (another host, or http). */
export function foreignUrls(urls: string[], siteUrl: string): string[] {
  const prefix = `${siteUrl.replace(/\/$/, '')}/`;
  return urls.filter((u) => !u.startsWith(prefix));
}

/** Why a response is not a single permanent redirect to `expected`, or null when it is. */
export function redirectProblem(status: number, location: string | null, expected: string): string | null {
  if (status !== 301 && status !== 308) {
    return status === 302 || status === 307
      ? `temporary redirect (${status}): search engines keep the old URL; make it 308 in Vercel → Domains`
      : `expected a 308 redirect, got ${status}`;
  }
  if (location !== expected) return `redirects to ${location ?? '(no Location header)'}, expected ${expected}`;
  return null;
}

async function get(url: string): Promise<{ status: number; location: string | null; body: string }> {
  const res = await fetch(url, { redirect: 'manual', headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = res.status === 200 ? await res.text() : '';
  return { status: res.status, location: res.headers.get('location'), body };
}

/** Runs every check once and returns the failures (empty = healthy). */
async function runChecks(siteUrl: string, redirectHosts: string[]): Promise<string[]> {
  const failures: string[] = [];
  const fail = (what: string, why: string) => {
    failures.push(`${what}: ${why}`);
    console.error(`  ✖ ${what}: ${why}`);
  };
  const ok = (what: string) => console.log(`  ✓ ${what}`);

  /** A page must answer 200 itself and declare itself canonical. */
  const checkPage = async (url: string) => {
    const res = await get(url);
    if (res.status !== 200) return fail(url, `expected 200, got ${res.status}${res.location ? ` → ${res.location}` : ''}`);
    const canonical = extractCanonical(res.body);
    if (canonical !== url) return fail(url, `canonical is ${canonical ?? '(missing)'}`);
    const ogUrl = extractOgUrl(res.body);
    if (ogUrl !== null && ogUrl !== url) return fail(url, `og:url is ${ogUrl}`);
    ok(`${url} answers 200 and is its own canonical`);
  };

  const sitemapIndexUrl = `${siteUrl}/sitemap-index.xml`;

  const robots = await get(`${siteUrl}/robots.txt`);
  if (robots.status !== 200) {
    fail('robots.txt', `expected 200, got ${robots.status}`);
  } else {
    const lines = extractSitemapLines(robots.body);
    if (lines.length === 0) fail('robots.txt', 'no Sitemap: line');
    else if (lines.some((l) => l !== sitemapIndexUrl)) fail('robots.txt', `Sitemap: ${lines.join(', ')} (expected ${sitemapIndexUrl})`);
    else ok(`robots.txt points to ${sitemapIndexUrl}`);
  }

  const pageUrls: string[] = [];
  const index = await get(sitemapIndexUrl);
  if (index.status !== 200) {
    fail('sitemap-index.xml', `expected 200, got ${index.status}`);
  } else {
    const children = extractLocs(index.body);
    const badChildren = foreignUrls(children, siteUrl);
    if (children.length === 0) fail('sitemap-index.xml', 'lists no sitemaps');
    if (badChildren.length) fail('sitemap-index.xml', `lists other hosts: ${badChildren.slice(0, 3).join(', ')}`);
    for (const child of children.filter((c) => !badChildren.includes(c))) {
      const sm = await get(child);
      if (sm.status !== 200) {
        fail(child, `expected 200, got ${sm.status}`);
        continue;
      }
      const locs = extractLocs(sm.body);
      const bad = foreignUrls(locs, siteUrl);
      if (bad.length) fail(child, `${bad.length} URL(s) on another host, e.g. ${bad[0]}`);
      else ok(`${child}: ${locs.length} URLs, all on ${siteUrl}`);
      pageUrls.push(...locs.filter((l) => !bad.includes(l)));
    }
  }

  const configUrls = pageUrls.filter((u) => u.includes('/configs/'));
  // Spread the sample across the list, so a broken template anywhere in it shows up.
  const sample = Array.from({ length: Math.min(CONFIG_SAMPLE, configUrls.length) }, (_, i) =>
    configUrls[Math.floor((i * configUrls.length) / CONFIG_SAMPLE)],
  );
  for (const url of [`${siteUrl}/`, `${siteUrl}/catalogue/`, ...sample]) await checkPage(url);

  const redirectPaths = ['/', '/catalogue/', ...(sample[0] ? [new URL(sample[0]).pathname] : [])];
  for (const host of redirectHosts) {
    for (const p of redirectPaths) {
      const from = `https://${host}${p}`;
      const res = await get(from);
      const problem = redirectProblem(res.status, res.location, `${siteUrl}${p}`);
      if (problem) fail(from, problem);
      else ok(`${from} → ${res.location} (${res.status})`);
    }
  }

  return failures;
}

async function main() {
  const siteUrl = SITE_URL.replace(/\/$/, '');
  console.log(`Checking ${siteUrl} (redirect hosts: ${REDIRECT_HOSTS.join(', ') || 'none'})`);

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let failures: string[];
    try {
      failures = await runChecks(siteUrl, REDIRECT_HOSTS);
    } catch (err) {
      failures = [`network error: ${(err as Error).message}`];
      console.error(`  ✖ ${failures[0]}`);
    }
    if (failures.length === 0) {
      console.log('✓ Live site is consistent.');
      return;
    }
    // Right after a deploy, the domains can take a few seconds to point at the new build.
    if (attempt < ATTEMPTS) {
      console.log(`${failures.length} problem(s); retrying in ${RETRY_DELAY_MS / 1000}s (attempt ${attempt + 1}/${ATTEMPTS})…`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    } else {
      console.error(`✖ ${failures.length} problem(s) on the live site.`);
      process.exit(1);
    }
  }
}

if (process.argv[1]?.endsWith('check-live.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
