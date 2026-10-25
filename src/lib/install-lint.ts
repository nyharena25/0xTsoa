/**
 * The install-step standard (docs/INSTALL-STANDARD.md), as code. Every registry entry is written
 * by someone else and turned into an installer people run on their own machine, so commands must
 * be pinned, must not run downloaded code unchecked, must not destroy or overwrite files the
 * installer cannot back up, and must not touch the bootloader or system security.
 *
 * Errors fail CI (scripts/validate-configs.ts) and the issue bot (scripts/issue-to-config.ts).
 * Warnings are shown on pull requests for the entries they change. `#` lines are notes for the
 * reader and are never checked: write anything risky or distro-specific as a note.
 */
import type { ConfigData } from './schema';
import { classifyCommand } from './commands';
import { splitOnAnd, stripTrailingSlashes } from './strings';

export type LintSeverity = 'error' | 'warning';

export interface LintIssue {
  rule: string;
  severity: LintSeverity;
  /** Step id and command, so the message points at the line to change. */
  step: string;
  command: string;
  message: string;
}

/** A pinned Git reference: {{ref}}, a full commit SHA or a version tag. */
const isPin = (ref: string) => ref === '{{ref}}' || /^[0-9a-f]{40}$/.test(ref) || /^v?\d+(?:\.\d+)+(?:[-+][\w.]+)?$/.test(ref);
/** Interpreters that run whatever is piped into them. */
const PIPE_TARGETS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'python', 'python3', 'perl', 'ruby', 'node']);
/** Bootloader and initramfs tools. */
const BOOT_RES = [
  /\bgrub2?-(?:mkconfig|install)\b|\bupdate-grub2?\b|\bgrubby\b/,
  /\b(?:mkinitcpio|dracut|update-initramfs)\b/,
  /\b(?:bootctl|efibootmgr|kernelstub)\b/,
  /plymouth-set-default-theme\b.*\s-R\b/,
];

/** True when a download is piped straight into an interpreter (`curl … | sudo bash`). */
function pipesDownloadIntoShell(cmd: string): boolean {
  const m = /\b(?:curl|wget)\b[^|;]*\|\s*(?:sudo\s+)?([\w.]+)/.exec(cmd);
  return m !== null && PIPE_TARGETS.has(m[1]);
}
const ARCH_FAMILY = new Set(['arch', 'endeavouros', 'manjaro']);
const INTERACTIVE = new Set(['nvim', 'vim', 'vi', 'nano', 'emacs', 'micro', 'less', 'more', 'man', 'htop', 'btop', 'top', 'nmtui', 'ranger', 'lf', 'yazi', 'mc']);

interface Rule {
  id: string;
  severity: LintSeverity;
  test: (cmd: string) => boolean;
  message: string;
}

