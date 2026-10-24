import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { readmeRawUrl, type ConfigData } from './schema';
import { fetchLimited } from './fetch-limited';
import { stripTrailingSlashes } from './strings';

const CACHE_DIR = path.resolve(process.cwd(), 'node_modules/.cache/0xtsoa-readme');
const README_MAX_BYTES = 2 * 1024 * 1024;
const README_TIMEOUT_MS = 8_000;
export const README_HOSTS = [
  'raw.githubusercontent.com',
  'api.github.com',
  'gitlab.com',
  'codeberg.org',
] as const;

const UUID_RE = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function isGitHubAssetHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'github.com' || h.endsWith('.githubusercontent.com');
}

function rewriteGitHubAssetUuidUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!isGitHubAssetHost(parsed.hostname)) return null;
  if (
    parsed.hostname.toLowerCase() === 'private-user-images.githubusercontent.com' ||
    parsed.pathname.includes('/assets/')
  ) {
    const uuidMatch = parsed.pathname.match(UUID_RE);
    if (uuidMatch) {
      return `https://github.com/user-attachments/assets/${uuidMatch[1]}`;
    }
  }
  return null;
}

function getCachePath(id: string, ref: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeRef = ref.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CACHE_DIR, `${safeId}-${safeRef}.html`);
}

/**
 * Extracts owner and repository name from various Git/GitHub repository URLs:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 * - owner/repo
 */
export function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } | null {
  if (!repoUrl || typeof repoUrl !== 'string') return null;
  const clean = stripTrailingSlashes(repoUrl.trim()).replace(/\.git$/, '');

  const urlMatch = clean.match(/github\.com[:/]([^/]+)\/([^/]+)$/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  const shorthandMatch = clean.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shorthandMatch) {
    return { owner: shorthandMatch[1], repo: shorthandMatch[2] };
  }

  return null;
}

/**
 * Normalizes an image src URL:
 * 1. Rewrites expiring private-user-images (or repo assets URLs on github.com / *.githubusercontent.com)
 *    containing UUIDs to permanent https://github.com/user-attachments/assets/<uuid>
 * 2. Rewrites relative URLs taking into account the directory of the README file
 * 3. Rewrites root-relative URLs (/path) against the repository root
 */
export function normalizeGitHubImageUrl(
  src: string,
  readmeRawDir: string,
  repoRawRoot: string,
): string {
  if (!src) return '';

  const rewrittenAsset = rewriteGitHubAssetUuidUrl(src);
  if (rewrittenAsset) return rewrittenAsset;

  // Already absolute or scheme URL
  if (URI_SCHEME_RE.test(src) || src.startsWith('//')) {
    return src;
  }

  // Root-relative: /assets/image.png
  if (src.startsWith('/')) {
    const cleanPath = src.replace(/^\/+/, '');
    return `${repoRawRoot}${cleanPath}`;
  }

  // Relative: ./image.png or image.png
  const cleanPath = src.replace(/^\.\//, '');
  return `${readmeRawDir}${cleanPath}`;
}

/**
 * Normalizes a hyperlink href:
 * - Rewrites private-user-images / GitHub asset UUID URLs to permanent user-attachments
 * - Resolves relative links based on directory or repository root
 */
export function normalizeGitHubLinkUrl(
  href: string,
  readmeBlobDir: string,
  repoBlobRoot: string,
): string {
  if (!href) return '';

  const rewrittenAsset = rewriteGitHubAssetUuidUrl(href);
  if (rewrittenAsset) return rewrittenAsset;

  if (URI_SCHEME_RE.test(href) || href.startsWith('#') || href.startsWith('//')) {
    return href;
  }

  if (href.startsWith('/')) {
    const cleanPath = href.replace(/^\/+/, '');
    return `${repoBlobRoot}${cleanPath}`;
  }

  const cleanPath = href.replace(/^\.\//, '');
  return `${readmeBlobDir}${cleanPath}`;
}

/**
 * Extracts screenshot images from rendered README HTML, filtering out
 * shields, badges, avatars, and tiny graphics.
 */
export function extractScreenshotsFromReadme(
  html: string,
): Array<{ url: string; alt: string; caption?: string }> {
  if (!html) return [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const screenshots: Array<{ url: string; alt: string; caption?: string }> = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const fullTag = match[0];
    let src = match[1];

    const rewrittenAsset = rewriteGitHubAssetUuidUrl(src);
    if (rewrittenAsset) {
      src = rewrittenAsset;
    }

    const lowerSrc = src.toLowerCase();
    // Exclude badges, shields, charts, avatars
    if (
      lowerSrc.includes('shields.io') ||
      lowerSrc.includes('starchart.cc') ||
      lowerSrc.includes('badge') ||
      lowerSrc.includes('badgen.net') ||
      lowerSrc.includes('avatars.githubusercontent.com') ||
      lowerSrc.includes('travis-ci') ||
      lowerSrc.includes('circleci') ||
      lowerSrc.includes('codecov')
    ) {
      continue;
    }

    // Exclude badge SVGs
    if (
      lowerSrc.endsWith('.svg') &&
      (lowerSrc.includes('badge') || lowerSrc.includes('logo') || lowerSrc.includes('icon') || lowerSrc.includes('shield'))
    ) {
      continue;
    }

    if (seen.has(src)) continue;
    seen.add(src);

    const altMatch = fullTag.match(/alt=["']([^"']*)["']/i);
    const titleMatch = fullTag.match(/title=["']([^"']*)["']/i);
    const rawAlt = (altMatch ? altMatch[1] : '') || (titleMatch ? titleMatch[1] : '');
    const alt = rawAlt && rawAlt !== 'image' ? rawAlt : 'Desktop showcase capture';
    const cleanCaption =
      (rawAlt && rawAlt !== 'image'
        ? rawAlt.toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 30)
        : `CAPTURE_${String(screenshots.length + 1).padStart(2, '0')}`) + '.RAW';

    screenshots.push({
      url: src,
      alt,
      caption: cleanCaption,
    });
  }

  return screenshots;
}

/**
 * Transforms GitHub alert blockquotes (> [!NOTE], > [!IMPORTANT], etc.)
 * into official GitHub-flavored markdown alert containers.
 */
function transformGitHubAlerts(markdown: string): string {
  return markdown.replace(
    /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:\r?\n)((?:>.*(?:\r?\n|$))*)/gim,
    (_, type: string, content: string) => {
      const alertType = type.toLowerCase();
      const alertTitle = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      const cleanContent = content
        .split(/\r?\n/)
        .map((line: string) => line.replace(/^>\s?/, ''))
        .join('\n');
      return `<div class="markdown-alert markdown-alert-${alertType}"><p class="markdown-alert-title">${alertTitle}</p>\n\n${cleanContent}\n\n</div>\n\n`;
    }
  );
}

