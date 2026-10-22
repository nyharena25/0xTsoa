/**
 * Single source of truth for the configuration JSON format.
 * Used by: Astro content collection, CI validation, Issue→PR bot, JSON Schema generation.
 * Keep this module dependency-free (only zod, site.config and ./strings) so it runs in Node scripts too.
 */
import { z } from 'zod';
import { ALLOWED_IMAGE_HOSTS } from '../../site.config';
import { stripLeadingSlashes, stripTrailingSlashes } from './strings';

export const WMS = [
  'hyprland', 'sway', 'river', 'niri', 'wayfire', 'labwc',
  'i3', 'bspwm', 'awesome', 'qtile', 'xmonad', 'dwm', 'herbstluftwm', 'openbox',
  'gnome', 'kde', 'xfce', 'cinnamon', 'cosmic', 'any', 'other',
] as const;

export const DISTROS = [
  'arch', 'endeavouros', 'manjaro', 'fedora', 'nixos', 'debian', 'ubuntu', 'mint',
  'void', 'opensuse', 'gentoo', 'alpine', 'any',
] as const;

export const WM_LABELS: Record<(typeof WMS)[number], string> = {
  hyprland: 'Hyprland', sway: 'Sway', river: 'River', niri: 'niri', wayfire: 'Wayfire', labwc: 'labwc',
  i3: 'i3', bspwm: 'bspwm', awesome: 'AwesomeWM', qtile: 'Qtile', xmonad: 'XMonad', dwm: 'dwm',
  herbstluftwm: 'herbstluftwm', openbox: 'Openbox', gnome: 'GNOME', kde: 'KDE Plasma', xfce: 'Xfce',
  cinnamon: 'Cinnamon', cosmic: 'COSMIC', any: 'Any WM / DE', other: 'Other',
};

export const DISTRO_LABELS: Record<(typeof DISTROS)[number], string> = {
  arch: 'Arch Linux', endeavouros: 'EndeavourOS', manjaro: 'Manjaro', fedora: 'Fedora', nixos: 'NixOS',
  debian: 'Debian', ubuntu: 'Ubuntu', mint: 'Linux Mint', void: 'Void Linux', opensuse: 'openSUSE',
  gentoo: 'Gentoo', alpine: 'Alpine', any: 'Any distro',
};

export const THEME_STYLES = [
  'minimalist',
  'cyberpunk',
  'nord',
  'gruvbox',
  'dracula',
  'tokyo-night',
  'catppuccin',
  'solarized',
  'monochrome',
  'rose-pine',
  'material',
  'macos',
  'dynamic',
  'other',
] as const;

export const STYLE_LABELS: Record<(typeof THEME_STYLES)[number], string> = {
  minimalist: 'Minimalist',
  cyberpunk: 'Cyberpunk',
  nord: 'Nord',
  gruvbox: 'Gruvbox',
  dracula: 'Dracula',
  'tokyo-night': 'Tokyo Night',
  catppuccin: 'Catppuccin',
  solarized: 'Solarized',
  monochrome: 'Monochrome',
  'rose-pine': 'Rosé Pine',
  material: 'Material',
  macos: 'macOS-like',
  dynamic: 'Wallpaper-based',
  other: 'Other',
};

/** Which part of the desktop an entry covers — the main catalogue facet. */
export const CATEGORIES = [
  'dotfiles', 'wm', 'bar', 'widgets', 'launcher', 'notifications', 'dock',
  'icons', 'cursors', 'gtk-theme', 'colorscheme', 'login', 'lockscreen', 'boot',
  'extension', 'tool', 'resource',
] as const;

