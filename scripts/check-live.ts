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
  const attrRe = new RegExp(String.raw`\s${attr}=["']([^"']*)["']`, 'i');
  for (const [tag] of html.matchAll(tagPattern)) {
    const m = attrRe.exec(tag);
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
    .map((l) => /^\s*sitemap:\s*(\S+)/i.exec(l)?.[1])
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

type Response = Awaited<ReturnType<typeof get>>;

/** Collects failures and prints each result as it is reported. */
class Report {
  readonly failures: string[] = [];
  fail(what: string, why: string): void {
    this.failures.push(`${what}: ${why}`);
    console.error(`  ✖ ${what}: ${why}`);
  }
  ok(what: string): void {
    console.log(`  ✓ ${what}`);
  }
}

function statusText(res: Response): string {
  const target = res.location ? ` → ${res.location}` : '';
  return `expected 200, got ${res.status}${target}`;
}

/** robots.txt must answer 200 and point to the sitemap index only. */
async function checkRobots(report: Report, siteUrl: string, sitemapIndexUrl: string): Promise<void> {
  const robots = await get(`${siteUrl}/robots.txt`);
  if (robots.status !== 200) return report.fail('robots.txt', statusText(robots));
  const lines = extractSitemapLines(robots.body);
  if (lines.length === 0) report.fail('robots.txt', 'no Sitemap: line');
  else if (lines.some((l) => l !== sitemapIndexUrl)) report.fail('robots.txt', `Sitemap: ${lines.join(', ')} (expected ${sitemapIndexUrl})`);
  else report.ok(`robots.txt points to ${sitemapIndexUrl}`);
}

/** Every sitemap must list SITE_URL URLs only. Returns the page URLs they list. */
async function checkSitemaps(report: Report, siteUrl: string, sitemapIndexUrl: string): Promise<string[]> {
  const index = await get(sitemapIndexUrl);
  if (index.status !== 200) {
    report.fail('sitemap-index.xml', statusText(index));
    return [];
  }
  const children = extractLocs(index.body);
  const badChildren = foreignUrls(children, siteUrl);
  if (children.length === 0) report.fail('sitemap-index.xml', 'lists no sitemaps');
  if (badChildren.length) report.fail('sitemap-index.xml', `lists other hosts: ${badChildren.slice(0, 3).join(', ')}`);

  const own = children.filter((c) => !badChildren.includes(c));
  const sitemaps = await Promise.all(own.map(get));
  const pageUrls: string[] = [];
  sitemaps.forEach((sm, i) => {
    if (sm.status !== 200) return report.fail(own[i], statusText(sm));
    const locs = extractLocs(sm.body);
    const bad = foreignUrls(locs, siteUrl);
    if (bad.length) report.fail(own[i], `${bad.length} URL(s) on another host, e.g. ${bad[0]}`);
    else report.ok(`${own[i]}: ${locs.length} URLs, all on ${siteUrl}`);
    pageUrls.push(...locs.filter((l) => !bad.includes(l)));
  });
  return pageUrls;
}

/** A page must answer 200 itself and declare itself canonical. */
function checkPage(report: Report, url: string, res: Response): void {
  if (res.status !== 200) return report.fail(url, statusText(res));
  const canonical = extractCanonical(res.body);
  if (canonical !== url) return report.fail(url, `canonical is ${canonical ?? '(missing)'}`);
  const ogUrl = extractOgUrl(res.body);
  if (ogUrl !== null && ogUrl !== url) return report.fail(url, `og:url is ${ogUrl}`);
  report.ok(`${url} answers 200 and is its own canonical`);
}

/** Each former host must send `paths` to the same path on SITE_URL in one permanent redirect. */
async function checkRedirects(report: Report, siteUrl: string, redirectHosts: string[], paths: string[]): Promise<void> {
  const checks = redirectHosts.flatMap((host) => paths.map((p) => ({ from: `https://${host}${p}`, expected: `${siteUrl}${p}` })));
  const responses = await Promise.all(checks.map((c) => get(c.from)));
  checks.forEach(({ from, expected }, i) => {
    const res = responses[i];
    const problem = redirectProblem(res.status, res.location, expected);
    if (problem) report.fail(from, problem);
    else report.ok(`${from} → ${res.location} (${res.status})`);
  });
}

/** Runs every check once and returns the failures (empty = healthy). */
async function runChecks(siteUrl: string, redirectHosts: string[]): Promise<string[]> {
  const report = new Report();
  const sitemapIndexUrl = `${siteUrl}/sitemap-index.xml`;
  await checkRobots(report, siteUrl, sitemapIndexUrl);
  const pageUrls = await checkSitemaps(report, siteUrl, sitemapIndexUrl);

  const configUrls = pageUrls.filter((u) => u.includes('/configs/'));
  // Spread the sample across the list, so a broken template anywhere in it shows up.
  const sample = Array.from({ length: Math.min(CONFIG_SAMPLE, configUrls.length) }, (_, i) =>
    configUrls[Math.floor((i * configUrls.length) / CONFIG_SAMPLE)],
  );
  const pages = [`${siteUrl}/`, `${siteUrl}/catalogue/`, ...sample];
  const responses = await Promise.all(pages.map(get));
  pages.forEach((url, i) => checkPage(report, url, responses[i]));

  const redirectPaths = ['/', '/catalogue/', ...(sample[0] ? [new URL(sample[0]).pathname] : [])];
  await checkRedirects(report, siteUrl, redirectHosts, redirectPaths);
  return report.failures;
}

async function safeChecks(siteUrl: string): Promise<string[]> {
  try {
    return await runChecks(siteUrl, REDIRECT_HOSTS);
  } catch (err) {
    const failures = [`network error: ${(err as Error).message}`];
    console.error(`  ✖ ${failures[0]}`);
    return failures;
  }
}

/** Right after a deploy, the domains can take a few seconds to point at the new build: retry. */
async function checkWithRetries(siteUrl: string, attempt = 1): Promise<boolean> {
  const failures = await safeChecks(siteUrl);
  if (failures.length === 0) return true;
  if (attempt >= ATTEMPTS) {
    console.error(`✖ ${failures.length} problem(s) on the live site.`);
    return false;
  }
  console.log(`${failures.length} problem(s); retrying in ${RETRY_DELAY_MS / 1000}s (attempt ${attempt + 1}/${ATTEMPTS})…`);
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  return checkWithRetries(siteUrl, attempt + 1);
}

if (process.argv[1]?.endsWith('check-live.ts')) {
  const siteUrl = SITE_URL.replace(/\/$/, '');
  console.log(`Checking ${siteUrl} (redirect hosts: ${REDIRECT_HOSTS.join(', ') || 'none'})`);
  try {
    if (await checkWithRetries(siteUrl)) console.log('✓ Live site is consistent.');
    else process.exit(1);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
