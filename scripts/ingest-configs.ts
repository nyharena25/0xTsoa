import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { REPO_OWNER, REPO_NAME } from '../site.config';

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
  popularityScore?: number;
  issueNumber?: number;
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
 * Structured metadata extracted from showcase-submission issue bodies
 */
export interface ShowcaseIssueFields {
  projectName: string;
  authorGithub: string;
  repoUrl: string;
  distribution: string;
  wm: string;
  shortDescription: string;
}

/**
 * Parses markdown generated by GitHub Issue Forms into structured metadata.
 * Matches headers created by .github/ISSUE_TEMPLATE/submit-showcase.yml:
 * - ### Project Name
 * - ### Author GitHub Username
 * - ### Repository URL
 * - ### Linux Distribution
 * - ### Window Manager / Desktop Environment
 * - ### Short Description
 */
function cleanIssueFieldValue(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed === '_No response_' || trimmed === 'None') return '';
  return trimmed;
}

export function parseShowcaseIssueBody(markdown: string): ShowcaseIssueFields {
  const sections: Record<string, string> = {};
  if (!markdown || typeof markdown !== 'string') {
    return {
      projectName: '',
      authorGithub: '',
      repoUrl: '',
      distribution: '',
      wm: '',
      shortDescription: '',
    };
  }

  const lines = markdown.split('\n');
  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(.+)$/);
    if (headingMatch) {
      if (currentHeading) {
        sections[currentHeading.trim()] = currentContent.join('\n').trim();
      }
      currentHeading = headingMatch[1].trim();
      currentContent = [];
    } else if (currentHeading) {
      currentContent.push(line);
    }
  }

  if (currentHeading) {
    sections[currentHeading.trim()] = currentContent.join('\n').trim();
  }

  const rawRepoUrl = cleanIssueFieldValue(sections['Repository URL'] || sections['Repo URL'] || '');
  const validRepoUrl = /github\.com\/.+/i.test(rawRepoUrl) ? rawRepoUrl : '';
  const rawAuthor = cleanIssueFieldValue(sections['Author GitHub Username'] || sections['Author'] || '');

  return {
    projectName: cleanIssueFieldValue(sections['Project Name'] || sections['Nom de la configuration'] || ''),
    authorGithub: rawAuthor.replace(/^@/, ''),
    repoUrl: validRepoUrl,
    distribution: cleanIssueFieldValue(sections['Linux Distribution'] || sections['Distribution'] || ''),
    wm: cleanIssueFieldValue(sections['Window Manager / Desktop Environment'] || sections['Window Manager'] || ''),
    shortDescription: cleanIssueFieldValue(sections['Short Description'] || sections['Description'] || ''),
  };
}

/**
 * Structure of a GitHub Reaction object
 */
export interface GitHubReaction {
  id?: number;
  content: string;
  user?: { login: string };
  created_at?: string;
}

/**
 * Fetches active reactions for an issue using GitHub REST API
 * Endpoint: GET https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}/reactions
 * Header: Accept: application/vnd.github.squirrel-girl-preview+json
 */
export async function fetchIssueReactions(
  owner: string,
  repo: string,
  issueNumber: number,
  token?: string,
  fetchFn: typeof fetch = fetch
): Promise<GitHubReaction[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/reactions`;
  const headers = buildGitHubHeaders('application/vnd.github.squirrel-girl-preview+json', token);

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[REACTIONS: WARN] Failed to fetch reactions for issue #${issueNumber}: HTTP ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`[REACTIONS: ERROR] Error fetching reactions for issue #${issueNumber}:`, err);
    return [];
  }
}

/**
 * Calculates a real-time popularity score from positive reactions ('+1', 'heart', 'hooray').
 */
export function calculatePopularityScore(reactions: Array<{ content: string }>): number {
  if (!Array.isArray(reactions)) return 0;
  const positiveReactions = new Set(['+1', 'heart', 'hooray']);
  return reactions.filter((r) => r && positiveReactions.has(r.content)).length;
}

/**
 * Structure of a GitHub Issue object
 */
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name: string } | string>;
  pull_request?: unknown;
  user?: { login: string };
}

/**
 * Reads open issues carrying the `showcase-submission` label via GET /repos/{owner}/{repo}/issues
 */
