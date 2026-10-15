import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Interface representing user-submitted configuration metadata
 */
export interface UserSubmittedConfig {
  name: string;
  author?: {
    name?: string;
    github?: string;
  };
  summary?: string;
  description?: string;
  source: {
    repo: string;
    ref?: string;
    readme?: string;
  };
  screenshots?: Array<{
    url: string;
    alt?: string;
    caption?: string;
  }>;
  [key: string]: unknown;
}

/**
 * Screenshot discovered via the GitHub Contents API
 */
export interface DiscoveredScreenshot {
  url: string;
  name: string;
  alt: string;
  caption: string;
}

/**
 * Unified enriched payload consumed by the static site generator
 */
export interface UnifiedConfigPayload extends UserSubmittedConfig {
  id: string;
  github: {
    owner: string;
    repo: string;
    ref?: string;
  };
  readmeHtml: string;
  discoveredScreenshots: DiscoveredScreenshot[];
  screenshots: Array<{
    url: string;
    alt?: string;
    caption?: string;
  }>;
  ingestedAt: string;
}

/**
 * Supported image extensions for screenshot auto-discovery
 */
const IMAGE_EXTENSIONS_REGEX = /\.(png|jpe?g|webp)$/i;

/**
 * Extracts the GitHub owner and repository name from various URL formats:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 * - owner/repo (shorthand)
 */
export function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } {
  if (!repoUrl || typeof repoUrl !== 'string') {
    throw new Error('Repository URL must be a non-empty string');
  }

  const clean = repoUrl.trim().replace(/\/+$/, '').replace(/\.git$/, '');

  // Match full URL (http, https, or git ssh)
  const urlMatch = clean.match(/github\.com[:/]([^/]+)\/([^/]+)$/);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
    };
  }

  // Match shorthand format "owner/repo"
  const shorthandMatch = clean.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shorthandMatch) {
    return {
      owner: shorthandMatch[1],
      repo: shorthandMatch[2],
    };
  }

  throw new Error(`Invalid GitHub repository URL: "${repoUrl}". Expected format: "https://github.com/owner/repo" or "owner/repo"`);
}

/**
 * Builds request headers including GitHub Token authentication and User-Agent
 */
function buildGitHubHeaders(acceptHeader: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: acceptHeader,
    'User-Agent': '0xTsoa-Data-Ingestion/1.0 (+https://github.com/nyharena25/0xtsoa)',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const authToken = token || process.env.GITHUB_TOKEN;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
}

/**
 * Fetches pre-rendered HTML README directly from GitHub API
 * Endpoint: GET https://api.github.com/repos/{owner}/{repo}/readme
 * Header: Accept: application/vnd.github.html
 */

export async function fetchReadmeHtml(
  owner: string,
  repo: string,
  ref?: string,
  token?: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const queryParam = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const url = `https://api.github.com/repos/${owner}/${repo}/readme${queryParam}`;

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: buildGitHubHeaders('application/vnd.github.html', token),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const html = await res.text();
      return html.replace(
        /https:\/\/private-user-images\.githubusercontent\.com\/[^\s"'<>]*(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})[^\s"'<>]*/gi,
        (match) => {
          const uuid = match.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
          return uuid ? `https://github.com/user-attachments/assets/${uuid[1]}` : match;
        }
      );
    }

    if (res.status === 404) {
      return `<div class="terminal-callout text-ink-muted p-4 border border-black">[INFO] No README found for ${owner}/${repo} at ref: ${ref || 'HEAD'}</div>`;
    }

    // If rate-limited or other non-404 error, try raw.githubusercontent.com fallback
    console.warn(`[INGEST: API WARN] GitHub API HTTP ${res.status} for ${owner}/${repo}. Falling back to raw README.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[INGEST: API WARN] README API fetch failed for ${owner}/${repo} (${msg}). Falling back to raw README.`);
  }

  // Fallback: Fetch raw README directly from raw.githubusercontent.com (unlimited)
  const targetRef = ref || 'HEAD';
  const candidates = [
    'README.md',
    '.github/README.md',
    'readme.md',
    'README.markdown',
    'docs/README.md',
  ];

  for (const cand of candidates) {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${targetRef}/${cand}`;
      const rawRes = await fetchFn(rawUrl, {
        method: 'GET',
        headers: { 'User-Agent': '0xTsoa-Data-Ingestion/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (rawRes.ok) {
        const markdown = await rawRes.text();
        const candDir = cand.includes('/') ? cand.substring(0, cand.lastIndexOf('/') + 1) : '';
        const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${targetRef}/${candDir}`;
        const parsedHtml = await marked.parse(markdown);
        const cleanHtml = sanitizeHtml(parsedHtml, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'details', 'summary', 'kbd', 'code', 'pre', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
          ]),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'style'],
            a: ['href', 'name', 'target', 'rel'],
            td: ['style', 'align', 'colspan', 'rowspan'],
            th: ['style', 'align', 'colspan', 'rowspan'],
            div: ['class', 'style'],
            span: ['class', 'style'],
            code: ['class'],
          },
          transformTags: {
            img: (tagName, attribs) => {
              let src = attribs.src || '';
              if (src.includes('private-user-images.githubusercontent.com') || src.includes('/assets/')) {
                const uuid = src.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
                if (uuid) src = `https://github.com/user-attachments/assets/${uuid[1]}`;
              } else if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:') && !src.startsWith('//')) {
                src = `${rawBase}${src.replace(/^\.\//, '').replace(/^\//, '')}`;
              }
              return { tagName, attribs: { ...attribs, src, loading: 'lazy' } };
            },
          },
        });
        return cleanHtml;
      }
    } catch {
      // Continue to next candidate
    }
  }

  return `<div class="terminal-callout text-red-600 p-4 border border-black">[WARN] README could not be fetched for ${owner}/${repo}</div>`;
}