export const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  dotfiles: 'Dotfiles & full rices',
  wm: 'WM & compositors',
  bar: 'Bars & panels',
  widgets: 'Widgets & shells',
  launcher: 'Launchers & menus',
  notifications: 'Notifications',
  dock: 'Docks',
  icons: 'Icon themes',
  cursors: 'Cursor themes',
  'gtk-theme': 'GTK & shell themes',
  colorscheme: 'Color schemes & generators',
  login: 'Login & greeters',
  lockscreen: 'Lock screens',
  boot: 'Boot (GRUB / Plymouth)',
  extension: 'DE extensions',
  tool: 'Tools & utilities',
  resource: 'Lists & guides',
};

const SHA1 = /^[0-9a-f]{40}$/;
/** Tags such as v1.2.0, 1.2, 2025.01.03, release-3 — but never a moving branch name. */
const TAG = /^(v?\d+(\.\d+)*([-+._][0-9A-Za-z.-]+)?|release-[0-9A-Za-z.-]+)$/;
const MOVING_REFS = new Set(['main', 'master', 'dev', 'develop', 'HEAD', 'latest', 'trunk']);

/** A ref is "pinned" when it is a full commit SHA or a version-like tag. */
export function isPinnedRef(ref: string): boolean {
  if (MOVING_REFS.has(ref)) return false;
  return SHA1.test(ref) || TAG.test(ref);
}

/**
 * Extract the git ref from a raw file URL on a supported forge.
 * Returns null when the URL is not a recognised raw-file URL.
 */
export function extractRawRef(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const p = u.pathname.split('/').filter(Boolean);
  switch (u.hostname) {
    case 'raw.githubusercontent.com':
      // /owner/repo/<ref>/path  or /owner/repo/refs/tags/<tag>/path
      if (p[2] === 'refs' && (p[3] === 'tags' || p[3] === 'heads')) return p[3] === 'tags' ? p[4] ?? null : null;
      return p.length >= 4 ? p[2] : null;
    case 'github.com':
      // /owner/repo/raw/<ref>/path
      return p[2] === 'raw' && p.length >= 5 ? p[3] : null;
    case 'gitlab.com': {
      // /owner/repo/-/raw/<ref>/path (groups allowed)
      const i = p.indexOf('-');
      return i > 0 && p[i + 1] === 'raw' && p.length > i + 3 ? p[i + 2] : null;
    }
    case 'codeberg.org':
      // /owner/repo/raw/commit/<sha>/path | /owner/repo/raw/tag/<tag>/path
      return p[2] === 'raw' && (p[3] === 'commit' || p[3] === 'tag') && p.length >= 6 ? p[4] : null;
    default:
      return null;
  }
}

export const SOURCE_HOSTS = ['github.com', 'gitlab.com', 'codeberg.org'] as const;

/*
 * JSON Schema mirrors of the refinements below. Zod drops `.refine()` when exporting,
 * so these patterns are attached via `.meta()` and land in schema/config.schema.json
 * (editor autocompletion + validation). Zod stays authoritative in CI.
 */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PINNED = `(?:${SHA1.source.slice(1, -1)}|${TAG.source.slice(1, -1)})`;
const PINNED_REF_PATTERN = `^${PINNED}$`;
const IMAGE_URL_PATTERN = `^(?:\\.?/|https://(?:${ALLOWED_IMAGE_HOSTS.map(esc).join('|')})/)`;
const SOURCE_REPO_PATTERN = `^https://(?:${SOURCE_HOSTS.map(esc).join('|')})/[^/]+/[^/]+`;
const PINNED_RAW_URL_PATTERN =
  `^https://(?:raw\\.githubusercontent\\.com/[^/]+/[^/]+/(?:refs/tags/)?${PINNED}/` +
  `|github\\.com/[^/]+/[^/]+/raw/${PINNED}/` +
  `|gitlab\\.com/.+/-/raw/${PINNED}/` +
  `|codeberg\\.org/[^/]+/[^/]+/raw/(?:commit|tag)/${PINNED}/).+`;

/** Parse a URL without throwing (Zod 4 keeps running refinements after a failed check). */
export function safeUrl(v: string): URL | null {
  try { return new URL(v); } catch { return null; }
}

