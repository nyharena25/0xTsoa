/**
 * Submits URLs to IndexNow (Bing, Yandex, Naver, Seznam, Yep).
 *
 * Usage:
 *   npm run indexnow                              # every URL in the sitemap
 *   npm run indexnow -- --changed-since <sha>     # only pages affected by commits after <sha>
 *   add --dry-run to print the URLs without submitting them
 *
 * With --changed-since, a changed config sends its own page (also when it was deleted, so the
 * engine drops it) plus the home page and catalogue that list it. A changed guide sends its page
 * and the Docs index. A change to the site's code changes every page, so every sitemap URL is
 * sent. Anything else sends nothing.
 * Runs after every production deploy (.github/workflows/check-live.yml).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SITE_URL, withBase } from '../site.config';
import { GIT } from './git-path';

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '4f8b2e9a1c7d6035e8a4b2c9d1f7063a';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Paths whose change re-renders every page. src/generated only feeds sorting on the listing pages. */
const SITE_WIDE = [/^src\/(?!generated\/)/, /^astro\.config\.mjs$/, /^site\.config\.ts$/];
const LISTING_ONLY = [/^src\/generated\//, /^featured\.json$/];
const CONFIG_FILE = /^configs\/([^/]+)\/([^/]+)\.json$/;
/** guides/_template.mdx and other "_" files are never published. */
const GUIDE_FILE = /^guides\/([a-z0-9][a-z0-9-]*)\.mdx$/;

export interface FileChange {
  path: string;
}

/** `git diff --name-status` output → every path touched (both sides of a rename). */
export function parseNameStatus(output: string): FileChange[] {
  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => line.split('\t').slice(1))
    .map((p) => ({ path: p.trim() }))
    .filter((c) => c.path);
}

/** URLs to submit for a set of changed files; `all` holds every sitemap URL. */
export function selectIndexNowUrls(
  changes: FileChange[],
  all: string[],
  siteUrl: string = SITE_URL,
): { urls: string[]; reason: string } {
  const site = siteUrl.replace(/\/$/, '');
  const pageUrl = (p: string) => `${site}${withBase(p)}`;

  if (changes.some((c) => SITE_WIDE.some((re) => re.test(c.path)))) {
    return { urls: all, reason: 'site code changed: every page' };
  }

  const urls = new Set<string>();
  for (const c of changes) {
    const m = CONFIG_FILE.exec(c.path);
    if (m) urls.add(pageUrl(`/configs/${m[1]}/${m[2]}/`));
  }
  const configCount = urls.size;
  if (configCount > 0 || changes.some((c) => LISTING_ONLY.some((re) => re.test(c.path)))) {
    urls.add(pageUrl('/'));
    urls.add(pageUrl('/catalogue/'));
  }
  let guideCount = 0;
  for (const c of changes) {
    const m = GUIDE_FILE.exec(c.path);
    if (m && !urls.has(pageUrl(`/docs/${m[1]}/`))) {
      urls.add(pageUrl(`/docs/${m[1]}/`));
      guideCount++;
    }
  }
  if (guideCount > 0) urls.add(pageUrl('/docs/'));

  const reasons: string[] = [];
  if (configCount > 0) reasons.push(`${configCount} config page(s) changed, plus home and catalogue`);
  else if (urls.has(pageUrl('/catalogue/'))) reasons.push('listing data changed');
  if (guideCount > 0) reasons.push(`${guideCount} guide(s) changed, plus the Docs index`);
  return { urls: [...urls], reason: reasons.join('; ') || 'no page changed' };
}

/** Remote text is logged as data: strip control characters (no forged log lines) and cap its length. */
function forLog(value: unknown): string {
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 500);
}

function extractLocUrls(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1].trim()).filter(Boolean);
}

/** Every page URL, from the local build when there is one, else from the live sitemap. */
async function loadSitemapUrls(site: string): Promise<string[]> {
  const localSitemap = path.resolve(process.cwd(), 'dist', 'sitemap-0.xml');
  if (fs.existsSync(localSitemap)) {
    const urls = extractLocUrls(fs.readFileSync(localSitemap, 'utf-8'));
    if (urls.length > 0) {
      console.log(`[IndexNow] Loaded ${urls.length} URLs from dist/sitemap-0.xml`);
      return urls;
    }
  }

  const index = await fetch(`${site}/sitemap-index.xml`, { signal: AbortSignal.timeout(15000) });
  if (!index.ok) throw new Error(`Failed to fetch ${site}/sitemap-index.xml: HTTP ${index.status}`);
  const children = extractLocUrls(await index.text());
  const urls = (
    await Promise.all(
      children.map(async (child) => {
        const res = await fetch(child, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`Failed to fetch ${child}: HTTP ${res.status}`);
        return extractLocUrls(await res.text());
      }),
    )
  ).flat();
  console.log(`[IndexNow] Loaded ${urls.length} URLs from ${site}/sitemap-index.xml`);
  return urls;
}

/** Files changed between `since` and HEAD, or null when `since` is not a commit we have. */
function changedFiles(since: string): FileChange[] | null {
  if (!/^[0-9a-f]{7,40}$/i.test(since)) return null;
  try {
    return parseNameStatus(execFileSync(GIT, ['diff', '--name-status', `${since}..HEAD`], { encoding: 'utf-8' }));
  } catch {
    return null;
  }
}

async function main() {
  const site = SITE_URL.replace(/\/$/, '');
  const argv = process.argv.slice(2);
  const sinceIdx = argv.indexOf('--changed-since');
  const since = sinceIdx >= 0 ? (argv[sinceIdx + 1] ?? '').trim() : null;

  const all = await loadSitemapUrls(site);
  let urlList = all;
  if (since !== null) {
    const changes = changedFiles(since);
    if (changes === null) {
      console.log(`[IndexNow] No usable previous deploy (${forLog(since) || 'none'}): submitting every page.`);
    } else {
      const picked = selectIndexNowUrls(changes, all, site);
      console.log(`[IndexNow] ${changes.length} file(s) changed since ${since.slice(0, 7)}: ${picked.reason}.`);
      urlList = picked.urls;
    }
  }

  if (urlList.length === 0) {
    console.log('[IndexNow] Nothing to submit.');
    return;
  }
  if (argv.includes('--dry-run')) {
    const list = urlList.map((u) => '  ' + u).join('\n');
    console.log(`[IndexNow] Dry run, not submitted:\n${list}`);
    return;
  }

  const host = new URL(site).hostname;
  const payload = { host, key: INDEXNOW_KEY, keyLocation: `${site}/${INDEXNOW_KEY}.txt`, urlList };
  console.log(`[IndexNow] Submitting ${urlList.length} URLs for host "${host}" to ${INDEXNOW_ENDPOINT}...`);

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  if (response.ok || response.status === 202) {
    console.log(`[IndexNow] Success (HTTP ${response.status}). Submitted ${urlList.length} URLs.`);
  } else {
    const body = await response.text().catch(() => '');
    console.error(`[IndexNow] Failed with HTTP ${response.status}: ${forLog(body)}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('indexnow.ts')) {
  try {
    await main();
  } catch (err) {
    console.error('[IndexNow] Error:', forLog(err instanceof Error ? err.message : err));
    process.exit(1);
  }
}
