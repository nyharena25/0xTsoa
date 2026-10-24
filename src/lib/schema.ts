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

/** "key = Label, key = Label" for enum descriptions, so editor hover help matches the site's labels. */
const choices = (labels: Record<string, string>) => Object.entries(labels).map(([k, v]) => `${k} = ${v}`).join(', ');

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
  .meta({
    pattern: IMAGE_URL_PATTERN,
    description: `Direct image link (https) on: ${ALLOWED_IMAGE_HOSTS.join(', ')}. A clean 1080p/1440p capture works best.`,
    examples: ['https://raw.githubusercontent.com/my-handle/dots/v1.0.0/preview.png'],
  });

const pinnedRawUrl = https.refine(
  (v) => {
    const ref = extractRawRef(v);
    return ref !== null && isPinnedRef(ref);
  },
  { message: 'Script URL must be a raw file URL pinned to a full commit SHA or a version tag (no branch names)' },
).meta({
  pattern: PINNED_RAW_URL_PATTERN,
  description: 'Optional upstream install script: raw file URL pinned to a full commit SHA or a version tag (never a branch).',
  examples: ['https://raw.githubusercontent.com/my-handle/dots/v1.0.0/install.sh'],
});

const command = z.string().min(1).max(500).meta({
  description: 'One shell command, written as you would type it (no sudo bash, no curl | bash from an unpinned URL). Lines starting with # are shown as notes; {{ref}} is replaced with source.ref.',
});