/**
 * Fetches root contents of the repository and filters for image assets (.png, .jpg, .jpeg, .webp)
 * Endpoint: GET https://api.github.com/repos/{owner}/{repo}/contents
 * Header: Accept: application/vnd.github+json
 */
export async function fetchRootScreenshots(
  owner: string,
  repo: string,
  ref?: string,
  token?: string,
  fetchFn: typeof fetch = fetch
): Promise<DiscoveredScreenshot[]> {
  const queryParam = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const url = `https://api.github.com/repos/${owner}/${repo}/contents${queryParam}`;

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: buildGitHubHeaders('application/vnd.github+json', token),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[INGEST: WARN] Failed to list root contents for ${owner}/${repo} (HTTP ${res.status}: ${res.statusText})`);
      return [];
    }

    const contents = (await res.json()) as Array<{
      name: string;
      path: string;
      type: string;
      download_url: string | null;
    }>;

    if (!Array.isArray(contents)) {
      return [];
    }

    const screenshots: DiscoveredScreenshot[] = [];

    for (const item of contents) {
      if (item.type === 'file' && IMAGE_EXTENSIONS_REGEX.test(item.name) && item.download_url) {
        screenshots.push({
          url: item.download_url,
          name: item.name,
          alt: `${item.name} screenshot for ${repo}`,
          caption: item.name.toUpperCase().replace(/\.[A-Z0-9]+$/, '.RAW'),
        });
      }
    }

    return screenshots;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[INGEST: WARN] Root contents fetch failed for ${owner}/${repo}: ${msg}`);
    return [];
  }
}

/**
 * Ingests a single user-submitted JSON configuration
 */
export async function ingestConfig(
  config: UserSubmittedConfig,
  configId: string,
  token?: string,
  fetchFn: typeof fetch = fetch
): Promise<UnifiedConfigPayload> {
  const { owner, repo } = parseGitHubRepo(config.source.repo);
  const ref = config.source.ref;

  console.log(`[INGEST] Processing ${configId} -> GitHub: ${owner}/${repo} (${ref || 'default branch'})`);

  // Concurrent execution of README and Screenshot discovery
  const [readmeHtml, discoveredScreenshots] = await Promise.all([
    fetchReadmeHtml(owner, repo, ref, token, fetchFn),
    fetchRootScreenshots(owner, repo, ref, token, fetchFn),
  ]);

  // Combine pre-configured screenshots with dynamically discovered ones, deduplicating by URL
  const existingScreenshots = config.screenshots || [];
  const existingUrls = new Set(existingScreenshots.map((s) => s.url));

  const mergedScreenshots = [...existingScreenshots];
  for (const shot of discoveredScreenshots) {
    if (!existingUrls.has(shot.url)) {
      mergedScreenshots.push({
        url: shot.url,
        alt: shot.alt,
        caption: shot.caption,
      });
      existingUrls.add(shot.url);
    }
  }

  const unified: UnifiedConfigPayload = {
    ...config,
    id: configId,
    github: {
      owner,
      repo,
      ref,
    },
    readmeHtml,
    discoveredScreenshots,
    screenshots: mergedScreenshots,
    ingestedAt: new Date().toISOString(),
  };

  return unified;
}