/**
 * Fetch and render a remote README pinned to a specific ref.
 * Supports:
 * - Candidate raw markdown resolution across common file locations
 * - GitHub API pre-rendered HTML fallback
 * - Full relative image and link rewriting to match the real GitHub repository hierarchy
 * - Rewriting of private user images to permanent user attachments
 * - Sanitization compatible with GitHub Flavored Markdown (github-markdown-css)
 */
export async function getRenderedReadme(
  configId: string,
  source: ConfigData['source'],
): Promise<{ html: string; rawUrl: string; missing?: boolean }> {
  const parsedRepo = parseGitHubRepo(source.repo);
  const ref = source.ref || 'HEAD';
  const configuredReadme = source.readme || 'README.md';

  // Codeberg / GitLab: derive the pinned raw root from the forge-specific README URL.
  const repoRawRoot = parsedRepo
    ? `https://raw.githubusercontent.com/${parsedRepo.owner}/${parsedRepo.repo}/${ref}/`
    : readmeRawUrl(source).slice(0, -configuredReadme.length);

  const repoBlobRoot = parsedRepo
    ? `https://github.com/${parsedRepo.owner}/${parsedRepo.repo}/blob/${ref}/`
    : `${source.repo}/blob/${ref}/`;

  const rawUrl = parsedRepo
    ? `${repoRawRoot}${configuredReadme}`
    : readmeRawUrl(source);

  // 1. Check local file override: configs/<author>/<slug>.md
  const localReadmePath = path.resolve(process.cwd(), 'configs', `${configId}.md`);
  if (fs.existsSync(localReadmePath)) {
    try {
      const localMd = fs.readFileSync(localReadmePath, 'utf-8');
      return await renderMarkdownToGithubHtml(
        localMd,
        repoRawRoot,
        repoBlobRoot,
        repoRawRoot,
        repoBlobRoot,
        rawUrl
      );
    } catch {
      // Continue to cache / fetch
    }
  }

  // 2. Check disk cache
  const cachePath = getCachePath(configId, ref);
  if (fs.existsSync(cachePath)) {
    try {
      const cached = fs.readFileSync(cachePath, 'utf-8');
      if (cached && cached.trim().length > 0) {
        // Run sanitization to ensure any stale private-user-images in cache are rewritten
        const sanitized = sanitizeAndRewriteHtml(
          cached,
          repoRawRoot,
          repoBlobRoot,
          repoRawRoot,
          repoBlobRoot
        );
        return { html: sanitized, rawUrl };
      }
    } catch {
      // Continue to fetch
    }
  }

  let finalHtml = '';
  let activeRawUrl = rawUrl;

  // 3. Fetch raw markdown directly from candidate paths
  // This avoids GitHub API 60 req/hr rate limits and preserves permanent user-attachment URLs
  {
    const candidates = !parsedRepo ? [configuredReadme] : [
      configuredReadme,
      '.github/README.md',
      'README.md',
      'readme.md',
      '.github/readme.md',
      'README.markdown',
      'docs/README.md',
    ].filter((v, i, a) => a.indexOf(v) === i);

    for (const candidate of candidates) {
      const candidateUrl = `${repoRawRoot}${candidate}`;
      try {
        const res = await fetchLimited(candidateUrl, {
          maxBytes: README_MAX_BYTES,
          timeoutMs: README_TIMEOUT_MS,
          allowedHosts: README_HOSTS,
          headers: {
            'User-Agent': '0xTsoa-Static-Builder/1.0 (+https://github.com/nyharena25/0xtsoa)',
          },
        });

        if (res.status >= 200 && res.status < 300) {
          const rawMarkdown = res.body.toString('utf-8');
          const candidateDir = candidate.includes('/')
            ? candidate.substring(0, candidate.lastIndexOf('/') + 1)
            : '';
          const readmeRawDir = `${repoRawRoot}${candidateDir}`;
          const readmeBlobDir = `${repoBlobRoot}${candidateDir}`;

          const rendered = await renderMarkdownToGithubHtml(
            rawMarkdown,
            readmeRawDir,
            readmeBlobDir,
            repoRawRoot,
            repoBlobRoot,
            candidateUrl
          );
          finalHtml = rendered.html;
          activeRawUrl = candidateUrl;
          break;
        }
      } catch {
        // Try next candidate
      }
    }
  }

  // 4. Fallback: GitHub API pre-rendered HTML (if raw fetch failed)
  if (!finalHtml && parsedRepo) {
    try {
      const apiUrl = `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/readme?ref=${encodeURIComponent(ref)}`;
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.html',
        'User-Agent': '0xTsoa-Static-Builder/1.0 (+https://github.com/nyharena25/0xtsoa)',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      const res = await fetchLimited(apiUrl, {
        maxBytes: README_MAX_BYTES,
        timeoutMs: README_TIMEOUT_MS,
        allowedHosts: README_HOSTS,
        headers,
      });

      if (res.status >= 200 && res.status < 300) {
        const githubPreRendered = res.body.toString('utf-8');
        finalHtml = sanitizeAndRewriteHtml(
          githubPreRendered,
          repoRawRoot,
          repoBlobRoot,
          repoRawRoot,
          repoBlobRoot
        );
      }
    } catch {
      // Continue to spec fallback
    }
  }

  // 5. Nothing found: the page drops its README section instead of showing a placeholder.
  if (!finalHtml) {
    return { html: '', rawUrl: activeRawUrl, missing: true };
  }

  // 6. Save to cache
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(cachePath, finalHtml, 'utf-8');
  } catch {
    // Non-fatal
  }

  return { html: finalHtml, rawUrl: activeRawUrl };
}

