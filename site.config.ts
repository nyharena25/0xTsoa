/**
 * Central site configuration.
 * Canonical production deployment lives on Vercel (https://www.0xtsoa.dev at root path "").
 * Every value can be overridden through environment variables.
 */
const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;

// In GitHub Actions, GITHUB_REPOSITORY = "owner/repo".
const rawGhRepo = env.GITHUB_REPOSITORY?.trim() || '';
const [ghOwnerPart, ghRepoPart] = rawGhRepo.includes('/') ? rawGhRepo.split('/') : ['', ''];

export const REPO_OWNER = env.REPO_OWNER || ghOwnerPart || 'nyharena25';
export const REPO_NAME = env.REPO_NAME || ghRepoPart || '0xTsoa';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

/**
 * Base path resolution:
 * - Default: "" (root deployment on https://www.0xtsoa.dev/ and local dev)
 * - Explicit override via BASE_PATH env var takes precedence.
 */
function resolveBasePath(): string {
  if (env.BASE_PATH !== undefined) {
    if (env.BASE_PATH === '/' || env.BASE_PATH === '') return '';
    return env.BASE_PATH.replace(/\/$/, '');
  }
  return '';
}

export const BASE_PATH = resolveBasePath();

/**
 * Public site origin:
 * - Default: https://www.0xtsoa.dev regardless of CI environment
 * - Explicit override via SITE_URL env var takes precedence.
 */
function resolveSiteUrl(): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return 'https://www.0xtsoa.dev';
}

export const SITE_URL = resolveSiteUrl();

/**
 * Former hosts that must answer with a permanent redirect to the same path on SITE_URL.
 * Checked after every production deploy (scripts/check-live.ts). Override with a comma-separated
 * REDIRECT_HOSTS env var, or set it to "" when there are none.
 */
export const REDIRECT_HOSTS = (env.REDIRECT_HOSTS ?? '0xtsoa.dev,0xtsoa.vercel.app')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

/**
 * Returns an internal path with BASE_PATH safely prefixed.
 * Prevents double-slashes or protocol-relative URLs (`//`).
 *
 * Examples:
 *   withBase('/')                 -> '/' (or '<BASE_PATH>/' when BASE_PATH is set)
 *   withBase('/catalogue/')       -> '/catalogue/'
 *   withBase('screenshots/f.svg') -> '/screenshots/f.svg'
 */
export function withBase(path: string = '/'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!BASE_PATH || BASE_PATH === '/') {
    return cleanPath;
  }
  const cleanBase = BASE_PATH.replace(/\/$/, '');
  return `${cleanBase}${cleanPath}`;
}

/** One GitHub issue per config, carrying this label, collects the votes (👍 = sign-off). */
export const VOTE_LABEL = 'vote';
export const voteIssueTitle = (id: string) => `[0xTsoa] ${id}`;

/** Only screenshots hosted here are accepted (CI + Astro image service). */
export const ALLOWED_IMAGE_HOSTS = [
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'private-user-images.githubusercontent.com',
  'github.com',
  'i.imgur.com',
  'i.redd.it',
  'codeberg.org',
  'gitlab.com',
] as const;

export const NEW_CONFIG_ISSUE_URL = `${REPO_URL}/issues/new?template=new-config.yml`;

export const GA_MEASUREMENT_ID = env.GA_MEASUREMENT_ID?.trim() || '';