/**
 * Scans directories recursively for .json configuration files
 */
export function findConfigFiles(dir: string): Array<{ id: string; filePath: string }> {
  const results: Array<{ id: string; filePath: string }> = [];

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.schema.json')) {
        const relPath = path.relative(dir, fullPath);
        const id = relPath.replace(/\.json$/, '').replace(/\\/g, '/');
        results.push({ id, filePath: fullPath });
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Main ingestion CLI entrypoint
 */
export async function main() {
  console.log('------------------------------------------------------------');
  console.log('0xTSOA :: AUTOMATED DATA INGESTION BACKEND');
  console.log('Pre-rendering READMEs & discovering visual assets via GitHub API');
  console.log('------------------------------------------------------------');

  const args = process.argv.slice(2);
  const outArgIndex = args.indexOf('--out');
  const customOut = outArgIndex !== -1 ? args[outArgIndex + 1] : null;

  const fileArgIndex = args.indexOf('--file');
  const singleFile = fileArgIndex !== -1 ? args[fileArgIndex + 1] : null;

  const configsDir = path.resolve(process.cwd(), 'configs');
  const outputDir = path.resolve(process.cwd(), 'src/generated');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const targetOutputFile = customOut
    ? path.resolve(process.cwd(), customOut)
    : path.join(outputDir, 'unified-showcase.json');

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('[INGEST: ADVISORY] GITHUB_TOKEN environment variable not set. GitHub API rate limits will be restricted to 60 req/hr.');
  } else {
    console.log('[INGEST: AUTH] GITHUB_TOKEN loaded successfully.');
  }

  const unifiedList: UnifiedConfigPayload[] = [];

  if (singleFile) {
    const fullPath = path.resolve(process.cwd(), singleFile);
    if (!fs.existsSync(fullPath)) {
      console.error(`[INGEST: ERROR] File not found: ${fullPath}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const id = path.basename(fullPath, '.json');
    const ingested = await ingestConfig(raw, id, token);
    unifiedList.push(ingested);
  } else {
    const files = findConfigFiles(configsDir);
    console.log(`[INGEST] Found ${files.length} configuration file(s) in ${configsDir}`);

    for (const file of files) {
      try {
        const rawContent = JSON.parse(fs.readFileSync(file.filePath, 'utf-8'));
        if (!rawContent.source?.repo) {
          console.warn(`[INGEST: SKIP] ${file.id} lacks source.repo`);
          continue;
        }
        const ingested = await ingestConfig(rawContent, file.id, token);
        unifiedList.push(ingested);
      } catch (err) {
        console.error(`[INGEST: ERROR] Failed processing ${file.id}:`, err);
      }
    }
  }

  // Ensure output parent directory exists
  const parentDir = path.dirname(targetOutputFile);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Write unified JSON payload
  fs.writeFileSync(targetOutputFile, JSON.stringify(unifiedList, null, 2), 'utf-8');
  console.log(`[INGEST: SUCCESS] Ingested ${unifiedList.length} config(s).`);
  console.log(`[INGEST: OUTPUT] Unified JSON written to -> ${targetOutputFile}`);

  // Also write to dist/data/unified-showcase.json if dist folder exists
  const distDir = path.resolve(process.cwd(), 'dist/data');
  if (fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    const distTarget = path.join(distDir, 'unified-showcase.json');
    fs.writeFileSync(distTarget, JSON.stringify(unifiedList, null, 2), 'utf-8');
    console.log(`[INGEST: OUTPUT] Mirror copy written to -> ${distTarget}`);
  }

  console.log('------------------------------------------------------------');
}

// Execute when run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ingest-configs.ts')) {
  main().catch((err) => {
    console.error('[INGEST: FATAL]', err);
    process.exit(1);
  });
}