export const configSchema = z
  .object({
    $schema: z.string().optional().meta({ description: 'Editor help. Keep "../../schema/config.schema.json".' }),
    name: z.string().min(3).max(80).meta({ description: 'Display name of the project (3–80 chars).', examples: ['Hyprland Paper Minimal'] }),
    author: z.object({
      name: z.string().min(1).max(60).meta({ description: 'Name shown on the page.' }),
      github: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, 'Invalid GitHub username').meta({
        description: 'GitHub username of the author. Must match the folder name: configs/<github>/<slug>.json.',
      }),
    }).meta({ description: 'Who made the setup (credit the original author if it is not you).' }),
    lang: z.enum(['fr', 'en']).default('en').meta({ description: 'Language of summary and description. Default: en.' }),
    summary: z.string().min(10).max(200).meta({ description: 'One sentence shown on cards and search results (10–200 chars).', examples: ['Blazing-fast Wayland desktop with Waybar and Kitty.'] }),
    description: z.string().max(2000).optional().meta({ description: 'Optional longer text: layout, workflow, what makes it special (max 2000 chars). Also searched.' }),
    license: z.string().regex(/^[A-Za-z0-9.+-]+( (AND|OR|WITH) [A-Za-z0-9.+-]+)*$/, 'Use an SPDX identifier, e.g. MIT, GPL-3.0-only').meta({
      description: 'SPDX license identifier of the upstream project.',
      examples: ['MIT', 'GPL-3.0-only', 'CC0-1.0'],
    }),
    version: z.string().max(40).optional().meta({ description: 'Optional version label shown on the page.', examples: ['v1.0.0'] }),
    updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').meta({ description: 'Date of the pinned source.ref, as YYYY-MM-DD. Drives the "newest" sort.', examples: ['2026-10-22'] }),
    distros: z.array(z.enum(DISTROS)).min(1).max(8).meta({ description: `Distributions it was tested on (1–8). Use ["any"] for distro-independent themes and tools. Choices: ${choices(DISTRO_LABELS)}.` }),
    category: z.enum(CATEGORIES).default('dotfiles').meta({ description: `Which part of the desktop it covers (main catalogue filter): ${choices(CATEGORY_LABELS)}.` }),
    wm: z.enum(WMS).meta({ description: `Window manager / compositor / DE it targets. Use "any" if it is not tied to one. Choices: ${choices(WM_LABELS)}.` }),
    themeStyle: z.enum(THEME_STYLES).default('minimalist').meta({ description: `Dominant palette or look ("Browse by theme" filter): ${choices(STYLE_LABELS)}.` }),
    displayServer: z.enum(['wayland', 'x11', 'both']).meta({ description: 'Display server it runs on.' }),
    tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,29}$/, 'Tags: lowercase, digits, dashes')).max(10).default([]).meta({
      description: 'Up to 10 search keywords: components and features (waybar, rofi, auto-install). Do not repeat the WM, distro, display server or theme style: they are already filters.',
      examples: [['waybar', 'rofi', 'auto-install']],
    }),
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
      .default({})
      .meta({ description: 'Optional component names shown in the spec table (all optional, free text).', examples: [{ bar: 'Waybar', terminal: 'Kitty', launcher: 'Rofi' }] }),
    screenshots: z
      .array(
        z.object({
          url: imageUrl,
          alt: z.string().min(5).max(200).meta({ description: 'What the image shows, for screen readers (5–200 chars).', examples: ['Hyprland desktop with Waybar and two Kitty windows'] }),
          caption: z.string().max(60).optional().meta({ description: 'Optional short caption shown under the image.' }),
        }),
      )
      .min(1)
      .max(8)
      .meta({ description: 'Screenshots, 1–8. The first one is the card thumbnail.' }),
    source: z.object({
      repo: https.refine((v) => {
        const u = safeUrl(v);
        return !!u && (SOURCE_HOSTS as readonly string[]).includes(u.hostname) && u.pathname.split('/').filter(Boolean).length >= 2;
      }, { message: `Source repo must be on ${SOURCE_HOSTS.join(', ')}` })
        .meta({ pattern: SOURCE_REPO_PATTERN, description: `Public repository on ${SOURCE_HOSTS.join(', ')}.`, examples: ['https://github.com/my-handle/dots'] }),
      ref: z.string().refine(isPinnedRef, { message: 'source.ref must be a full commit SHA or a version tag' })
        .meta({
          pattern: PINNED_REF_PATTERN,
          description: 'Exact version users install: a full 40-char commit SHA or a version tag, never a branch. Get a SHA with: git rev-parse HEAD',
          examples: ['v1.0.0', 'f35639dee902020dd6309cd167956f144c7db8d6'],
        }),
      readme: z
        .string()
        .regex(/^[\w./-]+\.(md|markdown)$/i)
        .refine((v) => !v.includes('..'), { message: 'source.readme must not contain ..' })
        .default('README.md')
        .meta({ description: 'README path in the repo, rendered on the page. Default: README.md.' }),
    }).meta({ description: 'Where the code lives and which exact version is listed.' }),
    install: z
      .object({
        script: z
          .object({
            url: pinnedRawUrl,
            sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex chars').meta({ description: 'SHA-256 of that file: sha256sum install.sh' }),
            shell: z.enum(['sh', 'bash']).default('bash').meta({ description: 'Shell the script needs. Default: bash.' }),
          })
          .optional()
          .meta({ description: 'Optional: only if the upstream project ships its own installer script. Most entries leave this out and use steps.' }),
        // "02. Installation & Deployment" on the detail page. At least one step unless category is resource (enforced below).
        steps: z
          .array(
            z.object({
              id: z.enum(['deps', 'dotfiles', 'reload']).meta({
                description: 'deps = install packages / clone, dotfiles = deploy config or theme, reload = apply or restart',
              }),
              title: z.string().min(3).max(80).meta({ description: 'Step heading shown on the page.', examples: ['Install dependencies'] }),
              commands: z.array(command).min(1).max(30).meta({ description: '1–30 shell commands, run in order.' }),
            }),
          )
          .max(3)
          .refine((steps) => new Set(steps.map((s) => s.id)).size === steps.length, { message: 'Each step id may appear only once' })
          .meta({
            description:
              '1–3 steps (deps, dotfiles, reload), shown as manual steps and turned into the guided installer. Write plain commands: package installs, git clone + git -C <dir> checkout {{ref}}, cp into specific folders. The installer adds the plan, backups and rollback.',
          }),
        packages: z
          .array(z.object({ type: z.enum(['tar.gz', 'zip', 'deb', 'rpm', 'aur', 'nix', 'flatpak']), url: https }))
          .max(6)
          .default([])
          .meta({ description: 'Optional download links (AUR, Flatpak, .deb…) shown as alternatives.' }),
      })
      .optional()
      .meta({ description: 'How to install it (section 02 of the page). Required, except for "resource" (Lists & guides) entries, which are read online.' }),
    keybindings: z
      .array(z.object({ keys: z.string().max(40), action: z.string().max(80), effect: z.string().max(120).optional() }))
      .max(30)
      .default([])
      .meta({ description: 'Optional keyboard shortcuts table.', examples: [[{ keys: 'SUPER + Return', action: 'exec, kitty', effect: 'Open terminal' }]] }),
    review: z
      .object({
        installReviewed: z.boolean().default(false),
        reviewedBy: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, 'Invalid GitHub username').optional(),
        reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
      })
      .optional()
      .meta({ description: 'Set by maintainers after reviewing the install steps. Leave out.' }),
    example: z.boolean().default(false).meta({ description: 'Internal: marks demo entries. Leave out.' }),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.category !== 'resource' && !hasInstallSteps(data)) {
      ctx.addIssue({ code: 'custom', path: ['install', 'steps'], message: NO_STEPS_MESSAGE });
    }
    const { errors } = validateCloneSteps(data);
    for (const err of errors) {
      ctx.addIssue({
        code: 'custom',
        path: ['install', 'steps'],
        message: err,
      });
    }
  })
  // JSON Schema mirror of the install rule above (category defaults to dotfiles, so a missing category needs install).
  .meta({ if: { properties: { category: { const: 'resource' } }, required: ['category'] }, else: { required: ['install'] } });

// Astro's content sync calls `schema.extend({ $schema: ... })`, which Zod 4 forbids on refined objects with existing keys unless `safeExtend` is used.
configSchema.extend = configSchema.safeExtend.bind(configSchema) as typeof configSchema.extend;

