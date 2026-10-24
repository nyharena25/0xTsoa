#!/usr/bin/env node
/**
 * Submits all URLs from the built sitemap (or live sitemap) to IndexNow
 * (Bing, Yandex, Naver, Seznam, Yep).
 *
 * Usage:
 *   npm run indexnow
 */
import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = (process.env.SITE_URL || 'https://www.0xtsoa.dev').replace(/\/$/, '');
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '4f8b2e9a1c7d6035e8a4b2c9d1f7063a';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Remote text is logged as data: strip control characters (no forged log lines) and cap its length. */
function forLog(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 500);
}

function extractLocUrls(xml) {
  const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
  return Array.from(matches, (m) => m[1].trim()).filter(Boolean);
}

async function loadSitemapUrls() {
  const distDir = path.resolve(process.cwd(), 'dist');
  const localSitemap0 = path.join(distDir, 'sitemap-0.xml');

  if (fs.existsSync(localSitemap0)) {
    const xml = fs.readFileSync(localSitemap0, 'utf-8');
    const urls = extractLocUrls(xml);
    if (urls.length > 0) {
      console.log(`[IndexNow] Loaded ${urls.length} URLs from local dist/sitemap-0.xml`);
      return urls;
    }
  }

  const remoteSitemapUrl = `${SITE_URL}/sitemap-0.xml`;
  console.log(`[IndexNow] Local dist/sitemap-0.xml not found; fetching ${remoteSitemapUrl}...`);
  const res = await fetch(remoteSitemapUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${remoteSitemapUrl}: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const urls = extractLocUrls(xml);
  console.log(`[IndexNow] Loaded ${urls.length} URLs from ${remoteSitemapUrl}`);
  return urls;
}

async function main() {
  const urlList = await loadSitemapUrls();
  if (urlList.length === 0) {
    console.error('[IndexNow] No URLs found in sitemap.');
    process.exit(1);
  }

  const host = new URL(SITE_URL).hostname;
  const keyLocation = `${SITE_URL}/${INDEXNOW_KEY}.txt`;

  const payload = {
    host,
    key: INDEXNOW_KEY,
    keyLocation,
    urlList,
  };

  console.log(`[IndexNow] Submitting ${urlList.length} URLs for host "${host}" to ${INDEXNOW_ENDPOINT}...`);

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
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

main().catch((err) => {
  console.error('[IndexNow] Error:', forLog(err instanceof Error ? err.message : err));
  process.exit(1);
});
