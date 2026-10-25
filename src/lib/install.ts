import { DISTRO_LABELS, WM_LABELS, normalizeRepoUrl, type ConfigData } from './schema';

import { SITE_URL, REPO_OWNER, REPO_NAME, withBase } from '../../site.config';
import RUNTIME from './installer-runtime.sh?raw';
import { stripNewlines, classifyCommand, type InstallAction } from './commands';

export { normalizeRepoUrl, classifyCommand, type InstallAction };
export { validateCloneSteps, type CloneValidationResult } from './schema';
export { renderCommand } from './commands';

/** POSIX single-quote escaping: wraps in `'` and escapes internal `'` as `'\''`. */
export function shQuote(s: string): string {
  return `'${s.replaceAll("'", "'\\''")}'`;
}

/** Build a SHA-256 verified one-liner for executing a remote install script. */
export function verifiedScriptCommand(script: {
  url: string;
  sha256: string;
  shell?: 'sh' | 'bash';
}): string {
  const shell = script.shell === 'sh' ? 'sh' : 'bash';
  return `f=$(mktemp) && curl -fsSL ${shQuote(script.url)} -o "$f" && echo '${script.sha256}  '"$f" | sha256sum -c - && ${shell} "$f"`;
}

/**
 * Home-relative folders an upstream installer (`./setup.sh`, `make install`…) usually rewrites.
 * The installer backs them up right before such a step; the page offers the same list for manual installs.
 */
export const UPSTREAM_BACKUP_PATHS = [
  '.config/hypr', '.config/quickshell', '.config/waybar', '.config/eww', '.config/ags', '.config/hyprpanel',
  '.config/kitty', '.config/foot', '.config/alacritty', '.config/wezterm', '.config/ghostty',
  '.config/rofi', '.config/wofi', '.config/fuzzel', '.config/dunst', '.config/mako', '.config/swaync',
  '.config/i3', '.config/sway', '.config/niri', '.config/bspwm', '.config/sxhkd', '.config/awesome',
  '.config/polybar', '.config/picom', '.config/qtile', '.config/wlogout', '.config/swaylock',
  '.config/fish', '.config/nvim', '.config/fastfetch', '.config/starship.toml', '.config/matugen', '.config/wal',
  '.config/gtk-3.0', '.config/gtk-4.0', '.config/Kvantum', '.config/qt5ct', '.config/qt6ct',
  '.bashrc', '.zshrc', '.themes',
] as const;

function actionToShell(a: InstallAction): string {
  switch (a.kind) {
    case 'note':
      return `note ${shQuote(a.text)}`;
    case 'package':
      return `${a.aur ? 'aur_install' : 'pkg_install'} ${a.packages.map(shQuote).join(' ')}`;
    // clone/copy/append keep the config's own words so bash expands ~ and globs as before.
    case 'clone':
      return `oxt_clone ${a.args}`;
    case 'copy':
      return `oxt_copy ${a.args}`;
    case 'append':
      return `oxt_append ${a.line} ${a.file}`;
    case 'upstream':
      return `oxt_upstream ${shQuote(a.command)}`;
    case 'system':
      return `oxt_system ${shQuote(a.command)}`;
    case 'reload':
      return `oxt_reload ${shQuote(a.command)}`;
    case 'exec':
      return `oxt_exec ${shQuote(a.command)}`;
  }
}

function allStepsActions(data: ConfigData): InstallAction[] {
  return (data.install?.steps ?? []).flatMap((step) => step.commands.flatMap((cmd) => classifyCommand(cmd, data)));
}

/** One line of the plain-language summary at the top of a generated install.sh. */
function describeAction(a: InstallAction): string {
  switch (a.kind) {
    case 'note':
      return `You do: ${a.text}`;
    case 'package':
      return `${a.aur ? 'Install from the AUR' : "Install with your distro's package manager"}: ${a.packages.join(' ')}`;
    case 'clone':
      return `Download: git clone ${a.args}`;
    case 'copy':
      return `Copy into place: cp ${a.args}`;
    case 'append':
      return `Add the line ${a.line} to ${a.file}`;
    case 'upstream':
      return `Run the project's own installer: ${a.command}`;
    case 'system':
      return `Run with sudo: ${a.command}`;
    case 'reload':
      return `Reload the running session, if there is one: ${a.command}`;
    case 'exec':
      return `Run: ${a.command}`;
  }
}

