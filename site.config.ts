/**
 * Central site configuration.
 * Change REPO_OWNER once the GitHub repository exists (user or org).
 * Every value can be overridden through environment variables in CI.
 */
const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;

// In GitHub Actions, GITHUB_REPOSITORY = "owner/repo".
const [ghOwner, ghRepo] = (env.GITHUB_REPOSITORY ?? '').split('/');

export const REPO_OWNER = env.REPO_OWNER ?? ghOwner ?? 'nyharena25';
export const REPO_NAME = env.REPO_NAME ?? ghRepo ?? '0xtsoa';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

/** Public site origin and base path (GitHub Pages project site by default). */
export const SITE_URL = env.SITE_URL ?? `https://${REPO_OWNER.toLowerCase()}.github.io`;
export const BASE_PATH = env.BASE_PATH ?? `/${REPO_NAME}`;

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
