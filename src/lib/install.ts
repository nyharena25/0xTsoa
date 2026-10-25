import {
  DISTRO_LABELS,
  WM_LABELS,
  normalizeRepoUrl,
  validateCloneSteps,
  type CloneValidationResult,
  type ConfigData,
} from './schema';

import { SITE_URL, REPO_OWNER, REPO_NAME, withBase } from '../../site.config';
import RUNTIME from './installer-runtime.sh?raw';

export { normalizeRepoUrl, validateCloneSteps, type CloneValidationResult };

function stripNewlines(s: string): string {
  return s.replace(/[\r\n]+/g, ' ');
}

/** Replace `{{ref}}` tokens in an install command with `data.source.ref`. */
export function renderCommand(cmd: string, data: Pick<ConfigData, 'source'>): string {
  return cmd.replaceAll('{{ref}}', data.source.ref);
}

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

// `<theme>`, `<hostname>`… are placeholders the user must fill in; bash would parse them as redirections.
const PLACEHOLDER_RE = /<[A-Za-z][\w-]*>/;
// Upstream installers decide for themselves what they touch.
// Plain arguments are allowed ("./setup install", "bash install.sh --all"); shell syntax is not.
const UPSTREAM_RE = /^(?:sudo\s+)?(?:\.\/\S+(?:\s+[\w.=-]+)*|(?:ba)?sh\s+(?!-c\b)\S+(?:\s+[\w.=-]+)*|make(?:\s.*)?|bash\s+-c\s+.*)$/;

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

/** What one config command does, as seen by the installer and the page. */
export type InstallAction =
  | { kind: 'note'; text: string }
  | { kind: 'package'; packages: string[]; aur: boolean }
  | { kind: 'clone'; args: string; dest: string | null }
  | { kind: 'copy'; args: string; dest: string }
  | { kind: 'append'; line: string; file: string }
  | { kind: 'upstream'; command: string }
  | { kind: 'system'; command: string }
  | { kind: 'exec'; command: string };

