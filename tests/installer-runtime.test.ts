// Runs generated installers in a throwaway HOME to prove the promises the site makes:
// dry-run changes nothing, conflicts are kept unless approved, backups are verified,
// rollback restores, and failures stop early. No network; `sudo` is a logging stub.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildInstallScript } from '../src/lib/install';
import { configSchema, hasInstallSteps, type ConfigData } from '../src/lib/schema';

const REF = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

function config(extraCommands: string[] = []): ConfigData {
  return {
    name: 'Demo Setup',
    author: { name: 'Alice', github: 'alice' },
    lang: 'en',
    summary: 'Demo.',
    license: 'MIT',
    updatedAt: '2026-10-22',
    distros: ['any'],
    category: 'dotfiles',
    wm: 'hyprland',
    themeStyle: 'minimalist',
    displayServer: 'wayland',
    tags: [],
    specs: {},
    screenshots: [],
    source: { repo: 'https://github.com/alice/demo', ref: REF, readme: 'README.md' },
    install: {
      steps: [
        {
          id: 'deps',
          title: 'Prepare files',
          commands: [
            'sudo pacman -S --needed demo-pkg',
            'mkdir -p payload/demo payload/fresh',
            'printf "setup\\n" > payload/demo/app.conf',
            'printf "fresh\\n" > payload/fresh/f.conf',
          ],
        },
        {
          id: 'dotfiles',
          title: 'Deploy',
          commands: [
            'mkdir -p ~/.config',
            'cp -r payload/demo ~/.config/',
            'cp -r payload/fresh ~/.config/',
            'echo "source = extra.conf" >> ~/.config/main.conf',
            ...extraCommands,
          ],
        },
      ],
      packages: [],
    },
    keybindings: [],
    example: false,
  } as ConfigData;
}

let root: string;
let home: string;
let script: string;
let sudoLog: string;
let binDir: string;

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function run(args: string[], extraEnv: Record<string, string> = {}) {
  const res = spawnSync('bash', [script, ...args], {
    env: { HOME: home, PATH: `${binDir}:${process.env.PATH}`, LANG: 'C', ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

/** Every path under HOME with its content, to prove "nothing changed". */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const rel = path.relative(home, p);
      if (fs.lstatSync(p).isDirectory()) {
        out[rel] = 'dir';
        walk(p);
      } else {
        out[rel] = fs.readFileSync(p, 'utf8');
      }
    }
  };
  walk(home);
  return out;
}

/** The user's own files, ignoring the installer's state and download cache. */
function userFiles(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(snapshot()).filter(([k]) => !k.startsWith('.local') && !k.startsWith('.cache')),
  );
}