export async function fetchShowcaseIssues(
  owner: string,
  repo: string,
  token?: string,
  fetchFn: typeof fetch = fetch
): Promise<GitHubIssue[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?labels=showcase-submission&state=open&per_page=100`;
  const headers = buildGitHubHeaders('application/vnd.github+json', token);

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[ISSUES: WARN] Failed to fetch showcase issues for ${owner}/${repo}: HTTP ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    // Filter out pull requests
    return data.filter((issue: GitHubIssue) => !issue.pull_request);
  } catch (err) {
    console.warn(`[ISSUES: ERROR] Error fetching showcase issues:`, err);
    return [];
  }
}

/**
 * Ingests showcase submissions from GitHub Issues, computes popularity scores,
 * and converts them into validated configuration payloads.
 */
export interface ShowcaseSubmissionPayload {
  issueNumber: number;
  metadata: ShowcaseIssueFields;
  popularityScore: number;
  reactions: GitHubReaction[];
  id: string;
  config: UserSubmittedConfig;
}

export async function processShowcaseIssue(
  issue: GitHubIssue,
  owner: string,
  repo: string,
  token?: string,
  fetchFn: typeof fetch = fetch
): Promise<ShowcaseSubmissionPayload | null> {
  const metadata = parseShowcaseIssueBody(issue.body || '');
  if (!metadata.projectName && !metadata.repoUrl) {
    return null;
  }

  const reactions = await fetchIssueReactions(owner, repo, issue.number, token, fetchFn);
  const popularityScore = calculatePopularityScore(reactions);

  let author = metadata.authorGithub || issue.user?.login || 'community';
  let repoName = 'setup';

  if (metadata.repoUrl) {
    try {
      const parsed = parseGitHubRepo(metadata.repoUrl);
      author = author || parsed.owner;
      repoName = parsed.repo;
    } catch {}
  }

  const slug = (metadata.projectName || repoName)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || repoName;

  const id = `${author}/${slug}`;

  const config: UserSubmittedConfig = {
    name: metadata.projectName || `${author}'s Setup`,
    author: {
      name: author,
      github: author,
    },
    summary: metadata.shortDescription || `${metadata.wm || 'Custom'} setup on ${metadata.distribution || 'Linux'}.`,
    distros: [metadata.distribution.toLowerCase() || 'arch'],
    wm: metadata.wm.toLowerCase().replace(/\s+/g, '-') || 'hyprland',
    displayServer: metadata.wm.toLowerCase().includes('i3') || metadata.wm.toLowerCase().includes('bspwm') || metadata.wm.toLowerCase().includes('awesome') ? 'x11' : 'wayland',
    source: {
      repo: metadata.repoUrl || `https://github.com/${author}/${repoName}`,
    },
  };

  return {
    issueNumber: issue.number,
    metadata,
    popularityScore,
    reactions,
    id,
    config,
  };
}

/**
 * Automatically sorts setups by real-time popularity score and updates featured.json
 * for the frontend synchronized carousel.
 */