/**
 * Parses markdown with marked and rewrites URLs for GitHub compatibility
 */
async function renderMarkdownToGithubHtml(
  markdown: string,
  readmeRawDir: string,
  readmeBlobDir: string,
  repoRawRoot: string,
  repoBlobRoot: string,
  rawUrl: string,
): Promise<{ html: string; rawUrl: string }> {
  const processedMd = transformGitHubAlerts(markdown);

  const renderer = new marked.Renderer();

  // Rewrite Markdown image links: ![alt](relative/image.png)
  renderer.image = function ({ href, title, text }) {
    const finalHref = normalizeGitHubImageUrl(href || '', readmeRawDir, repoRawRoot);
    return `<img src="${finalHref}" alt="${text || ''}" title="${title || ''}" loading="lazy" />`;
  };

  // Rewrite Markdown hyperlinks: [text](relative/link.md)
  renderer.link = function ({ href, title, text }) {
    const finalHref = normalizeGitHubLinkUrl(href || '', readmeBlobDir, repoBlobRoot);
    const isAnchor = finalHref.startsWith('#');
    const target = isAnchor ? '' : ' target="_blank" rel="noopener noreferrer nofollow"';
    return `<a href="${finalHref}"${target}${title ? ` title="${title}"` : ''}>${text}</a>`;
  };

  const rawHtml = await marked.parse(processedMd, {
    renderer,
    gfm: true,
    breaks: false,
  });

  const cleanHtml = sanitizeAndRewriteHtml(
    rawHtml,
    readmeRawDir,
    readmeBlobDir,
    repoRawRoot,
    repoBlobRoot
  );

  return { html: cleanHtml, rawUrl };
}