const https = z
  .url()
  .refine((v) => v.startsWith('https://'), { message: 'Must be an https:// URL' })
  .meta({ pattern: '^https://' });

export function isAllowedImageUrl(v: string): boolean {
  if (v.startsWith('/') || v.startsWith('./')) return true;
  const u = safeUrl(v);
  return !!u && u.protocol === 'https:' && (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(u.hostname);
}

const imageUrl = z
  .string()
  .min(1)
  .refine(isAllowedImageUrl, {
    message: `Image must be a local path (/...) or from allowed hosts: ${ALLOWED_IMAGE_HOSTS.join(', ')}`,
  })
  .meta({ pattern: IMAGE_URL_PATTERN, description: `Local path (/...) or https URL on: ${ALLOWED_IMAGE_HOSTS.join(', ')}` });

const pinnedRawUrl = https.refine(
  (v) => {
    const ref = extractRawRef(v);
    return ref !== null && isPinnedRef(ref);
  },
  { message: 'Script URL must be a raw file URL pinned to a full commit SHA or a version tag (no branch names)' },
).meta({ pattern: PINNED_RAW_URL_PATTERN, description: 'Raw file URL pinned to a full commit SHA or a version tag' });

const command = z.string().min(1).max(500);

export const configSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().min(3).max(80),
    author: z.object({
      name: z.string().min(1).max(60),
      github: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, 'Invalid GitHub username'),
    }),
    lang: z.enum(['fr', 'en']).default('en'),
    summary: z.string().min(10).max(200),
    description: z.string().max(2000).optional(),
    license: z.string().regex(/^[A-Za-z0-9.+-]+( (AND|OR|WITH) [A-Za-z0-9.+-]+)*$/, 'Use an SPDX identifier, e.g. MIT, GPL-3.0-only'),
    version: z.string().max(40).optional(),
    updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    distros: z.array(z.enum(DISTROS)).min(1).max(8),
    category: z.enum(CATEGORIES).default('dotfiles'),
    wm: z.enum(WMS),
    themeStyle: z.enum(THEME_STYLES).default('minimalist'),
    displayServer: z.enum(['wayland', 'x11', 'both']),
    tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,29}$/, 'Tags: lowercase, digits, dashes')).max(10).default([]),
    specs: z
      .object({
        bar: z.string().max(60).optional(),
        terminal: z.string().max(60).optional(),
        launcher: z.string().max(60).optional(),
        notifications: z.string().max(60).optional(),
        theme: z.string().max(80).optional(),
        shell: z.string().max(60).optional(),
        editor: z.string().max(60).optional(),
      })
      .default({}),
    screenshots: z
      .array(
        z.object({
          url: imageUrl,
          alt: z.string().min(5).max(200),
          caption: z.string().max(60).optional(),
        }),
      )
      .min(1)
      .max(8),
    source: z.object({
      repo: https.refine((v) => {
        const u = safeUrl(v);
        return !!u && (SOURCE_HOSTS as readonly string[]).includes(u.hostname) && u.pathname.split('/').filter(Boolean).length >= 2;
      }, { message: `Source repo must be on ${SOURCE_HOSTS.join(', ')}` })
        .meta({ pattern: SOURCE_REPO_PATTERN, description: `Repository on ${SOURCE_HOSTS.join(', ')}` }),
      ref: z.string().refine(isPinnedRef, { message: 'source.ref must be a full commit SHA or a version tag' })
        .meta({ pattern: PINNED_REF_PATTERN, description: 'Full 40-char commit SHA or version tag (never a branch)' }),
      readme: z
        .string()
        .regex(/^[\w./-]+\.(md|markdown)$/i)
        .refine((v) => !v.includes('..'), { message: 'source.readme must not contain ..' })
        .default('README.md'),
    }),
    install: z
      .object({
        script: z
          .object({
            url: pinnedRawUrl,
            sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex chars'),
            shell: z.enum(['sh', 'bash']).default('bash'),
          })
          .optional(),
        // "02. Installation & Deployment" on the detail page: at least the `deps` step is mandatory.
        steps: z
          .array(
            z.object({
              id: z.enum(['deps', 'dotfiles', 'reload']).meta({
                description: 'deps = install packages / clone, dotfiles = deploy config or theme, reload = apply or restart',
              }),
              title: z.string().min(3).max(80),
              commands: z.array(command).min(1).max(30),
            }),
          )
          .min(1, 'Provide at least one install step (deps), shown under "02. Installation & Deployment"')
          .max(3)
          .refine((steps) => new Set(steps.map((s) => s.id)).size === steps.length, { message: 'Each step id may appear only once' }),
        packages: z
          .array(z.object({ type: z.enum(['tar.gz', 'zip', 'deb', 'rpm', 'aur', 'nix', 'flatpak']), url: https }))
          .max(6)
          .default([]),
      }),
    keybindings: z
      .array(z.object({ keys: z.string().max(40), action: z.string().max(80), effect: z.string().max(120).optional() }))
      .max(30)
      .default([]),
    review: z
      .object({
        installReviewed: z.boolean().default(false),
        reviewedBy: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, 'Invalid GitHub username').optional(),
        reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
      })
      .optional(),
    example: z.boolean().default(false),
  })
  .strict()
  .superRefine((data, ctx) => {
    const { errors } = validateCloneSteps(data);
    for (const err of errors) {
      ctx.addIssue({
        code: 'custom',
        path: ['install', 'steps'],
        message: err,
      });
    }
  });

