import { describe, it, expect } from 'vitest';
import { configSchema, isPinnedRef, extractRawRef, idFromPath, SLUG_RE } from '../src/lib/schema';

describe('Config Schema & Validation Rules', () => {
  it('validates a correct configuration', () => {
    const valid = {
      name: 'Valid Minimal Setup',
      author: { name: 'alice', github: 'alice' },
      lang: 'fr',
      summary: 'A minimal setup for Arch Linux.',
      license: 'MIT',
      updatedAt: '2026-10-15',
      distros: ['arch'],
      wm: 'hyprland',
      displayServer: 'wayland',
      tags: ['minimal', 'arch'],
      screenshots: [
        {
          url: 'https://raw.githubusercontent.com/alice/dots/v1.0.0/preview.png',
          alt: 'Preview capture',
        },
      ],
      source: {
        repo: 'https://github.com/alice/dots',
        ref: 'v1.0.0',
        readme: 'README.md',
      },
      install: { steps: [{ id: 'deps', title: 'Install deps', commands: ['sudo pacman -S hyprland'] }] },
    };

    const res = configSchema.safeParse(valid);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.themeStyle).toBe('minimalist'); // default
    }
  });

  it('validates a configuration with local screenshot path and custom themeStyle', () => {
    const validLocal = {
      name: 'Cyberpunk Hyprland',
      author: { name: 'tsoa', github: 'tsoa' },
      lang: 'fr',
      summary: 'Cyberpunk neon setup for Hyprland with Waybar and Kitty.',
      license: 'MIT',
      updatedAt: '2026-10-15',
      distros: ['arch'],
      wm: 'hyprland',
      themeStyle: 'cyberpunk',
      displayServer: 'wayland',
      screenshots: [
        {
          url: '/0xtsoa/screenshots/cyberpunk-preview.png',
          alt: 'Preview capture',
        },
      ],
      source: {
        repo: 'https://github.com/tsoa/dots',
        ref: 'v1.0.0',
        readme: 'README.md',
      },
      install: { steps: [{ id: 'deps', title: 'Install deps', commands: ['sudo pacman -S hyprland'] }] },
    };

    const res = configSchema.safeParse(validLocal);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.themeStyle).toBe('cyberpunk');
      expect(res.data.screenshots[0].url).toBe('/0xtsoa/screenshots/cyberpunk-preview.png');
    }
  });

  it('requires at least one install step with unique ids', () => {
    const base = {
      name: 'No Install Setup',
      author: { name: 'carol', github: 'carol' },
      summary: 'A setup that forgets its install steps.',
      license: 'MIT',
      updatedAt: '2026-10-15',
      distros: ['arch'],
      wm: 'sway',
      displayServer: 'wayland',
      screenshots: [{ url: '/screenshots/fallback-terminal.svg', alt: 'Preview capture' }],
      source: { repo: 'https://github.com/carol/dots', ref: 'v1.0.0' },
    };
    const step = { id: 'deps', title: 'Install deps', commands: ['sudo pacman -S sway'] };
    expect(configSchema.safeParse(base).success).toBe(false);
    expect(configSchema.safeParse({ ...base, install: { steps: [] } }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, install: { steps: [step, step] } }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, install: { steps: [step] } }).success).toBe(true);
  });

  it('rejects unallowed image hostnames', () => {
    const invalid = {
      name: 'Invalid Host Setup',
      author: { name: 'bob', github: 'bob' },
      summary: 'A setup with bad image host.',
      license: 'MIT',
      updatedAt: '2026-10-15',
      distros: ['arch'],
      wm: 'sway',
      displayServer: 'wayland',
      screenshots: [
        {
          url: 'https://malicious-site.com/image.png',
          alt: 'Bad host',
        },
      ],
      source: {
        repo: 'https://github.com/bob/dots',
        ref: 'v1.0.0',
      },
    };

    const res = configSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('identifies pinned git refs vs moving branch names', () => {
    expect(isPinnedRef('v1.0.0')).toBe(true);
    expect(isPinnedRef('0.9.1-beta')).toBe(true);
    expect(isPinnedRef('e3b0c44298fc1c149afbf4c8996fb92427ae41e4')).toBe(true); // 40-char SHA
    expect(isPinnedRef('main')).toBe(false);
    expect(isPinnedRef('master')).toBe(false);
    expect(isPinnedRef('latest')).toBe(false);
  });

  it('extracts raw refs from github raw urls', () => {
    expect(extractRawRef('https://raw.githubusercontent.com/owner/repo/v1.2.3/install.sh')).toBe('v1.2.3');
    expect(extractRawRef('https://github.com/owner/repo/raw/v2.0/install.sh')).toBe('v2.0');
    expect(extractRawRef('https://raw.githubusercontent.com/owner/repo/main/install.sh')).toBe('main');
  });

  it('validates slugs with regex', () => {
    expect(SLUG_RE.test('hyprland-paper-minimal')).toBe(true);
    expect(SLUG_RE.test('sway-42')).toBe(true);
    expect(SLUG_RE.test('a')).toBe(false); // too short
    expect(SLUG_RE.test('Invalid_Slug!')).toBe(false); // uppercase & symbols
  });

  it('extracts author and slug from file paths', () => {
    expect(idFromPath('/home/user/0xTsoa/configs/prasanthrangan/hyprdots.json')).toEqual({
      id: 'prasanthrangan/hyprdots',
      author: 'prasanthrangan',
      slug: 'hyprdots',
    });
    expect(idFromPath('configs/gh0stzk/dotfiles-bspwm.json')).toEqual({
      id: 'gh0stzk/dotfiles-bspwm',
      author: 'gh0stzk',
      slug: 'dotfiles-bspwm',
    });
    expect(idFromPath('invalid/path.json')).toBeNull();
  });
});

describe('Published JSON Schema & example', () => {
  it('schema/config.schema.json is up to date (run `npm run schema`)', async () => {
    const fs = await import('node:fs');
    const { buildJsonSchema, serialize, SCHEMA_PATH } = await import('../scripts/generate-schema');
    expect(fs.readFileSync(SCHEMA_PATH, 'utf-8')).toBe(serialize(buildJsonSchema()));
  });

  it('the example shown on /contribute is a valid config', async () => {
    const example = (await import('../schema/example.config.json')).default;
    const parsed = configSchema.safeParse(example);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});