function packageNames(rest: string): string[] {
  return rest
    .replace(/\s+#.*$/, '')
    .split(/\s+/)
    .filter((w) => w && !w.startsWith('-'));
}

/** Last non-option word of an argument string (cp/clone destination). */
function lastOperand(args: string): string | null {
  const words = args.split(/\s+/).filter((w) => w && !w.startsWith('-'));
  return words.length > 1 ? words[words.length - 1] : null;
}

/** Classify one already-rendered, single command. */
function classify(cmd: string): InstallAction | null {
  if (!cmd) return null;
  if (/^#\s*Other distros/i.test(cmd)) return null;
  if (cmd.startsWith('#')) return { kind: 'note', text: cmd.replace(/^#\s*/, '') };
  if (PLACEHOLDER_RE.test(cmd)) return { kind: 'note', text: `Run manually (fill in the <placeholder>): ${cmd}` };
  const open = /^xdg-open\s+(\S+)/.exec(cmd);
  if (open) return { kind: 'note', text: `Follow the upstream guide: ${open[1]}` };
  if (/^(sudo\s+)?reboot\b/.test(cmd)) return { kind: 'note', text: 'Reboot to finish: sudo reboot' };

  const pacman = /^sudo\s+pacman\s+-S\w*\s+(.*)$/.exec(cmd);
  if (pacman) return { kind: 'package', packages: packageNames(pacman[1]), aur: false };
  const native = /^sudo\s+(?:apt|apt-get|dnf|zypper)\s+install\s+(.*)$/.exec(cmd);
  if (native) return { kind: 'package', packages: packageNames(native[1]), aur: false };
  const aur = /^(?:yay|paru)\s+-S\w*\s+(.*)$/.exec(cmd);
  if (aur) return { kind: 'package', packages: packageNames(aur[1]), aur: true };

  const clone = /^git\s+clone\s+(.*)$/.exec(cmd);
  if (clone) return { kind: 'clone', args: clone[1], dest: lastOperand(clone[1]) };
  const copy = /^cp\s+(.*)$/.exec(cmd);
  if (copy && lastOperand(copy[1])) return { kind: 'copy', args: copy[1], dest: lastOperand(copy[1])! };
  const append = /^echo\s+("[^"]*"|'[^']*')\s+>>\s+(\S+)$/.exec(cmd);
  if (append) return { kind: 'append', line: append[1], file: append[2] };

  if (UPSTREAM_RE.test(cmd)) return { kind: 'upstream', command: cmd };
  if (cmd.startsWith('sudo ')) return { kind: 'system', command: cmd };
  return { kind: 'exec', command: cmd };
}

/**
 * Split a config command into single commands (`a && b` without quotes) and classify each.
 * Config commands are reviewed in the pull request; this only decides how the installer
 * wraps them (plan, backup, conflict check), never what they do.
 */
export function classifyCommand(cmd: string, data: Pick<ConfigData, 'source'>): InstallAction[] {
  const rendered = stripNewlines(renderCommand(cmd, data)).trim();
  const parts = /["']/.test(rendered) ? [rendered] : rendered.split(/\s+&&\s+/);
  return parts.map((p) => classify(p.trim())).filter((a): a is InstallAction => a !== null);
}

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
    case 'exec':
      return `oxt_exec ${shQuote(a.command)}`;
  }
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

// Commands that only move around, reload or read state: not worth listing as lasting changes.
const NO_LASTING_EFFECT_RE =
  /^(?:cd\b|mkdir\s+-p\b|git\s+-C\s+\S+\s+(?:checkout|fetch)\b|hyprctl\s+reload|swaymsg\s+reload|i3-msg\s+(?:reload|restart)|bspc\s+wm\s+-r|awesome-client\b|qdbus\b.*\breconfigure|gsettings\s+get\b|niri\s+msg\b)/;

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

/**
 * What an install changes and how to undo it, as sentences (config pages, and entry summaries in
 * guides). `short` is the comparison-table form: "12 packages · 3 folders in ~ · sudo".
 */
export function describeImpact(difficulty: InstallDifficulty | null, impact: InstallImpact): { changes: string[]; short: string; undo: string | null } {
  const packages = [...impact.packages, ...impact.aurPackages];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const changes: string[] = [];
  if (difficulty === null) changes.push('Nothing: it is a reading list.');
  else if (difficulty === 'manual') changes.push('Nothing is installed for you; the clone stays in its own folder.');
  else {
    if (packages.length) {
      const shown = packages.slice(0, 4).join(', ') + (packages.length > 4 ? ` +${packages.length - 4} more` : '');
      changes.push(`${plural(packages.length, 'package')}: ${shown}${impact.aurPackages.length ? ' (AUR included)' : ''}`);
    }
    if (impact.userPaths.length) changes.push(`Writes to ${impact.userPaths.slice(0, 3).join(', ')}${impact.userPaths.length > 3 ? '…' : ''}`);
    if (impact.systemCommands.length) changes.push(`Uses sudo outside package installs (${plural(impact.systemCommands.length, 'step')})`);
    if (impact.upstreamCommands.length) changes.push("Runs the project's own installer");
    if (impact.execCommands.length) changes.push(`Changes settings (${plural(impact.execCommands.length, 'command')})`);
  }

  const short =
    difficulty === 'manual'
      ? 'Nothing for you: follow the upstream guide'
      : [
          packages.length && plural(packages.length, 'package'),
          impact.userPaths.length && `${plural(impact.userPaths.length, 'folder')} in ~`,
          impact.systemCommands.length && 'sudo',
          impact.upstreamCommands.length && 'own installer',
        ]
          .filter(Boolean)
          .join(' · ') || '—';

  const undo =
    difficulty === null
      ? null
      : difficulty === 'manual'
        ? 'Delete the cloned folder. Anything you set up afterwards follows the upstream guide.'
        : impact.upstreamCommands.length
          ? "Home files are backed up first and restored with --rollback; the project's own installer is not undone."
          : packages.length || impact.systemCommands.length || impact.execCommands.length
            ? 'File changes: bash install.sh --rollback. Packages and settings stay.'
            : 'bash install.sh --rollback restores every file it changed.';

  return { changes, short, undo };
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
  const version = data.version || 'v1.0';
  const slug = id.replaceAll('/', '-').replace(/[^\w.-]/g, '');
  const allSteps = data.install?.steps ?? [];
  const total = allSteps.length;

  const steps = allSteps
    .map((step, i) => {
      const lines = step.commands
        .map((cmd) => translateCommand(cmd, data))
        .filter((line): line is string => line !== null);
      return [`  step ${i + 1} ${total} ${shQuote(stripNewlines(step.title))}`, ...lines.flatMap((l) => l.split('\n')).map((l) => `  ${l}`)].join('\n');
    })
    .join('\n');

  const distroCheck = data.distros.includes('any')
    ? '  :'
    : [
        '  case " $OXT_DISTRO $OXT_DISTRO_LIKE " in',
        `    ${data.distros.map((d) => `*" ${d} "*`).join(' | ')}) ;;`,
        `    *) warn ${shQuote(`Tested on ${stripNewlines(distroLabels)}. Some packages may be named differently on your distro.`)} ;;`,
        '  esac',
      ].join('\n');

  return [
    '#!/usr/bin/env bash',
    '# ==============================================================================',
    `# 0xTSOA INSTALLER // ${shQuote(stripNewlines(data.name.toUpperCase()))}`,
    `# Version: ${shQuote(stripNewlines(version))}`,
    `# Maintainer: ${shQuote(stripNewlines(data.author.name))} (@${shQuote(stripNewlines(data.author.github))})`,
    `# Source: ${shQuote(stripNewlines(data.source.repo))} @ ${shQuote(stripNewlines(data.source.ref))}`,
    `# Window Manager: ${stripNewlines(wmLabel)}`,
    `# Supported Distros: ${stripNewlines(distroLabels)}`,
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
    `OXT_COMMON=(${UPSTREAM_BACKUP_PATHS.join(' ')})`,
    '',
    RUNTIME.trimEnd(),
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
    'oxt_main "$@"',
    '',
  ].join('\n');
}