// Astro's content sync calls `schema.extend({ $schema: ... })`, which Zod 4 forbids on refined objects with existing keys unless `safeExtend` is used.
configSchema.extend = configSchema.safeExtend.bind(configSchema) as typeof configSchema.extend;

export type ConfigData = z.output<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;

export interface CloneValidationResult {
  errors: string[];
  warnings: string[];
}

/** Normalize a repository URL for comparison (lowercase, strip trailing slash and `.git`). */
export function normalizeRepoUrl(url: string): string {
  const unquoted = url.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return stripTrailingSlashes(stripTrailingSlashes(unquoted).replace(/\.git$/, ''));
}

/** `curl … | sh`, `bash -c "$(curl …)"`, `bash <(curl …)` and the wget equivalents. */
const REMOTE_EXEC_RE = /(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b|(?:ba|z)?sh\s+(?:-c\s+["']?\$\(|<\()\s*(?:curl|wget)\b/;

/**
 * Validate `git clone` commands in `install.steps`:
 * - Commands that download a script and run it must use a pinned raw URL.
 * - Any `git clone` using `--depth` is an error (shallow clones cannot check out an arbitrary SHA).
 * - Any `git clone` of `source.repo` must be followed by a later command containing `checkout {{ref}}`.
 * - Clones of other repositories produce a warning, not an error.
 */
export function validateCloneSteps(data: {
  source: { repo: string };
  install: { steps: { commands: string[] }[] };
}): CloneValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedSourceRepo = normalizeRepoUrl(data.source.repo);
  const allCommands = data.install.steps.flatMap((s) => s.commands);

  for (let i = 0; i < allCommands.length; i++) {
    const cmd = allCommands[i];
    if (cmd.trim().startsWith('#')) continue;

    // Remote code run straight from a URL must be pinned, or what users run can change after review.
    if (REMOTE_EXEC_RE.test(cmd)) {
      for (const url of cmd.match(/https?:\/\/[^\s"')]+/g) ?? []) {
        const ref = extractRawRef(url);
        if (!url.includes('{{ref}}') && !(ref && isPinnedRef(ref))) {
          errors.push(`remote script must be a raw file URL pinned to a commit SHA, a version tag or {{ref}}: ${url}`);
        }
      }
    }

    if (!/\bgit\s+clone\b/.test(cmd)) continue;

    if (/(?:^|\s)--depth(?:=|\s|$)/.test(cmd)) {
      errors.push(`git clone must not use --depth (use --filter=blob:none instead): ${cmd}`);
    }

    const cloneClause = cmd.split(/&&|\|\||;|\|/)[0] ?? cmd;
    const urlMatch = cloneClause.match(/(?:https?:\/\/|git@|ssh:\/\/|git:\/\/)[^\s"']+/i);
    if (!urlMatch) continue;

    const clonedRepoUrl = urlMatch[0];
    if (normalizeRepoUrl(clonedRepoUrl) === normalizedSourceRepo) {
      const hasLaterCheckout = allCommands
        .slice(i + 1)
        .some((later) => !later.trim().startsWith('#') && later.includes('checkout {{ref}}'));
      if (!hasLaterCheckout) {
        errors.push(`git clone of source.repo must be followed by a command containing 'checkout {{ref}}': ${cmd}`);
      }
    } else {
      warnings.push(
        `git clone targets external repository '${clonedRepoUrl}' instead of source.repo '${data.source.repo}'`,
      );
    }
  }

  return { errors, warnings };
}

/** `configs/<author>/<slug>.json` → `<author>/<slug>` */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
export function idFromPath(path: string): { id: string; author: string; slug: string } | null {
  const m = path.replace(/\\/g, '/').match(/(?:^|\/)configs\/([^/]+)\/([^/]+)\.json$/);
  if (!m) return null;
  return { id: `${m[1]}/${m[2]}`, author: m[1], slug: m[2] };
}

/** Raw README URL for a pinned source repo. */
export function readmeRawUrl(source: ConfigData['source']): string {
  const u = new URL(source.repo);
  const [owner, repo] = u.pathname.split('/').filter(Boolean);
  const r = repo.replace(/\.git$/, '');
  switch (u.hostname) {
    case 'gitlab.com':
      return `https://gitlab.com/${owner}/${r}/-/raw/${source.ref}/${source.readme}`;
    case 'codeberg.org':
      return `https://codeberg.org/${owner}/${r}/raw/${SHA1.test(source.ref) ? 'commit' : 'tag'}/${source.ref}/${source.readme}`;
    default:
      return `https://raw.githubusercontent.com/${owner}/${r}/${source.ref}/${source.readme}`;
  }
}

/** Browsable (HTML) blob URL for a file in a pinned source repo on GitHub, GitLab, or Codeberg. */
export function blobUrl(
  source: { repo: string; ref: string; readme?: string },
  path: string = source.readme || 'README.md',
): string {
  const u = new URL(source.repo);
  const repoPath = stripTrailingSlashes(u.pathname).replace(/\.git$/, '');
  const cleanPath = stripLeadingSlashes(path);
  switch (u.hostname) {
    case 'gitlab.com':
      return `https://gitlab.com${repoPath}/-/blob/${source.ref}/${cleanPath}`;
    case 'codeberg.org':
      return `https://codeberg.org${repoPath}/src/${SHA1.test(source.ref) ? 'commit' : 'tag'}/${source.ref}/${cleanPath}`;
    default:
      return `https://github.com${repoPath}/blob/${source.ref}/${cleanPath}`;
  }
}

/** Browsable (HTML) URL for a pinned raw file, used for the "View source" link. */
export function rawToBlobUrl(raw: string): string {
  const u = new URL(raw);
  if (u.hostname === 'raw.githubusercontent.com') {
    const [o, r, ...rest] = u.pathname.split('/').filter(Boolean);
    return `https://github.com/${o}/${r}/blob/${rest.join('/')}`;
  }
  return raw.replace('/-/raw/', '/-/blob/').replace('/raw/', '/src/');
}