function generate(extra: string[] = []) {
  script = path.join(root, 'install.sh');
  fs.writeFileSync(script, buildInstallScript(config(extra), 'alice/demo'));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'oxt-runtime-'));
  home = path.join(root, 'home');
  binDir = path.join(root, 'bin');
  sudoLog = path.join(root, 'sudo.log');
  fs.mkdirSync(home);
  write(path.join(binDir, 'sudo'), `#!/bin/sh\necho "$@" >> '${sudoLog}'\n`);
  fs.chmodSync(path.join(binDir, 'sudo'), 0o755);
  // The user's existing setup: a customized demo config and a main config.
  write(path.join(home, '.config/demo/app.conf'), 'mine\n');
  write(path.join(home, '.config/main.conf'), 'original\n');
  generate();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('generated installer', () => {
  it('passes bash syntax check', () => {
    expect(spawnSync('bash', ['-n', script]).status).toBe(0);
  });

  it('--dry-run writes nothing, installs nothing and never calls sudo', () => {
    const before = snapshot();
    const { code, out } = run(['--dry-run']);
    expect(code).toBe(0);
    expect(out).toContain('Dry run: nothing was changed.');
    expect(out).toContain('[package]');
    expect(snapshot()).toEqual(before);
    expect(fs.existsSync(sudoLog)).toBe(false);
  });

  it('keeps a conflicting file by default (--yes does not imply --force)', () => {
    const { code, out } = run(['--yes']);
    expect(code).toBe(0);
    expect(out).toContain('Kept your');
    expect(fs.readFileSync(path.join(home, '.config/demo/app.conf'), 'utf8')).toBe('mine\n');
    // New, non-conflicting files are still installed.
    expect(fs.readFileSync(path.join(home, '.config/fresh/f.conf'), 'utf8')).toBe('fresh\n');
  });

  it('appends a config line only once across reruns', () => {
    run(['--yes']);
    run(['--yes']);
    const lines = fs.readFileSync(path.join(home, '.config/main.conf'), 'utf8').split('\n');
    expect(lines.filter((l) => l === 'source = extra.conf')).toHaveLength(1);
  });

  it('--force replaces only after a verified backup, and --rollback restores everything', () => {
    const before = userFiles();
    const forced = run(['--yes', '--force']);
    expect(forced.code, forced.out).toBe(0);
    expect(fs.readFileSync(path.join(home, '.config/demo/app.conf'), 'utf8')).toBe('setup\n');

    const backups = path.join(home, '.local/state/0xtsoa/backups/alice-demo');
    const [stamp] = fs.readdirSync(backups);
    const manifest = fs.readFileSync(path.join(backups, stamp, 'manifest.tsv'), 'utf8');
    expect(manifest).toContain(`existed\t${path.join(home, '.config/demo')}`);
    expect(manifest).toContain(`created\t${path.join(home, '.config/fresh')}`);
    expect(manifest).toContain(`existed\t${path.join(home, '.config/main.conf')}`);
    expect(fs.existsSync(path.join(backups, stamp, 'install.sh'))).toBe(true);

    const back = run(['--rollback', '--yes']);
    expect(back.code, back.out).toBe(0);
    expect(userFiles()).toEqual(before);
    // The rollback is itself recoverable: the installed versions were moved aside, not deleted.
    const undone = fs.readFileSync(path.join(backups, stamp, 'undone.tsv'), 'utf8');
    expect(undone).toContain(path.join(home, '.config/fresh'));
    expect(fs.readdirSync(path.join(backups, stamp, 'undone')).length).toBeGreaterThan(0);
  });

  it('refuses to run as root (checked before anything else)', () => {
    const src = fs.readFileSync(script, 'utf8');
    const main = src.slice(src.indexOf('oxt_main() {'));
    expect(main.indexOf('[ "$EUID" -ne 0 ] || die')).toBeGreaterThan(0);
    expect(main.indexOf('[ "$EUID" -ne 0 ] || die')).toBeLessThan(main.indexOf('oxt_steps'));
  });

  it('rollback refuses manifest paths outside HOME', () => {
    const outside = path.join(root, 'outside.txt');
    write(outside, 'keep me\n');
    const dir = path.join(home, '.local/state/0xtsoa/backups/alice-demo/20260101-000000');
    write(path.join(dir, 'manifest.tsv'), `created\t${outside}\t-\ncreated\t${home}/../outside.txt\t-\n`);
    const { out } = run(['--rollback', '--yes']);
    expect(out).toContain('outside your home folder');
    expect(fs.readFileSync(outside, 'utf8')).toBe('keep me\n');
  });

  it('stops with nothing changed when the backup folder cannot be created', () => {
    const locked = path.join(root, 'locked');
    fs.mkdirSync(locked, { mode: 0o500 });
    const before = snapshot();
    const { code, out } = run(['--yes'], { XDG_STATE_HOME: locked });
    expect(code).not.toBe(0);
    expect(out).toContain('Nothing was changed.');
    expect(snapshot()).toEqual(before);
    expect(fs.existsSync(sudoLog)).toBe(false);
  });

  it('a failing step stops the install and points to --rollback, which restores the files', () => {
    generate(['false']);
    const before = userFiles();
    const failed = run(['--yes', '--force']);
    expect(failed.code).not.toBe(0);
    expect(failed.out).toContain('--rollback');
    run(['--rollback', '--yes']);
    expect(userFiles()).toEqual(before);
  });

  it('backs up the usual desktop folders before an upstream installer runs, and rollback undoes it', () => {
    write(path.join(home, '.config/hypr/hyprland.conf'), 'my hyprland\n');
    generate(['printf "mkdir -p ~/.config/quickshell && echo upstream > ~/.config/hypr/hyprland.conf && echo qs > ~/.config/quickshell/shell.qml\\n" > setup.sh', './setup.sh']);
    // ./setup.sh is not executable here: run it through bash like most upstream READMEs do.
    fs.writeFileSync(script, fs.readFileSync(script, 'utf8').replace("oxt_upstream './setup.sh'", "oxt_upstream 'bash setup.sh'"));
    const before = userFiles();
    const { code, out } = run(['--yes', '--force']);
    expect(code, out).toBe(0);
    expect(fs.readFileSync(path.join(home, '.config/hypr/hyprland.conf'), 'utf8')).toBe('upstream\n');
    run(['--rollback', '--yes']);
    expect(userFiles()).toEqual(before);
  });

  it('exits with an error when a package fails to install, after doing the other steps', () => {
    write(path.join(binDir, 'sudo'), `#!/bin/sh\necho "$@" >> '${sudoLog}'\nexit 1\n`);
    const { code, out } = run(['--yes']);
    expect(code).toBe(1);
    expect(out).toContain('Could not install: demo-pkg');
    expect(out).toContain('some steps failed');
    expect(fs.readFileSync(path.join(home, '.config/fresh/f.conf'), 'utf8')).toBe('fresh\n');
  });

  it('skips packages that are already installed, and the rollback names the ones it added', () => {
    // A fake pacman: "demo-pkg" is installed, "extra-pkg" is not.
    write(path.join(binDir, 'pacman'), `#!/bin/sh\n[ "$1" = -Q ] && [ "$3" = demo-pkg ]\n`);
    fs.chmodSync(path.join(binDir, 'pacman'), 0o755);
    generate(['sudo pacman -S --needed demo-pkg extra-pkg']);
    const plan = run(['--dry-run']);
    expect(plan.out).toContain('[package]   extra-pkg (with pacman, uses sudo)');
    expect(plan.out).not.toMatch(/\[package\][^\n]*demo-pkg/);

    run(['--yes']);
    expect(fs.readFileSync(sudoLog, 'utf8').trim().split('\n')).toEqual(['pacman -S --needed extra-pkg']);
    const back = run(['--rollback', '--yes']);
    expect(back.out).toContain('packages added by this install: extra-pkg. Remove them with: sudo pacman -Rns extra-pkg');
  });

  it('treats a session reload as best effort when no session is running (install from a TTY)', () => {
    write(path.join(binDir, 'swaymsg'), '#!/bin/sh\necho "Unable to connect to the IPC socket" >&2\nexit 1\n');
    fs.chmodSync(path.join(binDir, 'swaymsg'), 0o755);
    generate(['swaymsg reload']);
    expect(fs.readFileSync(script, 'utf8')).toContain("oxt_reload 'swaymsg reload'");
    expect(run(['--dry-run']).out).toContain('[reload]    swaymsg reload  (only if that session is running now)');
    const { code, out } = run(['--yes']);
    expect(code, out).toBe(0);
    expect(out).toContain('No running session answered');
    expect(out).not.toContain('some steps failed');
  });

  it('reports a missing system file to copy and still does the remaining steps', () => {
    generate(['cp /nonexistent-oxt/sway/config ~/.config/sway-config', 'printf "after\\n" > after.txt', 'cp after.txt ~/.config/after.txt']);
    const { code, out } = run(['--yes']);
    expect(code).toBe(1);
    expect(out).toContain('Not copied: /nonexistent-oxt/sway/config does not exist');
    expect(out).toContain('some steps failed');
    expect(fs.readFileSync(path.join(home, '.config/after.txt'), 'utf8')).toBe('after\n');
  });

  it('does not claim a pinned version for a package-only setup', () => {
    const data = config();
    data.install!.steps = [{ id: 'deps', title: 'Install', commands: ['sudo pacman -S --needed demo-pkg'] }];
    fs.writeFileSync(script, buildInstallScript(data, 'alice/demo'));
    const src = fs.readFileSync(script, 'utf8');
    expect(src).toContain('OXT_PINNED=0');
    expect(src).toContain('OXT_COMMON=()');
    expect(src).toContain("#      - Install with your distro's package manager: demo-pkg");
    const { out } = run(['--dry-run']);
    expect(out).toContain('reference only');
    expect(out).not.toContain(REF);
    expect(out).toContain('Summary: 1 package(s) to install.');
    expect(out).not.toContain('restored by --rollback');
  });

  it('refuses to start when a clone destination belongs to something else, unless --force', () => {
    write(path.join(home, 'dots/notes.txt'), 'my own folder\n');
    generate(['git clone https://github.com/alice/demo ~/dots']);
    const before = snapshot();
    const { code, out } = run(['--yes']);
    expect(code).not.toBe(0);
    expect(out).toContain('[conflict]');
    expect(out).toContain('Nothing was changed.');
    expect(snapshot()).toEqual(before);
  });
});

describe('every real config', () => {
  const files = fs
    .readdirSync('configs', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join('configs', d.name)).filter((f) => f.endsWith('.json')).map((f) => `${d.name}/${f.replace(/\.json$/, '')}`));

  it('found the registry configs', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('--dry-run exits 0, writes nothing and never calls sudo, for all configs', () => {
    const failures: string[] = [];
    for (const id of files) {
      const data = configSchema.parse(JSON.parse(fs.readFileSync(`configs/${id}.json`, 'utf8')));
      if (!hasInstallSteps(data)) continue; // reading lists: no installer is generated
      fs.writeFileSync(script, buildInstallScript(data, id));
      const before = snapshot();
      const { code, out } = run(['--dry-run']);
      if (code !== 0) failures.push(`${id}: exit ${code}\n${out.slice(-400)}`);
      else if (JSON.stringify(snapshot()) !== JSON.stringify(before)) failures.push(`${id}: HOME changed`);
      else if (fs.existsSync(sudoLog)) failures.push(`${id}: sudo called`);
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
