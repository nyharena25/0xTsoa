import { describe, it, expect } from 'vitest';
import {
  renderCommand,
  shQuote,
  buildInstallScript,
  verifiedScriptCommand,
  validateCloneSteps,
  translateCommand,
  installImpact,
  installDifficulty,
  attestationVerifyCommand,
  ATTEST_WORKFLOW,
} from '../src/lib/install';
import fs from 'node:fs';
import RUNTIME from '../src/lib/installer-runtime.sh?raw';
import { configSchema, type ConfigData } from '../src/lib/schema';

const baseConfig: ConfigData = {
  name: 'Clean Hyprland Rice',
  author: { name: 'Alice', github: 'alice' },
  lang: 'en',
  summary: 'Minimalist Hyprland setup on Arch Linux.',
  license: 'MIT',
  version: 'v1.2.0',
  updatedAt: '2026-10-15',
  distros: ['arch'],
  category: 'dotfiles',
  wm: 'hyprland',
  themeStyle: 'minimalist',
  displayServer: 'wayland',
  tags: ['waybar'],
  specs: {},
  screenshots: [
    {
      url: 'https://raw.githubusercontent.com/alice/dots/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2/preview.png',
      alt: 'Desktop screenshot',
    },
  ],
  source: {
    repo: 'https://github.com/alice/dots',
    ref: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    readme: 'README.md',
  },
  install: {
    steps: [
      {
        id: 'deps',
        title: 'Clone repository',
        commands: [
          'git clone --filter=blob:none https://github.com/alice/dots ~/dots',
          'git -C ~/dots checkout {{ref}}',
        ],
      },
    ],
    packages: [],
  },
  keybindings: [],
  example: false,
};