export type ConfigData = z.output<typeof configSchema>;

const NO_STEPS_MESSAGE = 'Provide at least one install step (deps), shown under "02. Installation & Deployment". Only "resource" (Lists & guides) entries may leave install out.';

/** Entries without steps (reading lists) get a "Read online" block instead of the installer. */
export function hasInstallSteps(data: { install?: { steps: unknown[] } }): boolean {
  return (data.install?.steps.length ?? 0) > 0;
}
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
  install?: { steps: { commands: string[] }[] };
}): CloneValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedSourceRepo = normalizeRepoUrl(data.source.repo);
  const allCommands = (data.install?.steps ?? []).flatMap((s) => s.commands);

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

/**
 * Paths inside source.repo that the install steps rely on ("themes/catppuccin-mocha.lua",
 * "Scripts/install.sh"): any path under the clone folder of source.repo, plus `./script` and
 * `bash file` run after `cd` into it. CI and the nightly sync check them against the pinned commit,
 * so a step cannot point at a file the reviewed version does not have.
 */
export function repoPathsInSteps(data: { source: { repo: string }; install?: { steps: { commands: string[] }[] } }): string[] {
  const repo = normalizeRepoUrl(data.source.repo);
  const found = new Set<string>();
  let dest: string | null = null;
  // Where the shell is inside the clone ('' = its root), or null when outside it.
  let cwd: string | null = null;

  const unquote = (w: string) => w.replace(/^['"]+|['";]+$/g, '').replace(/\/+$/, '');
  const inClone = (w: string): string | null => {
    const token = unquote(w);
    if (!dest) return null;
    if (token === dest) return '';
    return token.startsWith(`${dest}/`) ? token.slice(dest.length + 1) : null;
  };

  const commands = (data.install?.steps ?? []).flatMap((s) => s.commands).map((c) => c.trim());
  for (const cmd of commands.filter((c) => c && !c.startsWith('#'))) {
    for (const part of cmd.split(/\s*&&\s*/)) {
      const words = part.split(/\s+/).filter(Boolean);
      if (words[0] === 'sudo') words.shift();
      if (words[0] === 'git' && words[1] === 'clone') {
        const operands = words.slice(2).filter((w) => !w.startsWith('-'));
        if (operands[0] && normalizeRepoUrl(operands[0]) === repo) {
          dest = unquote(operands[1] ?? operands[0].split('/').pop()!.replace(/\.git$/, ''));
          cwd = null;
        }
        continue;
      }
      if (words[0] === 'cd') {
        cwd = words[1] ? inClone(words[1]) : null;
        continue;
      }
      if (words[0] === 'git') continue; // git -C <clone> checkout …
      words.forEach((w, k) => {
        if (/[*?${}]/.test(w)) return; // globs, variables, brace expansion, {{ref}}
        const rel = inClone(w);
        if (rel) {
          found.add(rel);
          return;
        }
        if (cwd === null) return;
        const local = w.startsWith('./') ? unquote(w.slice(2)) : k === 1 && /^(?:ba)?sh$/.test(words[0]) && !w.startsWith('-') ? unquote(w) : null;
        if (local) found.add(cwd ? `${cwd}/${local}` : local);
      });
    }
  }
  return [...found];
}

const PACKAGE_INSTALL_RE =
  /^(?:sudo\s+)?(?:pacman\s+-S\w*|apt(?:-get)?\s+install|dnf\s+install|zypper\s+install|(?:yay|paru)\s+-S\w*|flatpak\s+install)\s+(.*)$/;

/**
 * True when the steps install the project as released distro packages and never clone source.repo
 * or fetch an install script: users get a packaged release, so the nightly sync pins the entry to
 * the latest release tag instead of the default branch. Packages ending in -git are built from the
 * branch, so entries using one keep following it.
 */
export function installsReleasePackages(data: {
  source: { repo: string };
  install?: { script?: unknown; steps: { commands: string[] }[] };
}): boolean {
  if (data.install?.script) return false;
  const repo = normalizeRepoUrl(data.source.repo);
  let packaged = false;
  const commands = (data.install?.steps ?? []).flatMap((s) => s.commands).map((c) => c.trim());
  for (const part of commands.filter((c) => c && !c.startsWith('#')).flatMap((c) => c.split(/\s*&&\s*/))) {
    const clone = part.match(/\bgit\s+clone\b.*?((?:https?:\/\/|git@)\S+)/);
    if (clone && normalizeRepoUrl(clone[1]) === repo) return false;
    const pkg = PACKAGE_INSTALL_RE.exec(part);
    if (!pkg) continue;
    const names = pkg[1].replace(/\s+#.*$/, '').split(/\s+/).filter((w) => w && !w.startsWith('-'));
    if (names.some((n) => n.endsWith('-git'))) return false;
    packaged = true;
  }
  return packaged;
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