/**
 * True when the install downloads source.repo at source.ref: a pinned install.script, or a clone
 * of source.repo (which validateCloneSteps forces to check out {{ref}}). Package installs get
 * whatever the distro ships, so their installer must not claim the pinned commit.
 */
export function usesPinnedSource(data: ConfigData): boolean {
  if (data.install?.script) return true;
  const repo = normalizeRepoUrl(data.source.repo);
  return (data.install?.steps ?? []).some((step) =>
    step.commands.some((cmd) =>
      classifyCommand(cmd, data).some((a) => a.kind === 'clone' && a.args.split(/\s+/).some((w) => /^(?:https?:\/\/|git@)/.test(w) && normalizeRepoUrl(w) === repo)),
    ),
  );
}

/** Shell lines for one config command, or null when nothing is left to run or show. */
export function translateCommand(cmd: string, data: Pick<ConfigData, 'source'>): string | null {
  const lines = classifyCommand(cmd, data).map(actionToShell);
  return lines.length ? lines.join('\n') : null;
}

/** Facts for the page's "what will change" panel, from the same classification as the script. */
export interface InstallImpact {
  packages: string[];
  aurPackages: string[];
  userPaths: string[];
  systemCommands: string[];
  upstreamCommands: string[];
  /** Other commands with lasting effects that --rollback does not undo (gsettings set, chmod…). */
  execCommands: string[];
  manualNotes: string[];
}

// Commands that only move around, check or read state: not worth listing as lasting changes.
const NO_LASTING_EFFECT_RE = /^(?:cd\b|mkdir\s+-p\b|git\s+-C\s+\S+\s+(?:checkout|fetch)\b|gsettings\s+get\b|niri\s+validate\b)/;

