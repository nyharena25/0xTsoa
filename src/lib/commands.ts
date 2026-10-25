/**
 * How the site reads one install command: a package install, a clone, a copy, a session reload,
 * the project's own installer… The installer generator (install.ts), the page facts and the
 * install-step lint (install-lint.ts) all use this one classification. No `?raw` imports here,
 * so plain Node scripts (the validator, the issue bot) can load it.
 */
import type { ConfigData } from './schema';
import { splitOnAnd, stripShellComment } from './strings';

/** Config text inside a generated comment or quoted line: newlines would end it. */
export function stripNewlines(s: string): string {
  return s.replace(/[\r\n]+/g, ' ');
}

/** Replace `{{ref}}` tokens in an install command with `data.source.ref`. */
export function renderCommand(cmd: string, data: Pick<ConfigData, 'source'>): string {
  return cmd.replaceAll('{{ref}}', data.source.ref);
}

// `<theme>`, `<hostname>`… are placeholders the user must fill in; bash would parse them as redirections.
const PLACEHOLDER_RE = /<[A-Za-z][\w-]*>/;
// Upstream installers decide for themselves what they touch (checked without a leading sudo).
// Plain arguments are allowed ("./setup install", "bash install.sh --all"); shell syntax is not.
const UPSTREAM_RES = [
  /^\.\/\S+(?:\s+[\w.=-]+)*$/,
  /^(?:ba)?sh\s+(?!-c\b)\S+(?:\s+[\w.=-]+)*$/,
  /^make(?:\s+\S.*)?$/,
  /^bash\s+-c\s+\S.*$/,
];

/** What one config command does, as seen by the installer and the page. */
export type InstallAction =
  | { kind: 'note'; text: string }
  | { kind: 'package'; packages: string[]; aur: boolean }
  | { kind: 'clone'; args: string; dest: string | null }
  | { kind: 'copy'; args: string; dest: string }
  | { kind: 'append'; line: string; file: string }
  | { kind: 'upstream'; command: string }
  | { kind: 'system'; command: string }
  /** Asks the running desktop session to reload; best effort, since installs often run from a TTY. */
  | { kind: 'reload'; command: string }
  | { kind: 'exec'; command: string };

/** Commands that talk to a running compositor or desktop session through its IPC socket or D-Bus. */
const SESSION_RELOAD_RES = [
  /^hyprctl\s+reload\b/,
  /^swaymsg\s+reload\b/,
  /^i3-msg\s+(?:reload|restart)\b/,
  /^bspc\s+wm\s+-r\b/,
  /^awesome-client\b/,
  /^qdbus\b.*\breconfigure\b/,
  /^niri\s+msg\b/,
  /^herbstclient\s+reload\b/,
  /^qtile\s+cmd-obj\b.*\breload/,
];

function packageNames(rest: string): string[] {
  return stripShellComment(rest)
    .split(/\s+/)
    .filter((w) => w && !w.startsWith('-'));
}

/** Last non-option word of an argument string (cp/clone destination). */
function lastOperand(args: string): string | null {
  const words = args.split(/\s+/).filter((w) => w && !w.startsWith('-'));
  return words.length > 1 ? words.at(-1)! : null;
}

/** Commands shown to the reader instead of run: notes, placeholders, links, reboots and logouts. */
function noteAction(cmd: string): InstallAction | null {
  if (cmd.startsWith('#')) return { kind: 'note', text: cmd.replace(/^#\s*/, '') };
  if (PLACEHOLDER_RE.test(cmd)) return { kind: 'note', text: `Run manually (fill in the <placeholder>): ${cmd}` };
  const open = /^xdg-open\s+(\S+)/.exec(cmd);
  if (open) return { kind: 'note', text: `Follow the upstream guide: ${open[1]}` };
  // Rebooting or logging out mid-install would cut the installer off: the reader does it at the end.
  if (/^(?:sudo\s+)?(?:systemctl\s+)?(?:reboot|poweroff|shutdown)\b/.test(cmd)) return { kind: 'note', text: 'Reboot to finish: systemctl reboot' };
  if (/^(?:loginctl\s+terminate-|hyprctl\s+dispatch\s+exit\b|swaymsg\s+exit\b|i3-msg\s+exit\b)/.test(cmd)) return { kind: 'note', text: `Log out and back in to finish (${cmd})` };
  return null;
}

function packageAction(cmd: string): InstallAction | null {
  const pacman = /^sudo\s+pacman\s+-S\w*\s+(\S.*)$/.exec(cmd);
  if (pacman) return { kind: 'package', packages: packageNames(pacman[1]), aur: false };
  const native = /^sudo\s+(?:apt|apt-get|dnf|zypper)\s+install\s+(\S.*)$/.exec(cmd);
  if (native) return { kind: 'package', packages: packageNames(native[1]), aur: false };
  const aur = /^(?:yay|paru)\s+-S\w*\s+(\S.*)$/.exec(cmd);
  if (aur) return { kind: 'package', packages: packageNames(aur[1]), aur: true };
  return null;
}

/** Commands whose files the installer backs up: clones, copies and appended lines. */
function fileAction(cmd: string): InstallAction | null {
  const clone = /^git\s+clone\s+(\S.*)$/.exec(cmd);
  if (clone) return { kind: 'clone', args: clone[1], dest: lastOperand(clone[1]) };
  const copy = /^cp\s+(\S.*)$/.exec(cmd);
  const copyDest = copy && lastOperand(copy[1]);
  if (copy && copyDest) return { kind: 'copy', args: copy[1], dest: copyDest };
  const append = /^echo\s+("[^"]*"|'[^']*')\s+>>\s+(\S+)$/.exec(cmd);
  if (append) return { kind: 'append', line: append[1], file: append[2] };
  return null;
}

/** Everything else is run as written: a session reload, an upstream installer, a sudo change or a command. */
function commandAction(cmd: string): InstallAction {
  if (SESSION_RELOAD_RES.some((re) => re.test(cmd))) return { kind: 'reload', command: cmd };
  const unsudo = cmd.replace(/^sudo\s+/, '');
  if (UPSTREAM_RES.some((re) => re.test(unsudo))) return { kind: 'upstream', command: cmd };
  if (cmd.startsWith('sudo ')) return { kind: 'system', command: cmd };
  return { kind: 'exec', command: cmd };
}

/** Classify one already-rendered, single command. */
function classify(cmd: string): InstallAction | null {
  if (!cmd || /^#\s*Other distros/i.test(cmd)) return null;
  return noteAction(cmd) ?? packageAction(cmd) ?? fileAction(cmd) ?? commandAction(cmd);
}

/**
 * Split a config command into single commands (`a && b` without quotes) and classify each.
 * Config commands are reviewed in the pull request; this only decides how the installer
 * wraps them (plan, backup, conflict check), never what they do.
 */
export function classifyCommand(cmd: string, data: Pick<ConfigData, 'source'>): InstallAction[] {
  const rendered = stripNewlines(renderCommand(cmd, data)).trim();
  const parts = /["']/.test(rendered) ? [rendered] : splitOnAnd(rendered, true);
  return parts.map((p) => classify(p.trim())).filter((a): a is InstallAction => a !== null);
}