/** Rules on single commands. Ids are stable: docs/INSTALL-STANDARD.md lists them. */
export const RULES: Rule[] = [
  {
    id: 'remote-exec',
    severity: 'error',
    test: (c) =>
      pipesDownloadIntoShell(c) ||
      /(?:\$\(|<\(|`)\s*(?:curl|wget)\b/.test(c),
    message:
      'Runs downloaded code without checking it. Use install.script (pinned URL and sha256), or clone the repository at {{ref}} and run the script from the clone.',
  },
  {
    id: 'unpinned-download',
    severity: 'error',
    test: (c) =>
      /\b(?:curl|wget)\b/.test(c) &&
      (c.match(/https?:\/\/\S+/g) ?? []).some((u) => !/\{\{ref\}\}|[0-9a-f]{40}|\/releases\/download\/|\/v?\d+\.\d[\w.-]*\//.test(u)),
    message: 'Downloads from a URL that can change. Pin it to {{ref}}, a commit SHA or a release tag.',
  },
  {
    id: 'destructive',
    severity: 'error',
    test: (c) =>
      /(?:^|[;&|]\s*|sudo\s+)rm\s+(?:-\w*[rRf]|--recursive|--force)/.test(c) ||
      /(?:^|[;&|]\s*|sudo\s+)(?:dd|mkfs(?:\.\w+)?|wipefs|shred|fdisk|parted|sgdisk)\b/.test(c) ||
      /\bchown\s+-R\b/.test(c) ||
      /\bchmod\s+(?:-R\s+)?0?777\b/.test(c),
    message: 'Deletes or rewrites data the installer cannot back up. Copy files instead: existing ones are backed up, and --force replaces them.',
  },
  {
    id: 'overwrite-redirect',
    severity: 'error',
    test: (c) => /(?<![0-9&>])>(?!>)\s*(?:~|"?\$HOME|\/(?!dev\/null\b))/.test(c) || /\btee\s+(?!-a\b)(?:~|"?\$HOME|\/)/.test(c),
    message: 'Overwrites a file without a backup. Ship the file in the repository and copy it with cp, or append a line with echo "…" >> file.',
  },
  {
    id: 'root-shell',
    severity: 'error',
    test: (c) => /\bsudo\s+(?:-[^\WsiE]*[siE]|su\b|(?:ba|z)?sh\b)/.test(c) || /^su\b/.test(c),
    message: 'Opens a root shell or keeps the user environment under sudo. Use sudo on the single command that needs it.',
  },
  {
    id: 'sudo-home',
    severity: 'error',
    test: (c) => /\bsudo\s+(?:cp|mv|ln|mkdir|install|tee|rsync|chmod|git)\b[^;&|]*(?:~|\$HOME)/.test(c),
    message: 'Writes into the home folder as root, so the files end up owned by root. Run it without sudo.',
  },
  {
    id: 'hardcoded-home',
    severity: 'error',
    test: (c) => /(?:^|[\s"'=:])\/(?:home\/[A-Za-z_][\w.-]*|root)\//.test(c),
    message: 'Uses a fixed home folder. Write ~/ instead.',
  },
  {
    id: 'interactive',
    severity: 'error',
    test: (c) => {
      const words = c.replace(/^sudo\s+/, '').split(/\s+/);
      return INTERACTIVE.has(words[0]) && !words.some((w) => w === '--headless' || w === '--batch');
    },
    message: 'Opens an interactive program in the middle of the install. Write it as a # note telling the reader what to do.',
  },
  {
    id: 'boot-config',
    severity: 'error',
    test: (c) => BOOT_RES.some((re) => re.test(c)),
    message:
      'Changes the bootloader or initramfs, which differs between distros and can leave a system unbootable. Write it as a # note with the command for each distro.',
  },
  {
    id: 'system-upgrade',
    severity: 'error',
    test: (c) =>
      /\b(?:pacman|yay|paru)\s+-S\w*y/.test(c) ||
      /^(?:yay|paru)\s*$/.test(c) ||
      /\bapt(?:-get)?\s+(?:full-|dist-)?upgrade\b/.test(c) ||
      /\bdnf\s+(?:upgrade|update|distro-sync)\b/.test(c) ||
      /\bzypper\s+(?:up|update|dup|dist-upgrade)\b/.test(c) ||
      /\bxbps-install\s+-\w*u/.test(c) ||
      /\bapk\s+upgrade\b/.test(c),
    message:
      'Upgrades or refreshes the whole system. Installers only install the packages they list (write pacman -S --needed …); on Arch, -Sy without -u is a partial upgrade that can break the system.',
  },
  {
    id: 'security-off',
    severity: 'error',
    test: (c) =>
      /\bsetenforce\s+0\b|\bufw\s+disable\b|\/etc\/sudoers|NOPASSWD|SigLevel\s*=\s*Never/.test(c) ||
      /\bsystemctl\s+(?:stop|disable|mask)\s+(?:--now\s+)?(?:firewalld|ufw|apparmor|auditd)\b/.test(c) ||
      /\bchmod\s+(?:[ugoa]*\+\w*s|[2-7][0-7]{3})\b/.test(c) ||
      /--nogpgcheck|--no-gpg-checks|--allow-unauthenticated|--skippgpcheck|--insecure\b/.test(c) ||
      /\bcurl\b.*\s-k\b/.test(c) ||
      /\bapt-key\s+add\b/.test(c),
    message: 'Turns off a security check (signatures, TLS, sudo, firewall, setuid). Remove it.',
  },
  {
    id: 'system-pip-npm',
    severity: 'error',
    test: (c) => /\bsudo\s+(?:-H\s+)?pip3?\s+install\b|--break-system-packages|\bsudo\s+npm\s+(?:i|install)\b/.test(c),
    message: "Installs Python or Node packages into the system's own environment. Use the distro package, pipx, or a user install.",
  },
  {
    id: 'display-manager',
    severity: 'error',
    test: (c) => /\bsystemctl\s+enable\s+(?:--now\s+|-f\s+)*(?:sddm|gdm|lightdm|lxdm|ly|greetd)\b/.test(c),
    message: 'Enables a display manager, which fails or conflicts while another one is enabled. Write it as a # note: the reader disables theirs first.',
  },
  {
    id: 'services',
    severity: 'warning',
    test: (c) => /\bsystemctl\s+(?:--user\s+)?(?:enable|disable|mask)\b/.test(c) || /\bchsh\b/.test(c),
    message: 'Changes services or the login shell, which --rollback does not undo. Say so in a # note next to it.',
  },
  {
    id: 'cargo-go-unpinned',
    severity: 'warning',
    test: (c) => (/\bcargo\s+install\b/.test(c) && !/--path\b|--locked\b|--version\b/.test(c)) || /\bgo\s+install\s+\S+@latest\b/.test(c),
    message: 'Builds whatever version is newest at install time. Add --locked and --version (cargo) or a version (go).',
  },
];

/** `git clone [options] URL [dest]` → the destination folder and an optional --branch pin. */
function parseClone(cmd: string): { dest: string; branch?: string } | null {
  const m = /\bgit\s+clone\s+(\S.*)$/.exec(cmd);
  if (!m) return null;
  const words = splitOnAnd(m[1])[0].split(/\s+/).filter(Boolean);
  let branch: string | undefined;
  const operands: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i] === '--branch' || words[i] === '-b') branch = words[++i];
    else if (words[i].startsWith('--branch=')) branch = words[i].slice(9);
    else if (!words[i].startsWith('-')) operands.push(words[i]);
  }
  if (!operands[0]) return null;
  const dest = operands[1] ?? stripTrailingSlashes(operands[0]).split('/').pop()!.replace(/\.git$/, '');
  return { dest: stripTrailingSlashes(dest), branch };
}

interface Line {
  step: string;
  command: string;
}

const issue = (rule: string, severity: LintSeverity, { step, command }: Line, message: string): LintIssue => ({ rule, severity, step, command, message });

/** A clone is pinned by a tag in --branch, or by a later `git -C <dest> checkout <pin>`. */
function clonePinned(clone: { dest: string; branch?: string }, later: Line[]): boolean {
  if (clone.branch && isPin(clone.branch)) return true;
  return later.some(({ command }) => {
    const m = /\bgit\s+-C\s+(\S+)\s+checkout\s+(\S+)/.exec(command);
    return m !== null && stripTrailingSlashes(m[1]) === clone.dest && isPin(m[2]);
  });
}

/** The single-command rules, and pinning for every clone (not only source.repo, see validateCloneSteps). */
function commandIssues(lines: Line[], data: ConfigData): LintIssue[] {
  const issues: LintIssue[] = [];
  lines.forEach((line, i) => {
    const { command } = line;
    if (!command || command.startsWith('#')) return;
    // A command with a <placeholder> becomes a note in the installer, so only the reader runs it.
    if (classifyCommand(command, data).every((a) => a.kind === 'note')) return;
    for (const rule of RULES) if (rule.test(command)) issues.push(issue(rule.id, rule.severity, line, rule.message));
    const clone = parseClone(command);
    if (clone && !clonePinned(clone, lines.slice(i))) {
      issues.push(issue('unpinned-clone', 'error', line, `Clones a moving branch. Follow it with git -C ${clone.dest} checkout <commit SHA, tag or {{ref}}>.`));
    }
  });
  return issues;
}

/** Warnings about what the classified actions do: AUR packages, system changes, upstream installers. */
function actionIssues(lines: Line[], data: ConfigData): LintIssue[] {
  const issues: LintIssue[] = [];
  const actions = lines.flatMap((line) => classifyCommand(line.command, data).map((a) => ({ line, a })));
  const aur = actions.filter(({ a }) => a.kind === 'package' && a.aur);
  if (aur.length && data.distros.some((d) => !ARCH_FAMILY.has(d))) {
    issues.push(
      issue(
        'aur-other-distros',
        'warning',
        aur[0].line,
        'AUR packages only install on Arch-based distros. On the other distros listed, the installer stops before changing anything and the page points to the upstream instructions.',
      ),
    );
  }
  for (const { line, a } of aur) {
    if (a.kind === 'package' && a.packages.some((p) => p.endsWith('-git'))) {
      issues.push(issue('aur-git', 'warning', line, 'A -git package builds the latest development commit at install time, not source.ref. Prefer the release package when there is one.'));
    }
  }
  for (const { line, a } of actions) {
    if (a.kind === 'system') {
      issues.push(issue('system-change', 'warning', line, 'Changes files outside the home folder, which --rollback does not undo. Prefer a user folder (~/.local/share/themes, ~/.icons, ~/.local/share/fonts) when the project supports one.'));
    }
    if (a.kind === 'upstream') {
      issues.push(issue('upstream-installer', 'warning', line, "Runs the project's own installer, which decides what it changes. Say in the description what it touches (shell, display manager, bootloader, other configs)."));
    }
  }
  return issues;
}

/** Every install-step problem in one entry, errors first. */
export function lintInstallSteps(data: ConfigData): LintIssue[] {
  const lines = (data.install?.steps ?? []).flatMap((step) => step.commands.map((command) => ({ step: step.id, command: command.trim() })));
  const order = { error: 0, warning: 1 };
  return [...commandIssues(lines, data), ...actionIssues(lines, data)].toSorted((x, y) => order[x.severity] - order[y.severity]);
}

/** One readable line per issue, for CI logs and the issue bot. */
export function formatLintIssue(issue: LintIssue): string {
  const cmd = issue.command.length > 120 ? `${issue.command.slice(0, 117)}…` : issue.command;
  return `[${issue.rule}] ${issue.step}: \`${cmd}\` — ${issue.message}`;
}
