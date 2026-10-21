import { describe, it, expect } from 'vitest';
import {
  renderCommand,
  shQuote,
  buildInstallScript,
  verifiedScriptCommand,
  validateCloneSteps,
} from '../src/lib/install';
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
        ...baseConfig.install,
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

    // Strip all POSIX single-quoted segments ('...') from the script; no $( should remain anywhere.
    const withoutSingleQuoted = script.replace(/'[^']*'/g, '');
    expect(withoutSingleQuoted).not.toContain('$(');

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
        ...baseConfig.install,
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
        ...baseConfig.install,
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
        ...baseConfig.install,
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
