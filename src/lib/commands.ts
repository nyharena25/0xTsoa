/**
 * How the site reads one install command: a package install, a clone, a copy, a session reload,
 * the project's own installer… The installer generator (install.ts), the page facts and the
 * install-step lint (install-lint.ts) all use this one classification. No `?raw` imports here,
 * so plain Node scripts (the validator, the issue bot) can load it.
 */
import type { ConfigData } from './schema';

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
// Upstream installers decide for themselves what they touch.
// Plain arguments are allowed ("./setup install", "bash install.sh --all"); shell syntax is not.
const UPSTREAM_RE = /^(?:sudo\s+)?(?:\.\/\S+(?:\s+[\w.=-]+)*|(?:ba)?sh\s+(?!-c\b)\S+(?:\s+[\w.=-]+)*|make(?:\s.*)?|bash\s+-c\s+.*)$/;

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
const SESSION_RELOAD_RE =
  /^(?:hyprctl\s+reload\b|swaymsg\s+reload\b|i3-msg\s+(?:reload|restart)\b|bspc\s+wm\s+-r\b|awesome-client\b|qdbus\b.*\breconfigure\b|niri\s+msg\b|herbstclient\s+reload\b|qtile\s+cmd-obj\b.*\breload)/;

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
  // Rebooting or logging out mid-install would cut the installer off: the reader does it at the end.
  if (/^(?:sudo\s+)?(?:systemctl\s+)?(?:reboot|poweroff|shutdown)\b/.test(cmd)) return { kind: 'note', text: 'Reboot to finish: systemctl reboot' };
  if (/^(?:loginctl\s+terminate-|hyprctl\s+dispatch\s+exit\b|swaymsg\s+exit\b|i3-msg\s+exit\b)/.test(cmd)) return { kind: 'note', text: `Log out and back in to finish (${cmd})` };

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

  if (SESSION_RELOAD_RE.test(cmd)) return { kind: 'reload', command: cmd };
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
