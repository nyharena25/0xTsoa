/**
 * Central site configuration.
 * Automatically adapts between Vercel (root deployment) and GitHub Pages (subpath /<repo>).
 * Every value can be overridden through environment variables.
 */
const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;

// In GitHub Actions, GITHUB_REPOSITORY = "owner/repo".
const rawGhRepo = env.GITHUB_REPOSITORY?.trim() || '';
const [ghOwnerPart, ghRepoPart] = rawGhRepo.includes('/') ? rawGhRepo.split('/') : ['', ''];

export const REPO_OWNER = env.REPO_OWNER || ghOwnerPart || 'nyharena25';
export const REPO_NAME = env.REPO_NAME || ghRepoPart || '0xTsoa';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

// Deployment target detection
const isVercel = Boolean(env.VERCEL);
const isNetlify = Boolean(env.NETLIFY);
const isCloudflare = Boolean(env.CF_PAGES);
const isGitHubActions = Boolean(env.GITHUB_ACTIONS);

/**
 * Base path resolution:
 * - When deployed on Vercel, Netlify, Cloudflare: root "" (served at https://0x-tsoa.vercel.app/)
 * - When deployed in GitHub Actions without custom domain: `/${REPO_NAME}` (served at https://<owner>.github.io/<repo>/)
 * - In local dev (default): "" (served at http://localhost:4321/)
 * - Explicit override via BASE_PATH env var takes highest precedence.
 */
function resolveBasePath(): string {
  if (env.BASE_PATH !== undefined) {
    if (env.BASE_PATH === '/' || env.BASE_PATH === '') return '';
    return env.BASE_PATH.replace(/\/$/, '');
  }
  if (isVercel || isNetlify || isCloudflare) {
    return '';
  }
  if (isGitHubActions) {
    return `/${REPO_NAME}`;
  }
  return '';
}

export const BASE_PATH = resolveBasePath();

/** Public site origin */
function resolveSiteUrl(): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return `https://${REPO_OWNER.toLowerCase()}.github.io`;
}

export const SITE_URL = resolveSiteUrl();

/**
 * Returns an internal path with BASE_PATH safely prefixed.
 * Prevents double-slashes or protocol-relative URLs (`//`).
 *
 * Examples:
 *   withBase('/')                 -> '/' on Vercel, '/0xTsoa/' on GitHub Pages
 *   withBase('/catalogue/')       -> '/catalogue/' on Vercel, '/0xTsoa/catalogue/' on GitHub Pages
 *   withBase('screenshots/f.svg') -> '/screenshots/f.svg' on Vercel, '/0xTsoa/screenshots/f.svg' on GitHub Pages
 */
export function withBase(path: string = '/'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!BASE_PATH || BASE_PATH === '/') {
    return cleanPath;
  }
  const cleanBase = BASE_PATH.replace(/\/$/, '');
  return `${cleanBase}${cleanPath}`;
}

/** GitHub Discussions category used for votes (👍 = sign-off). */
export const VOTES_CATEGORY = 'Votes';
export const discussionTitle = (id: string) => `[0xTsoa] ${id}`;

/** Only screenshots hosted here are accepted (CI + Astro image service). */
export const ALLOWED_IMAGE_HOSTS = [
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'private-user-images.githubusercontent.com',
  'github.com',
  'i.imgur.com',
  'i.redd.it',
] as const;

export const NEW_CONFIG_ISSUE_URL = `${REPO_URL}/issues/new?template=new-config.yml`;
