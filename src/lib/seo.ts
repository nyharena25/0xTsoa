/**
 * Search titles and meta descriptions for config pages, written the way people search
 * ("Orchis GTK Theme", "ML4W Dotfiles for Hyprland") instead of the registry's field labels.
 */
import { WM_LABELS, DISTRO_LABELS, type ConfigData } from './schema';
import type { InstallDifficulty, InstallImpact } from './install';

/** Base.astro appends " — 0xTsoa" (9 characters); Google shows about 60. */
export const TITLE_SUFFIX = ' — 0xTsoa';
export const TITLE_MAX = 60 - TITLE_SUFFIX.length;
export const DESCRIPTION_MAX = 160;

interface Noun {
  /** What people call it in searches. Empty: the project name says it already. */
  noun: string;
  /** Whole words (plural allowed) that, already in the name, make the noun redundant. */
  present: string[];
  /** Mentioned in the noun, so "for <WM>" is not added again. */
  wmInNoun?: boolean;
  /** "Catppuccin GRUB" → "Catppuccin GRUB Theme" when a `present` word made the noun redundant. */
  themeSuffix?: boolean;
}

/** Tools and generators are named by what they do, read from their tags. */
const TOOL_NOUNS: [tag: string, noun: string][] = [
  ['dotfile-manager', 'Dotfiles Manager'],
  ['fetch', 'System Info Tool'],
  ['wallpaper', 'Wallpaper Daemon'],
  ['system-monitor', 'System Monitor'],
  ['file-preview', 'File Previewer'],
  ['settings', 'Settings App'],
];

function categoryNoun(data: ConfigData): Noun {
  switch (data.category) {
    case 'dotfiles':
      return { noun: 'Dotfiles', present: [] };
    case 'wm':
      return { noun: 'Window Manager', present: ['compositor', 'window manager', 'wm', 'workstation'] };
    case 'bar':
      return { noun: 'Status Bar', present: ['bar', 'panel', 'themes'] };
    case 'widgets':
      return { noun: 'Desktop Widgets', present: ['widget', 'shell'] };
    case 'launcher':
      return { noun: 'App Launcher', present: ['launcher', 'menu', 'themes'] };
    case 'notifications':
      return { noun: 'Notification Daemon', present: ['notification', 'notify'] };
    case 'dock':
      return { noun: 'Dock', present: [] };
    case 'icons':
      return { noun: 'Icon Theme', present: ['icon'] };
    case 'cursors':
      return { noun: 'Cursor Theme', present: ['cursor'] };
    case 'gtk-theme':
      return { noun: 'GTK Theme', present: ['theme'] };
    case 'colorscheme':
      return data.tags.includes('wallpaper-colors')
        ? { noun: 'Color Generator', present: [] }
        : { noun: 'Color Scheme', present: ['color', 'colour', 'palette', 'theme'] };
    case 'login':
      return { noun: 'Login Screen', present: ['login', 'display manager', 'sddm', 'lightdm'], themeSuffix: true };
    case 'lockscreen':
      return { noun: 'Lock Screen', present: ['lock'] };
    case 'boot':
      return { noun: 'Boot Theme', present: ['grub', 'grub2', 'plymouth', 'boot'], themeSuffix: true };
    case 'extension':
      return data.wm === 'gnome'
        ? { noun: 'GNOME Extension', present: ['extension'], wmInNoun: true }
        : data.wm === 'kde'
          ? { noun: 'KDE Plasma Extension', present: ['extension'], wmInNoun: true }
          : { noun: 'Desktop Extension', present: ['extension'] };
    case 'tool':
      return { noun: TOOL_NOUNS.find(([tag]) => data.tags.includes(tag))?.[1] ?? '', present: [] };
    case 'resource':
      return { noun: '', present: [] };
  }
}

const DOT_WORDS = /\b(dotfiles|dots|rice|config)\b/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, word: string) => text.toLowerCase().includes(word.toLowerCase());
/** Whole word, singular or plural: "Catppuccin Cursors" has "cursor", "Waybar" has no "bar". */
const hasWord = (text: string, word: string) => new RegExp(`(^|[^\\w-])${escapeRe(word)}s?($|[^\\w-])`, 'i').test(text);