describe('install helpers (src/lib/install.ts)', () => {
  it("escapes single quotes and command substitutions with shQuote on a'b$(x)", () => {
    expect(shQuote("a'b$(x)")).toBe("'a'\\''b$(x)'");
  });

  it('replaces {{ref}} with data.source.ref in renderCommand', () => {
    expect(renderCommand('git -C ~/dots checkout {{ref}}', baseConfig)).toBe(
      `git -C ~/dots checkout ${baseConfig.source.ref}`,
    );
  });

  it('builds verifiedScriptCommand with exact mktemp + sha256sum pipeline', () => {
    const cmd = verifiedScriptCommand({
      url: 'https://raw.githubusercontent.com/alice/dots/v1.0.0/install.sh',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      shell: 'bash',
    });
    expect(cmd).toBe(
      `f=$(mktemp) && curl -fsSL 'https://raw.githubusercontent.com/alice/dots/v1.0.0/install.sh' -o "$f" && echo 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  '"$f" | sha256sum -c - && bash "$f"`,
    );
  });

  it('buildInstallScript with a malicious name contains no unquoted $( and strips newlines from comments', () => {
    const malicious: ConfigData = {
      ...baseConfig,
      name: "Evil 'Rice' $(rm -rf /)\n$(whoami)",
      version: "v1.0\n$(id)",
      author: {
        name: "Mallory $(uname -a)\n$(id)",
        github: 'mallory',
      },
      install: {
        ...baseConfig.install!,
        steps: [
          {
            id: 'deps',
            title: "Step title\n$(touch /tmp/pwn)",
            commands: [
              'git clone --filter=blob:none https://github.com/alice/dots ~/dots',
              'git -C ~/dots checkout {{ref}}',
            ],
          },
        ],
      },
    };

    const script = buildInstallScript(malicious);

    // Strip all POSIX single-quoted segments ('...') and comment lines (the plain-language summary
    // quotes config text there; with newlines stripped a comment cannot run). No $( may remain.
    const code = script
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n');
    expect(code.replace(/'[^']*'/g, '')).not.toContain('$(');
    // The injected title stays inside one comment line.
    expect(script).toContain('#   1. Step title $(touch /tmp/pwn)');

    // Also verify {{ref}} was expanded in the step commands
    expect(script).toContain(`git -C ~/dots checkout ${baseConfig.source.ref}`);
    expect(script).not.toContain('{{ref}}');

    // Verify no injected line starts with $(whoami), $(id), or $(touch ...)
    for (const line of script.split('\n')) {
      expect(line.trim()).not.toMatch(/^\$\(/);
    }
  });
});

describe('git clone pinning validator rule', () => {
  it('accepts a valid clone of source.repo followed by checkout {{ref}}', () => {
    const res = validateCloneSteps(baseConfig);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    expect(configSchema.safeParse(baseConfig).success).toBe(true);
  });

  it('reports an error when git clone of source.repo is missing a later checkout {{ref}}', () => {
    const missingCheckout = {
      ...baseConfig,
      install: {
        ...baseConfig.install!,
        steps: [
          {
            id: 'deps' as const,
            title: 'Clone repository',
            commands: ['git clone --filter=blob:none https://github.com/Alice/dots.git/ ~/dots'],
          },
        ],
      },
    };

    const res = validateCloneSteps(missingCheckout);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toMatch(/checkout \{\{ref\}\}/);
    expect(configSchema.safeParse(missingCheckout).success).toBe(false);
  });

  it('reports an error when git clone uses --depth', () => {
    const withDepth = {
      ...baseConfig,
      install: {
        ...baseConfig.install!,
        steps: [
          {
            id: 'deps' as const,
            title: 'Clone repository',
            commands: [
              'git clone --depth 1 https://github.com/alice/dots ~/dots',
              'git -C ~/dots checkout {{ref}}',
            ],
          },
        ],
      },
    };

    const res = validateCloneSteps(withDepth);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toMatch(/--depth/);
    expect(configSchema.safeParse(withDepth).success).toBe(false);
  });

  it('produces a warning (not an error) when cloning another repository', () => {
    const otherRepo = {
      ...baseConfig,
      install: {
        ...baseConfig.install!,
        steps: [
          {
            id: 'deps' as const,
            title: 'Clone helper repository',
            commands: ['git clone https://github.com/other-owner/helper-tool.git ~/helper'],
          },
        ],
      },
    };

    const res = validateCloneSteps(otherRepo);
    expect(res.errors).toEqual([]);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toMatch(/other-owner\/helper-tool/);
    expect(configSchema.safeParse(otherRepo).success).toBe(true);
  });
});

describe('translateCommand (portable installer lines)', () => {
  const t = (cmd: string) => translateCommand(cmd, baseConfig);

  it('routes pacman/apt/dnf through pkg_install and yay through aur_install', () => {
    expect(t('sudo pacman -S --needed waybar kitty')).toBe("pkg_install 'waybar' 'kitty'");
    expect(t('sudo pacman -Syu --needed base-devel git')).toBe("pkg_install 'base-devel' 'git'");
    expect(t('sudo apt install i3 dmenu')).toBe("pkg_install 'i3' 'dmenu'");
    expect(t('yay -S walker  # AUR')).toBe("aur_install 'walker'");
  });

  it('turns comments, placeholders, xdg-open and reboot into notes instead of failing commands', () => {
    expect(t('# Other distros: see the upstream README')).toBeNull();
    expect(t('# Set it as your display manager')).toBe("note 'Set it as your display manager'");
    expect(t('sudo plymouth-set-default-theme -R <theme>')).toMatch(/^note '/);
    expect(t('xdg-open https://github.com/a/b#readme')).toBe("note 'Follow the upstream guide: https://github.com/a/b#readme'");
    expect(t('reboot')).toMatch(/^note '/);
  });

  it('wraps file-changing commands so they are planned, backed up and conflict-checked', () => {
    expect(t('git clone --filter=blob:none https://github.com/a/b ~/b')).toBe('oxt_clone --filter=blob:none https://github.com/a/b ~/b');
    expect(t('cp -r ~/.dotfiles/config/* ~/.config/')).toBe('oxt_copy -r ~/.dotfiles/config/* ~/.config/');
    expect(t('echo "source = x.conf" >> ~/.config/hypr/hyprland.conf')).toBe('oxt_append "source = x.conf" ~/.config/hypr/hyprland.conf');
    expect(t('./install.sh')).toBe("oxt_upstream './install.sh'");
    expect(t('sudo make install')).toBe("oxt_upstream 'sudo make install'");
    expect(t('sudo grub-mkconfig -o /boot/grub/grub.cfg')).toBe("oxt_system 'sudo grub-mkconfig -o /boot/grub/grub.cfg'");
    expect(t('git -C ~/dots checkout {{ref}}')).toBe(`oxt_exec 'git -C ~/dots checkout ${baseConfig.source.ref}'`);
  });

  it('splits unquoted && chains so each part gets its own wrapper', () => {
    expect(t('git clone https://github.com/a/grub && cd grub')).toBe("oxt_clone https://github.com/a/grub\noxt_exec 'cd grub'");
  });
});

describe('remote script pinning (schema)', () => {
  const withCmd = (cmd: string) =>
    validateCloneSteps({ source: baseConfig.source, install: { steps: [{ commands: [cmd] }] } }).errors;

  it('rejects unpinned curl | bash, bash -c "$(curl)" and bash <(curl)', () => {
    expect(withCmd('curl -fsSL https://example.com/install.sh | bash')).toHaveLength(1);
    expect(withCmd('bash -c "$(curl -sLo- https://git.io/vQgMr)"')).toHaveLength(1);
    expect(withCmd('bash <(curl -fsSL https://raw.githubusercontent.com/a/b/main/x.sh)')).toHaveLength(1);
  });

  it('accepts raw URLs pinned to a SHA, a tag or {{ref}}', () => {
    expect(withCmd(`bash -c "$(curl -fsSL https://raw.githubusercontent.com/a/b/${baseConfig.source.ref}/x.sh)"`)).toEqual([]);
    expect(withCmd('curl -fsSL https://raw.githubusercontent.com/a/b/v1.2.0/x.sh | sh')).toEqual([]);
    expect(withCmd('bash -c "$(curl -fsSL https://raw.githubusercontent.com/a/b/{{ref}}/x.sh)"')).toEqual([]);
  });
});

describe('upstream installers with arguments', () => {
  it('classifies ./script and bash script with plain arguments as the project installer', () => {
    expect(translateCommand('./setup install', baseConfig)).toBe("oxt_upstream './setup install'");
    expect(translateCommand('bash install.sh --all', baseConfig)).toBe("oxt_upstream 'bash install.sh --all'");
    expect(translateCommand('./setup.sh', baseConfig)).toBe("oxt_upstream './setup.sh'");
  });

  it('keeps shell syntax out of the upstream rule', () => {
    expect(translateCommand('./setup install > log.txt', baseConfig)).not.toContain('oxt_upstream');
  });
});

describe('installImpact (page facts)', () => {
  it('lists packages, home paths, sudo and upstream commands from the same classification', () => {
    const impact = installImpact({
      ...baseConfig,
      install: {
        ...baseConfig.install!,
        steps: [
          { id: 'deps', title: 'deps', commands: ['sudo pacman -S --needed waybar', 'yay -S walker  # AUR', 'git clone https://github.com/alice/dots ~/dots', 'git -C ~/dots checkout {{ref}}'] },
          { id: 'dotfiles', title: 'files', commands: ['cp -r ~/dots/hypr ~/.config/', 'sudo make install', './setup.sh'] },
        ],
      },
    });
    expect(impact.packages).toEqual(['waybar']);
    expect(impact.aurPackages).toEqual(['walker']);
    expect(impact.userPaths).toEqual(['~/dots', '~/.config/']);
    expect(impact.upstreamCommands).toEqual(['sudo make install', './setup.sh']);
  });
});

describe('installDifficulty', () => {
  const withSteps = (...commands: string[][]): ConfigData => ({
    ...baseConfig,
    install: {
      ...baseConfig.install!,
      steps: commands.map((c, i) => ({ id: (['deps', 'dotfiles', 'reload'] as const)[i], title: 'step', commands: c })),
    },
  });
  const clone = ['git clone https://github.com/alice/dots ~/dots', 'git -C ~/dots checkout {{ref}}'];

  it('is manual when the steps only fetch the source and point to the upstream guide', () => {
    expect(installDifficulty(baseConfig)).toBe('manual');
    expect(installDifficulty(withSteps([...clone, 'cd ~/dots'], ['xdg-open https://github.com/alice/dots#readme']))).toBe('manual');
  });

  it('is easy when it only copies files into the home folder', () => {
    expect(installDifficulty(withSteps(clone, ['cp -r ~/dots/hypr ~/.config/']))).toBe('easy');
    expect(installDifficulty(withSteps(clone, ['echo "source ~/dots/theme.conf" >> ~/.config/hypr/hyprland.conf']))).toBe('easy');
  });

  it('is moderate with distro packages or lasting commands rollback does not undo', () => {
    expect(installDifficulty(withSteps(['sudo pacman -S --needed waybar', ...clone], ['cp -r ~/dots/waybar ~/.config/']))).toBe('moderate');
    expect(installDifficulty(withSteps(clone, ["gsettings set org.gnome.desktop.interface gtk-theme 'Nordic'"]))).toBe('moderate');
  });

  it('is advanced with AUR packages, an upstream installer, other sudo changes or install.script', () => {
    expect(installDifficulty(withSteps(['yay -S walker', ...clone]))).toBe('advanced');
    expect(installDifficulty(withSteps(clone, ['cd ~/dots && ./setup.sh']))).toBe('advanced');
    expect(installDifficulty(withSteps(clone, ['sudo cp -r ~/dots/theme /usr/share/themes/']))).toBe('advanced');
    expect(
      installDifficulty({
        ...baseConfig,
        install: {
          ...baseConfig.install!,
          script: { url: 'https://raw.githubusercontent.com/alice/dots/v1.0.0/install.sh', sha256: 'a'.repeat(64), shell: 'bash' },
        },
      }),
    ).toBe('advanced');
  });

  it('is null for entries without install steps (Lists & guides)', () => {
    expect(installDifficulty({ ...baseConfig, category: 'resource', install: undefined })).toBeNull();
  });
});

describe('attestation verify command', () => {
  it('pins the signer to a workflow file that exists in this repository', () => {
    expect(fs.existsSync(ATTEST_WORKFLOW)).toBe(true);
    expect(attestationVerifyCommand()).toContain(`--signer-workflow`);
    expect(attestationVerifyCommand()).toContain(ATTEST_WORKFLOW);
  });
});

describe('installer runtime source', () => {
  it('keeps single quotes balanced on every line so the injection check above stays meaningful', () => {
    for (const line of RUNTIME.split('\n')) {
      expect((line.match(/'/g) || []).length % 2, line).toBe(0);
    }
  });

  it('does not depend on the build environment (CI and Vercel must produce the same bytes)', () => {
    const before = buildInstallScript(baseConfig, 'alice/dots');
    process.env.SITE_URL = 'https://example.invalid';
    process.env.BASE_PATH = '/x';
    expect(buildInstallScript(baseConfig, 'alice/dots')).toBe(before);
    delete process.env.SITE_URL;
    delete process.env.BASE_PATH;
  });
});