export function installImpact(data: ConfigData): InstallImpact {
  const impact: InstallImpact = { packages: [], aurPackages: [], userPaths: [], systemCommands: [], upstreamCommands: [], execCommands: [], manualNotes: [] };
  const userPath = (p: string | null) => {
    if (p && /^(~|\$HOME)\//.test(p) && !impact.userPaths.includes(p)) impact.userPaths.push(p);
  };
  for (const step of data.install?.steps ?? []) {
    for (const cmd of step.commands) {
      for (const a of classifyCommand(cmd, data)) {
        if (a.kind === 'package') (a.aur ? impact.aurPackages : impact.packages).push(...a.packages);
        else if (a.kind === 'clone') userPath(a.dest);
        else if (a.kind === 'copy') userPath(a.dest);
        else if (a.kind === 'append') userPath(a.file);
        else if (a.kind === 'system') impact.systemCommands.push(a.command);
        else if (a.kind === 'upstream') impact.upstreamCommands.push(a.command);
        else if (a.kind === 'note') impact.manualNotes.push(a.text);
        else if (a.kind === 'exec' && !NO_LASTING_EFFECT_RE.test(a.command)) impact.execCommands.push(a.command);
      }
    }
  }
  return impact;
}

export type InstallDifficulty = 'manual' | 'easy' | 'moderate' | 'advanced';

/**
 * How much of the system an install touches, from the same classification as the installer:
 * manual: the steps only fetch the source; the setup itself follows the upstream guide by hand;
 * easy: copies files into your home folder, all undone by --rollback;
 * moderate: also distro packages, or lasting commands --rollback does not undo (gsettings set…);
 * advanced: AUR packages, the project's own installer (or install.script), or other sudo changes.
 * null for entries without install steps (Lists & guides).
 */
export function installDifficulty(data: ConfigData): InstallDifficulty | null {
  const steps = data.install?.steps ?? [];
  if (!steps.length) return null;
  const impact = installImpact(data);
  if (data.install?.script || impact.aurPackages.length || impact.upstreamCommands.length || impact.systemCommands.length) {
    return 'advanced';
  }
  if (impact.packages.length || impact.execCommands.length) return 'moderate';
  const deploys = steps.some((step) =>
    step.commands.some((cmd) => classifyCommand(cmd, data).some((a) => a.kind === 'copy' || a.kind === 'append')),
  );
  return deploys ? 'easy' : 'manual';
}

/** How each difficulty is shown on config and topic pages. */
export const DIFFICULTY_INFO: Record<InstallDifficulty, { label: string; dot: string; text: string }> = {
  manual: { label: 'Manual setup', dot: 'bg-zinc-400', text: 'The steps fetch the pinned source; you set it up by hand from the upstream guide.' },
  easy: { label: 'Easy', dot: 'bg-emerald-600', text: 'Copies files into your home folder, nothing else.' },
  moderate: { label: 'Moderate', dot: 'bg-amber-500', text: 'Installs packages from your distro or changes desktop settings, as well as files.' },
  advanced: { label: 'Advanced', dot: 'bg-rose-600', text: "Uses the AUR, sudo or the project's own installer. Read the steps before running them." },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The "What it changes" sentences for an install that does something (easy and up). */
function impactChanges(impact: InstallImpact, packages: string[]): string[] {
  const changes: string[] = [];
  if (packages.length) {
    const more = packages.length > 4 ? ` +${packages.length - 4} more` : '';
    const aur = impact.aurPackages.length ? ' (AUR included)' : '';
    changes.push(`${plural(packages.length, 'package')}: ${packages.slice(0, 4).join(', ')}${more}${aur}`);
  }
  if (impact.userPaths.length) {
    const more = impact.userPaths.length > 3 ? '…' : '';
    changes.push(`Writes to ${impact.userPaths.slice(0, 3).join(', ')}${more}`);
  }
  if (impact.systemCommands.length) changes.push(`Uses sudo outside package installs (${plural(impact.systemCommands.length, 'step')})`);
  if (impact.upstreamCommands.length) changes.push("Runs the project's own installer");
  if (impact.execCommands.length) changes.push(`Changes settings (${plural(impact.execCommands.length, 'command')})`);
  return changes;
}

/** The comparison-table form: "12 packages · 3 folders in ~ · sudo". */
function impactShort(impact: InstallImpact, packages: string[]): string {
  const parts = [
    packages.length && plural(packages.length, 'package'),
    impact.userPaths.length && `${plural(impact.userPaths.length, 'folder')} in ~`,
    impact.systemCommands.length && 'sudo',
    impact.upstreamCommands.length && 'own installer',
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

/** How to undo an install that does something (easy and up). */
function impactUndo(impact: InstallImpact, packages: string[]): string {
  if (impact.upstreamCommands.length) {
    return "Home files are backed up first and restored with --rollback; the project's own installer is not undone.";
  }
  if (packages.length || impact.systemCommands.length || impact.execCommands.length) {
    return 'File changes: bash install.sh --rollback. Packages and settings stay.';
  }
  return 'bash install.sh --rollback restores every file it changed.';
}

/**
 * What an install changes and how to undo it, as sentences (config pages, and entry summaries in
 * guides). `short` is the comparison-table form: "12 packages · 3 folders in ~ · sudo".
 */
export function describeImpact(difficulty: InstallDifficulty | null, impact: InstallImpact): { changes: string[]; short: string; undo: string | null } {
  const packages = [...impact.packages, ...impact.aurPackages];
  if (difficulty === null) return { changes: ['Nothing: it is a reading list.'], short: impactShort(impact, packages), undo: null };
  if (difficulty === 'manual') {
    return {
      changes: ['Nothing is installed for you; the clone stays in its own folder.'],
      short: 'Nothing for you: follow the upstream guide',
      undo: 'Delete the cloned folder. Anything you set up afterwards follows the upstream guide.',
    };
  }
  return { changes: impactChanges(impact, packages), short: impactShort(impact, packages), undo: impactUndo(impact, packages) };
}

/** Public URL of the generated installer for a config id (`author/slug`). */
export function installScriptPath(id: string): string {
  return `/configs/${id}/install.sh`;
}

/** Absolute URL of the generated installer served by the site. */
export function installScriptUrl(id: string): string {
  return new URL(withBase(installScriptPath(id)), SITE_URL).href;
}

/**
 * Download-only command shown on the site. Users read the file before running it:
 * never pipe it into a shell, which hides the code and can run a truncated download.
 */
export function downloadInstallCommand(id: string): string {
  return `curl -fsSLo install.sh ${shQuote(installScriptUrl(id))}`;
}

/** Workflow that signs the installers (.github/workflows/attest-installers.yml). */
export const ATTEST_WORKFLOW = '.github/workflows/attest-installers.yml';

/**
 * Verifies the downloaded file against the build attestation GitHub signed for this repository,
 * accepting only signatures made by the installer workflow (not any other workflow in the repo).
 */
export function attestationVerifyCommand(): string {
  return `gh attestation verify install.sh --repo ${REPO_OWNER}/${REPO_NAME} --signer-workflow ${REPO_OWNER}/${REPO_NAME}/${ATTEST_WORKFLOW}`;
}

/**
 * Build the installer for a configuration entry: reviewed config data, the fixed
 * runtime (src/lib/installer-runtime.sh), and the steps. The output depends only on
 * the config, never on the build environment, so CI and Vercel produce identical bytes
 * and the GitHub attestation of CI's copy verifies the file served by the site.
 */
export function buildInstallScript(data: ConfigData, id = 'setup'): string {
  const wmLabel = WM_LABELS[data.wm] || data.wm;
  const distroLabels = data.distros.map((d) => DISTRO_LABELS[d] || d).join(', ');
  const pinned = usesPinnedSource(data);
  const usesUpstream = allStepsActions(data).some((a) => a.kind === 'upstream');
  const slug = id.replaceAll('/', '-').replace(/[^\w.-]/g, '');
  const allSteps = data.install?.steps ?? [];
  const total = allSteps.length;
  // Comment lines: newlines removed, so nothing in a config value can end the comment.
  const c = (s: string) => stripNewlines(s);

  const steps = allSteps
    .map((step, i) => {
      const lines = step.commands
        .map((cmd) => translateCommand(cmd, data))
        .filter((line): line is string => line !== null);
      return [`  step ${i + 1} ${total} ${shQuote(stripNewlines(step.title))}`, ...lines.flatMap((l) => l.split('\n')).map((l) => `  ${l}`)].join('\n');
    })
    .join('\n');

  // What the script does, in plain words, before any code: the runtime below is the same in every installer.
  const summary = allSteps.flatMap((step, i) => [
    `#   ${i + 1}. ${c(step.title)}`,
    ...step.commands.flatMap((cmd) => classifyCommand(cmd, data)).map((a) => `#      - ${c(describeAction(a))}`),
  ]);

  const distroCheck = data.distros.includes('any')
    ? '  :'
    : [
        '  case " $OXT_DISTRO $OXT_DISTRO_LIKE " in',
        `    ${data.distros.map((d) => `*" ${d} "*`).join(' | ')}) ;;`,
        `    *) warn ${shQuote(`Tested on ${stripNewlines(distroLabels)}. Some packages may be named differently on your distro.`)} ;;`,
        '  esac',
      ].join('\n');

  const pinnedAt = data.version ? data.version + ' (' + data.source.ref + ')' : data.source.ref;
  const sourceLine = pinned
    ? `# Source: ${c(data.source.repo)} @ ${c(pinnedAt)}`
    : `# Source: ${c(data.source.repo)} (reference only: installed from your package manager, not a pinned download)`;

  return [
    '#!/usr/bin/env bash',
    '# ==============================================================================',
    `# 0xTsoa installer: ${c(data.name)} by ${c(data.author.name)} (@${c(data.author.github)})`,
    sourceLine,
    `# Window manager: ${c(wmLabel)}. Distros: ${c(distroLabels)}.`,
    '#',
    '# What this script does:',
    ...summary,
    '#',
    '# Read before running. Start with:  bash install.sh --dry-run   (changes nothing)',
    '# Options: --dry-run  --force  --yes  --rollback  --help',
    '# ==============================================================================',
    'set -euo pipefail',
    '',
    '# --- Config data (from the reviewed config) ---',
    `OXT_SLUG=${shQuote(slug)}`,
    `OXT_NAME=${shQuote(stripNewlines(data.name))}`,
    `OXT_REPO=${shQuote(stripNewlines(data.source.repo))}`,
    `OXT_REF=${shQuote(stripNewlines(data.source.ref))}`,
    `OXT_PINNED=${pinned ? 1 : 0}`,
    // Folders backed up before the project's own installer runs; empty when the setup has none.
    `OXT_COMMON=(${usesUpstream ? UPSTREAM_BACKUP_PATHS.join(' ') : ''})`,
    '',
    '# --- Steps (from the reviewed config) ---',
    'oxt_distro_check() {',
    distroCheck,
    '}',
    '',
    'oxt_steps() {',
    steps,
    '}',
    '',
    RUNTIME.trimEnd(),
    '',
    'oxt_main "$@"',
    '',
  ].join('\n');
}