/**
 * Sanitizes HTML output while preserving GitHub-Flavored Markdown structures
 * and transforming raw HTML relative image and anchor tags to GitHub URLs.
 */
export function sanitizeAndRewriteHtml(
  rawHtml: string,
  readmeRawDir: string,
  readmeBlobDir: string,
  repoRawRoot: string,
  repoBlobRoot: string,
): string {
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
      'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'del', 's', 'code', 'hr', 'br', 'div',
      'table', 'thead', 'caption', 'tbody', 'tfoot', 'tr', 'th', 'td', 'pre', 'img',
      'details', 'summary', 'span', 'kbd', 'input', 'svg', 'path', 'g', 'picture', 'source',
      'video', 'sub', 'sup'
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel', 'class', 'id', 'title'],
      img: ['src', 'alt', 'title', 'class', 'loading', 'width', 'height', 'align'],
      input: ['type', 'checked', 'disabled', 'class'],
      source: ['srcset', 'media', 'type'],
      video: ['src', 'controls', 'poster', 'width', 'height', 'autoplay', 'loop', 'muted', 'class'],
      td: ['align', 'valign', 'colspan', 'rowspan', 'class'],
      th: ['align', 'valign', 'colspan', 'rowspan', 'class'],
      div: ['class', 'id', 'align'],
      span: ['class', 'id'],
      pre: ['class'],
      code: ['class'],
      svg: ['viewBox', 'width', 'height', 'fill', 'class', 'aria-hidden'],
      path: ['d', 'fill', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width'],
      '*': ['class', 'id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
      a: ['http', 'https', 'mailto'],
    },
    transformTags: {
      img: (tagName, attribs) => {
        const src = normalizeGitHubImageUrl(attribs.src || '', readmeRawDir, repoRawRoot);
        return {
          tagName,
          attribs: {
            ...attribs,
            src,
            loading: 'lazy',
          },
        };
      },
      a: (tagName, attribs) => {
        const href = normalizeGitHubLinkUrl(attribs.href || '', readmeBlobDir, repoBlobRoot);
        return {
          tagName,
          attribs: {
            ...attribs,
            href,
            rel: 'noopener noreferrer nofollow',
            target: href.startsWith('#') ? '_self' : '_blank',
          },
        };
      },
    },
  });
}

const VOID_TAGS = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'source', 'track', 'wbr']);
const TAG_RE = /<\/?([a-zA-Z][\w-]*)(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g;

/** Top-level elements of sanitized HTML (whitespace between them dropped). */
export function topLevelBlocks(html: string): string[] {
  const blocks: string[] = [];
  const pushText = (text: string) => {
    if (text.trim()) blocks.push(text.trim());
  };
  let depth = 0;
  let start = 0;
  let cursor = 0;
  for (const m of html.matchAll(TAG_RE)) {
    const [tag, rawName, selfClosing] = m;
    const index = m.index ?? 0;
    if (depth === 0) {
      pushText(html.slice(cursor, index)); // loose text between top-level elements
      start = index;
    }
    if (tag.startsWith('</')) depth = Math.max(0, depth - 1);
    else if (!VOID_TAGS.has(rawName.toLowerCase()) && !selfClosing) depth++;
    if (depth === 0) {
      cursor = index + tag.length;
      blocks.push(html.slice(start, cursor));
    }
  }
  pushText(html.slice(cursor));
  return blocks;
}

function wordCount(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
}

/**
 * The opening of a README: whole top-level blocks up to about `maxWords` words, stopping at the
 * next heading once there is enough to read. The full text stays on the forge, linked from the page,
 * so the page keeps its own content instead of copying the upstream README.
 */
export function readmeExcerpt(html: string, maxWords = 220): { html: string; truncated: boolean } {
  const blocks = topLevelBlocks(html);
  const kept: string[] = [];
  let words = 0;
  for (const block of blocks) {
    const n = wordCount(block);
    const isHeading = /^<h[1-6]\b/i.test(block);
    if (kept.length > 0 && ((isHeading && words >= maxWords / 2) || words + n > maxWords)) break;
    kept.push(block);
    words += n;
  }
  // A trailing heading with nothing under it reads as a cut-off.
  while (kept.length > 1 && /^<h[1-6]\b/i.test(kept[kept.length - 1])) kept.pop();
  return { html: kept.join('\n'), truncated: kept.length < blocks.length };
}
