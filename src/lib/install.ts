import {
  DISTRO_LABELS,
  WM_LABELS,
  normalizeRepoUrl,
  validateCloneSteps,
  type CloneValidationResult,
  type ConfigData,
} from './schema';

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

/** Build the downloadable `.sh` installer script for a configuration entry. */
export function buildInstallScript(data: ConfigData): string {
  const wmLabel = WM_LABELS[data.wm] || data.wm;
  const distroLabels = data.distros.map((d) => DISTRO_LABELS[d] || d).join(', ');
  const version = data.version || 'v1.0';

  const stepsBlock = data.install.steps
    .map((step) => {
      const header = `# --- Step: ${shQuote(stripNewlines(step.title))} ---`;
      const cmds = step.commands
        .map((cmd) => {
          const rendered = renderCommand(cmd, data);
          return rendered.trimStart().startsWith('#') ? stripNewlines(rendered) : rendered;
        })
        .join('\n');
      return `${header}\n${cmds}`;
    })
    .join('\n\n');

  return [
    '#!/usr/bin/env bash',
    '# ==============================================================================',
    `# 0xTSOA AUTOMATED INSTALLER // ${shQuote(stripNewlines(data.name.toUpperCase()))}`,
    `# Version: ${shQuote(stripNewlines(version))}`,
    `# Maintainer: ${shQuote(stripNewlines(data.author.name))} (@${shQuote(stripNewlines(data.author.github))})`,
    `# Source: ${shQuote(stripNewlines(data.source.repo))}`,
    `# Window Manager: ${stripNewlines(wmLabel)}`,
    `# Supported Distros: ${stripNewlines(distroLabels)}`,
    '# ==============================================================================',
    'set -euo pipefail',
    '',
    "printf '%s\\n' '======================================================================'",
    `printf '%s\\n' ' [0xTSOA] Starting installation of '${shQuote(stripNewlines(data.name))}'...'`,
    `printf '%s\\n' ' Maintainer: '${shQuote(stripNewlines(data.author.name))}' (@'${shQuote(stripNewlines(data.author.github))}') | Version: '${shQuote(stripNewlines(version))}`,
    `printf '%s\\n' ' Source: '${shQuote(stripNewlines(data.source.repo))}' @ '${shQuote(stripNewlines(data.source.ref))}`,
    "printf '%s\\n' '======================================================================'",
    '',
    stepsBlock,
    '',
    "printf '%s\\n' '======================================================================'",
    "printf '%s\\n' ' [0xTSOA] Installation completed successfully!'",
    "printf '%s\\n' '======================================================================'",
    '',
  ].join('\n');
}
