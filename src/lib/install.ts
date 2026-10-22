import {
  DISTRO_LABELS,
  WM_LABELS,
  normalizeRepoUrl,
  validateCloneSteps,
  type CloneValidationResult,
  type ConfigData,
} from './schema';

import { createHash } from 'node:crypto';
import { SITE_URL, withBase } from '../../site.config';

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

/**
 * Turn one config command into a portable shell line:
 * pacman/apt/dnf installs go through `pkg_install` (native package manager),
 * AUR installs through `aur_install`, and anything that cannot run unattended
 * (comments, placeholders, xdg-open, reboot) becomes a printed note.
 * Returns null for lines that only exist for humans and are covered by the helpers.
 */
export function translateCommand(cmd: string, data: Pick<ConfigData, 'source'>): string | null {
  const rendered = stripNewlines(renderCommand(cmd, data)).trim();
  if (!rendered) return null;
  if (/^#\s*Other distros/i.test(rendered)) return null;
  if (rendered.startsWith('#')) return `note ${shQuote(rendered.replace(/^#\s*/, ''))}`;
  if (PLACEHOLDER_RE.test(rendered)) return `note ${shQuote(`Run manually (fill in the <placeholder>): ${rendered}`)}`;

  const open = /^xdg-open\s+(\S+)/.exec(rendered);
  if (open) return `note ${shQuote(`Follow the upstream guide: ${open[1]}`)}`;
  if (/^(sudo\s+)?reboot\b/.test(rendered)) return `note ${shQuote('Reboot to finish: sudo reboot')}`;

  // Appending a config line twice breaks reruns; only append when the exact line is missing.
  const append = /^echo\s+("[^"]*"|'[^']*')\s+>>\s+(\S+)$/.exec(rendered);
  if (append) return `grep -qxF ${append[1]} ${append[2]} 2>/dev/null || ${rendered}`;

  const pkgs = (rest: string) =>
    rest
      .replace(/\s+#.*$/, '')
      .split(/\s+/)
      .filter((w) => w && !w.startsWith('-'));
  const pacman = /^sudo\s+pacman\s+-S\w*\s+(.*)$/.exec(rendered);
  if (pacman) return `pkg_install ${pkgs(pacman[1]).map(shQuote).join(' ')}`;
  const native = /^sudo\s+(?:apt|apt-get|dnf|zypper)\s+install\s+(.*)$/.exec(rendered);
  if (native) return `pkg_install ${pkgs(native[1]).map(shQuote).join(' ')}`;
  const aur = /^(?:yay|paru)\s+-S\w*\s+(.*)$/.exec(rendered);
  if (aur) return `aur_install ${pkgs(aur[1]).map(shQuote).join(' ')}`;

  return rendered;
}

/** Flat list of the runnable lines (notes excluded), for showing a manual command. */
export function runnableCommands(data: ConfigData): string[] {
  return data.install.steps
    .flatMap((step) => step.commands.map((cmd) => translateCommand(cmd, data)))
    .filter((line): line is string => !!line && !line.startsWith('note '));
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
 * Commands shown on the site: a short one-liner, and the same script pinned to its
 * build-time SHA-256 so a tampered download refuses to run.
 */
export function webInstallCommands(id: string, data: ConfigData): { quick: string; verified: string } {
  const url = installScriptUrl(id);
  const sha256 = createHash('sha256').update(buildInstallScript(data, id)).digest('hex');
  return { quick: oneLineInstall(url), verified: verifiedScriptCommand({ url, sha256 }) };
}

/** One-liner that runs the generated installer; process substitution keeps stdin on the terminal for prompts. */
export function oneLineInstall(scriptUrl: string): string {
  return `bash <(curl -fsSL ${shQuote(scriptUrl)})`;
}

// Shared helpers prepended to every generated script. Kept free of command
// substitution so config-controlled values (always single-quoted) are the only dynamic input.
const PREAMBLE = `note() { printf '  -> %s\\n' "$*"; }
warn() { printf '  !! %s\\n' "$*" >&2; OXT_WARNED=1; }
OXT_WARNED=0

# --- Detect distro and package manager ---------------------------------------
OXT_DISTRO=unknown
OXT_DISTRO_LIKE=
oxt_os() { local ID='' ID_LIKE=''; . /etc/os-release; OXT_DISTRO="\${ID:-unknown}"; OXT_DISTRO_LIKE="\${ID_LIKE:-}"; }
if [ -r /etc/os-release ]; then oxt_os; fi
OXT_PM=none
for pm in pacman apt-get dnf zypper xbps-install apk emerge nix-env; do
  if command -v "$pm" >/dev/null 2>&1; then OXT_PM="$pm"; break; fi
done

pkg_install() {
  local ok=1
  case "$OXT_PM" in
    pacman) sudo pacman -S --needed "$@" || ok=0 ;;
    apt-get) sudo apt-get install -y "$@" || ok=0 ;;
    dnf) sudo dnf install -y "$@" || ok=0 ;;
    zypper) sudo zypper install -y "$@" || ok=0 ;;
    xbps-install) sudo xbps-install -y "$@" || ok=0 ;;
    apk) sudo apk add "$@" || ok=0 ;;
    emerge) sudo emerge --noreplace "$@" || ok=0 ;;
    nix-env) warn "NixOS: add to environment.systemPackages, then nixos-rebuild switch: $*"; return 0 ;;
    *) ok=0 ;;
  esac
  if [ "$ok" = 0 ]; then warn "Could not install: $* (names can differ on $OXT_DISTRO). See $OXT_REPO"; fi
  return 0
}

aur_install() {
  local helper
  for helper in yay paru; do
    if command -v "$helper" >/dev/null 2>&1; then "$helper" -S --needed "$@" || warn "AUR install failed: $*"; return 0; fi
  done
  if [ "$OXT_PM" = pacman ]; then
    warn "$* is in the AUR: install yay or paru, then rerun this script."
  else
    warn "$* is an Arch (AUR) package with no $OXT_DISTRO equivalent here. Install it from $OXT_REPO"
  fi
  return 0
}

# Re-runnable clones: an existing checkout is fetched instead of failing.
git() {
  if [ "\${1:-}" = clone ]; then
    local a dest='' url=''
    for a in "\${@:2}"; do
      case "$a" in -*) ;; *) if [ -z "$url" ]; then url="$a"; else dest="$a"; fi ;; esac
    done
    if [ -z "$dest" ]; then dest="\${url##*/}"; dest="\${dest%.git}"; fi
    if [ -d "$dest/.git" ]; then
      note "$dest already cloned, fetching updates"
      command git -C "$dest" fetch --quiet origin
      return 0
    fi
  fi
  command git "$@"
}
`;

/** Build the downloadable `.sh` installer script for a configuration entry. */
export function buildInstallScript(data: ConfigData, id = 'setup'): string {
  const wmLabel = WM_LABELS[data.wm] || data.wm;
  const distroLabels = data.distros.map((d) => DISTRO_LABELS[d] || d).join(', ');
  const version = data.version || 'v1.0';
  const workDir = id.replaceAll('/', '-').replace(/[^\w.-]/g, '');

  const stepsBlock = data.install.steps
    .map((step, i) => {
      const header = `# --- Step: ${shQuote(stripNewlines(step.title))} ---`;
      const title = `printf '\\n[%s/%s] %s\\n' ${i + 1} ${data.install.steps.length} ${shQuote(stripNewlines(step.title))}`;
      const cmds = step.commands
        .map((cmd) => translateCommand(cmd, data))
        .filter((line): line is string => line !== null)
        .join('\n');
      return `${header}\n${title}\n${cmds}`;
    })
    .join('\n\n');

  const distroCheck = data.distros.includes('any')
    ? ''
    : [
        `case " ${data.distros.join(' ')} " in`,
        '  *" $OXT_DISTRO "*) ;;',
        '  *) case " $OXT_DISTRO_LIKE " in',
        ...data.distros.map((d) => `       *" ${d} "*) ;;`),
        `       *) warn "Tested on ${stripNewlines(distroLabels).replace(/["$`\\]/g, '')}, you are on $OXT_DISTRO: some packages may be named differently." ;;`,
        '     esac ;;',
        'esac',
      ].join('\n');

  return [
    '#!/usr/bin/env bash',
    '# ==============================================================================',
    `# 0xTSOA AUTOMATED INSTALLER // ${shQuote(stripNewlines(data.name.toUpperCase()))}`,
    `# Version: ${shQuote(stripNewlines(version))}`,
    `# Maintainer: ${shQuote(stripNewlines(data.author.name))} (@${shQuote(stripNewlines(data.author.github))})`,
    `# Source: ${shQuote(stripNewlines(data.source.repo))}`,
    `# Window Manager: ${stripNewlines(wmLabel)}`,
    `# Supported Distros: ${stripNewlines(distroLabels)}`,
    '# Works on Arch, Debian/Ubuntu, Fedora, openSUSE, Void, Alpine, Gentoo (NixOS: prints what to add).',
    '# Non-interactive: OXTSOA_YES=1. Work dir: OXTSOA_DIR (default ~/.cache/0xtsoa).',
    '# ==============================================================================',
    'set -euo pipefail',
    '',
    `OXT_REPO=${shQuote(stripNewlines(data.source.repo))}`,
    PREAMBLE,
    distroCheck,
    '',
    "printf '%s\\n' '======================================================================'",
    `printf '%s\\n' ' [0xTSOA] Installing '${shQuote(stripNewlines(data.name))}`,
    `printf '%s\\n' ' Maintainer: '${shQuote(stripNewlines(data.author.name))}' (@'${shQuote(stripNewlines(data.author.github))}') | Version: '${shQuote(stripNewlines(version))}`,
    `printf '%s\\n' ' Source: '${shQuote(stripNewlines(data.source.repo))}' @ '${shQuote(stripNewlines(data.source.ref))}`,
    `printf ' Detected: %s (package manager: %s)\\n' "$OXT_DISTRO" "$OXT_PM"`,
    "printf '%s\\n' '======================================================================'",
    '',
    '# Ask before touching the system; read from the terminal so `curl | bash` still works.',
    'if [ "${OXTSOA_YES:-0}" != 1 ]; then',
    "  printf 'Proceed? [y/N] '",
    "  ans=''",
    '  { read -r ans </dev/tty; } 2>/dev/null || true',
    '  case "$ans" in y|Y|yes|YES) ;; *) echo "Aborted."; exit 1 ;; esac',
    'fi',
    '',
    `OXT_WORKDIR="\${OXTSOA_DIR:-$HOME/.cache/0xtsoa}/${workDir}"`,
    'mkdir -p "$OXT_WORKDIR"',
    'cd "$OXT_WORKDIR"',
    '',
    stepsBlock,
    '',
    "printf '%s\\n' '======================================================================'",
    'if [ "$OXT_WARNED" = 1 ]; then',
    "  printf '%s\\n' ' [0xTSOA] Done with warnings (see !! lines above).'",
    'else',
    "  printf '%s\\n' ' [0xTSOA] Installation completed successfully!'",
    'fi',
    "printf '%s\\n' '======================================================================'",
    '',
  ].join('\n');
}