export function sortTopSetups<T extends { id: string; popularityScore?: number }>(
  setups: T[],
  limit: number = 5
): T[] {
  return [...setups]
    .sort((a, b) => {
      const scoreA = a.popularityScore ?? 0;
      const scoreB = b.popularityScore ?? 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return a.id.localeCompare(b.id);
    })
    .slice(0, limit);
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

  // 1. Ingest local configurations
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

  // 2. Fetch and ingest showcase submissions and reactions from GitHub Issues
  const owner = process.env.REPO_OWNER || REPO_OWNER || 'nyharena25';
  const repo = process.env.REPO_NAME || REPO_NAME || '0xTsoa';

  console.log(`[INGEST: ISSUES] Scanning open showcase submission issues in ${owner}/${repo}...`);
  const showcaseIssues = await fetchShowcaseIssues(owner, repo, token);
  console.log(`[INGEST: ISSUES] Found ${showcaseIssues.length} open showcase issue(s).`);

  for (const issue of showcaseIssues) {
    try {
      const processed = await processShowcaseIssue(issue, owner, repo, token);
      if (!processed) continue;

      console.log(`[INGEST: ISSUE #${issue.number}] "${processed.metadata.projectName || processed.id}" - Popularity Score: ${processed.popularityScore}`);

      // Try to find matching existing config by id or source repo
      const existing = unifiedList.find((c) => {
        if (c.id.toLowerCase() === processed.id.toLowerCase()) return true;
        try {
          const parsedExisting = parseGitHubRepo(c.source.repo);
          const parsedIssue = parseGitHubRepo(processed.metadata.repoUrl);
          return (
            parsedExisting.owner.toLowerCase() === parsedIssue.owner.toLowerCase() &&
            parsedExisting.repo.toLowerCase() === parsedIssue.repo.toLowerCase()
          );
        } catch {
          return false;
        }
      });

      if (existing) {
        existing.popularityScore = (existing.popularityScore || 0) + processed.popularityScore;
        existing.issueNumber = issue.number;
        console.log(`[INGEST: MATCH] Attached popularity score (${processed.popularityScore}) from issue #${issue.number} to existing config: ${existing.id}`);
      } else if (!singleFile) {
        // Ingest new community submission as a new config
        try {
          const ingested = await ingestConfig(processed.config, processed.id, token);
          ingested.popularityScore = processed.popularityScore;
          ingested.issueNumber = issue.number;
          unifiedList.push(ingested);
          console.log(`[INGEST: NEW SUBMISSION] Ingested community submission from issue #${issue.number}: ${processed.id}`);
        } catch (subErr) {
          console.warn(`[INGEST: WARN] Failed to ingest new submission ${processed.id}:`, subErr);
        }
      }
    } catch (err) {
      console.warn(`[INGEST: WARN] Error processing issue #${issue.number}:`, err);
    }
  }

  // 3. Incorporate existing discussion votes if available
  const votesPath = path.join(outputDir, 'votes.json');
  let votesMap: Record<string, { votes: number; discussionUrl?: string }> = {};
  if (fs.existsSync(votesPath)) {
    try {
      votesMap = JSON.parse(fs.readFileSync(votesPath, 'utf-8'));
    } catch {}
  }

  for (const item of unifiedList) {
    if (item.popularityScore === undefined || item.popularityScore === 0) {
      if (votesMap[item.id]?.votes) {
        item.popularityScore = votesMap[item.id].votes;
      } else {
        item.popularityScore = item.popularityScore || 0;
      }
    }
  }

  // 4. Automatically sort top 5 setups for frontend synchronized carousel
  const topSetups = sortTopSetups(unifiedList, 5);
  const top5Ids = topSetups.map((s) => s.id);

  console.log(`[INGEST: SPOTLIGHT] Top 5 Popular Setups for Carousel:`);
  topSetups.forEach((s, idx) => {
    console.log(`  #${idx + 1}: ${s.id} (Score: ${s.popularityScore ?? 0})`);
  });

  // Synchronize to featured.json
  const featuredPath = path.resolve(process.cwd(), 'featured.json');
  if (top5Ids.length > 0) {
    try {
      fs.writeFileSync(featuredPath, JSON.stringify({ pinned: top5Ids }, null, 2), 'utf-8');
      console.log(`[INGEST: CAROUSEL] Updated featured.json with top 5 popular setups.`);
    } catch (err) {
      console.warn(`[INGEST: WARN] Could not write featured.json:`, err);
    }
  }

  // Synchronize popularity scores back into votes.json so frontend components display them
  for (const item of unifiedList) {
    const score = item.popularityScore ?? 0;
    votesMap[item.id] = {
      ...(votesMap[item.id] || {}),
      votes: Math.max(votesMap[item.id]?.votes ?? 0, score),
    };
  }
  try {
    fs.writeFileSync(votesPath, JSON.stringify(votesMap, null, 2), 'utf-8');
    console.log(`[INGEST: VOTES] Synchronized popularity scores to votes.json.`);
  } catch (err) {
    console.warn(`[INGEST: WARN] Could not write votes.json:`, err);
  }

  // 5. Automatically sort setups by popularity score before compiling final static JSON
  unifiedList.sort((a, b) => {
    const scoreA = a.popularityScore ?? 0;
    const scoreB = b.popularityScore ?? 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    return a.id.localeCompare(b.id);
  });

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