/** "Catppuccin GTK" + "GTK Theme" → "Catppuccin GTK Theme"; "Catppuccin Cursors" + "Cursor Theme" → unchanged. */
export function withNoun(name: string, { noun, present, themeSuffix }: Noun): string {
  if (!noun) return name;
  const words = noun.split(' ');
  for (let k = words.length - 1; k >= 1; k--) {
    if (name.toLowerCase().endsWith(` ${words.slice(0, k).join(' ').toLowerCase()}`)) {
      return `${name} ${words.slice(k).join(' ')}`;
    }
  }
  if ([...present, ...words].some((w) => hasWord(name, w))) {
    return themeSuffix && !/\b(themes?|manager)$/i.test(name) ? `${name} Theme` : name;
  }
  return `${name} ${noun}`;
}

/** Search title without the site suffix, at most TITLE_MAX characters. */
export function configSeoTitle(data: ConfigData): string {
  const wm = data.wm === 'any' || data.wm === 'other' ? null : WM_LABELS[data.wm];
  const distro = data.distros[0] === 'any' ? null : DISTRO_LABELS[data.distros[0]];
  const candidates: string[] = [];

  if (data.category === 'dotfiles') {
    const target = wm ?? 'Linux';
    const named = DOT_WORDS.test(data.name);
    const base = named && has(data.name, target)
      ? data.name
      : named
        ? `${data.name} for ${target}`
        : has(data.name, target)
          ? `${data.name} Dotfiles`
          : `${data.name}: ${target} Dotfiles`;
    if (distro && !has(base, distro)) candidates.push(`${base} on ${distro}`);
    candidates.push(base);
  } else {
    const noun = categoryNoun(data);
    const base = withNoun(data.name, noun);
    if (wm && !noun.wmInNoun && !has(base, wm)) candidates.push(`${base} for ${wm}`);
    else if (!noun.noun && data.category === 'tool') candidates.push(`${base} for Linux`);
    candidates.push(base);
  }
  // One colon per title at most: "Crystal: AwesomeWM Dotfiles" gets no ": Preview & Install".
  if (data.category !== 'resource' && !candidates[0].includes(':')) candidates.unshift(`${candidates[0]}: Preview & Install`);

  const fit = candidates.find((c) => c.length <= TITLE_MAX);
  return fit ?? data.name.slice(0, TITLE_MAX).replace(/\s+\S*$/, '');
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** One short sentence on what installing it does to your system. */
export function impactSentence(difficulty: InstallDifficulty | null, impact: InstallImpact): string {
  const packages = impact.packages.length + impact.aurPackages.length;
  switch (difficulty) {
    case null:
      return 'A curated reading list: nothing to install.';
    case 'manual':
      return 'Pinned source; you set it up by hand from the upstream guide.';
    case 'easy':
      return 'Only copies files into your home folder, undone with one command.';
    case 'moderate':
      if (packages === 0) return 'Changes desktop settings; file changes can be rolled back.';
      return impact.userPaths.length > 0
        ? `Installs ${plural(packages, 'package')}; file changes can be rolled back.`
        : `Installs ${plural(packages, 'package')} from your distro's repositories.`;
    case 'advanced':
      if (impact.upstreamCommands.length > 0) return 'Runs its own installer: preview it and back up first.';
      if (impact.aurPackages.length > 0) {
        return impact.aurPackages.length === packages
          ? `Installs ${plural(packages, 'package')} from the AUR.`
          : `Installs ${plural(packages, 'package')}, some from the AUR.`;
      }
      return 'Changes system files with sudo: read the steps first.';
  }
}

/** Meta description: what it is, what it works with, what installing it changes. At most 160 characters. */
export function configSeoDescription(data: ConfigData, difficulty: InstallDifficulty | null, impact: InstallImpact): string {
  const summary = `${data.summary.trim().replace(/\.+$/, '')}.`;
  const server = data.displayServer === 'both' ? 'Wayland & X11' : data.displayServer === 'wayland' ? 'Wayland' : 'X11';
  const distros = data.distros.includes('any') ? '' : ` on ${data.distros.slice(0, 2).map((d) => DISTRO_LABELS[d]).join(', ')}`;
  const works =
    data.wm === 'any' || data.wm === 'other'
      ? `Works with any desktop (${server})${distros}.`
      : `For ${WM_LABELS[data.wm]} (${server})${distros}.`;
  const effect = impactSentence(difficulty, impact);

  for (const parts of [[summary, works, effect], [summary, effect], [summary, works], [summary]]) {
    const text = parts.join(' ');
    if (text.length <= DESCRIPTION_MAX) return text;
  }
  return `${summary.slice(0, DESCRIPTION_MAX - 1).replace(/\s+\S*$/, '')}…`;
}
