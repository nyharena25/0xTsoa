import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { configSeoTitle, configSeoDescription, impactSentence, TITLE_MAX, DESCRIPTION_MAX } from '../src/lib/seo';
import { installDifficulty, installImpact, type InstallImpact } from '../src/lib/install';
import { configSchema, type ConfigData } from '../src/lib/schema';

const base = configSchema.parse({
  name: 'Orchis',
  author: { name: 'Vince', github: 'vinceliuice' },
  summary: 'Material-inspired GTK theme with rounded corners.',
  license: 'GPL-3.0-only',
  updatedAt: '2026-10-01',
  distros: ['any'],
  category: 'gtk-theme',
  wm: 'any',
  displayServer: 'both',
  screenshots: [{ url: 'https://raw.githubusercontent.com/a/b/v1.0.0/p.png', alt: 'Orchis preview' }],
  source: { repo: 'https://github.com/vinceliuice/Orchis-theme', ref: 'v1.0.0' },
  install: { steps: [{ id: 'deps', title: 'Clone', commands: ['git clone https://github.com/vinceliuice/Orchis-theme ~/orchis', 'git -C ~/orchis checkout {{ref}}'] }] },
});
const cfg = (over: Partial<ConfigData>): ConfigData => ({ ...base, ...over });
const noImpact: InstallImpact = { packages: [], aurPackages: [], userPaths: [], systemCommands: [], upstreamCommands: [], execCommands: [], manualNotes: [] };

describe('configSeoTitle', () => {
  it('names the project the way people search for its category', () => {
    expect(configSeoTitle(base)).toBe('Orchis GTK Theme: Preview & Install');
    expect(configSeoTitle(cfg({ name: 'Waybar', category: 'bar' }))).toBe('Waybar Status Bar: Preview & Install');
    expect(configSeoTitle(cfg({ name: 'chezmoi', category: 'tool', tags: ['dotfile-manager'] }))).toBe('chezmoi Dotfiles Manager: Preview & Install');
    expect(configSeoTitle(cfg({ name: 'Blur my Shell', category: 'extension', wm: 'gnome' }))).toBe('Blur my Shell GNOME Extension: Preview & Install');
  });

  it('completes a name that already starts the noun, and does not repeat it', () => {
    expect(configSeoTitle(cfg({ name: 'Catppuccin GTK' }))).toBe('Catppuccin GTK Theme: Preview & Install');
    expect(configSeoTitle(cfg({ name: 'Catppuccin Cursors', category: 'cursors' }))).toBe('Catppuccin Cursors: Preview & Install');
    expect(configSeoTitle(cfg({ name: 'Catppuccin GRUB', category: 'boot' }))).toBe('Catppuccin GRUB Theme: Preview & Install');
  });

  it('puts the compositor and distro into dotfiles titles', () => {
    expect(configSeoTitle(cfg({ name: 'HyDE', category: 'dotfiles', wm: 'hyprland', distros: ['arch'] }))).toBe('HyDE: Hyprland Dotfiles on Arch Linux');
    expect(configSeoTitle(cfg({ name: 'ML4W Dotfiles', category: 'dotfiles', wm: 'hyprland', distros: ['arch'] }))).toBe('ML4W Dotfiles for Hyprland on Arch Linux');
    expect(configSeoTitle(cfg({ name: 'Crystal', category: 'dotfiles', wm: 'awesome' }))).toBe('Crystal: AwesomeWM Dotfiles');
  });

  it('adds the window manager only when the name does not say it already', () => {
    expect(configSeoTitle(cfg({ name: 'hyprlock', category: 'lockscreen', wm: 'hyprland' }))).toBe('hyprlock Lock Screen for Hyprland');
    expect(configSeoTitle(cfg({ name: 'HyprPanel', category: 'bar', wm: 'hyprland' }))).toBe('HyprPanel Status Bar for Hyprland');
  });

  it('keeps reading lists as they are named', () => {
    expect(configSeoTitle(cfg({ name: 'Awesome Hyprland', category: 'resource', wm: 'hyprland', install: undefined }))).toBe('Awesome Hyprland');
  });

  it('never exceeds the room left by the site suffix, for every registry entry', () => {
    const root = path.resolve('configs');
    for (const author of fs.readdirSync(root).filter((a) => fs.statSync(path.join(root, a)).isDirectory())) {
      for (const file of fs.readdirSync(path.join(root, author)).filter((f) => f.endsWith('.json'))) {
        const data = configSchema.parse(JSON.parse(fs.readFileSync(path.join(root, author, file), 'utf-8')));
        expect(configSeoTitle(data).length, `${author}/${file}`).toBeLessThanOrEqual(TITLE_MAX);
        const desc = configSeoDescription(data, installDifficulty(data), installImpact(data));
        expect(desc.length, `${author}/${file}`).toBeLessThanOrEqual(DESCRIPTION_MAX);
      }
    }
  });
});

describe('impactSentence', () => {
  it('describes each difficulty plainly', () => {
    expect(impactSentence(null, noImpact)).toMatch(/nothing to install/);
    expect(impactSentence('manual', noImpact)).toMatch(/by hand from the upstream guide/);
    expect(impactSentence('easy', noImpact)).toMatch(/home folder/);
    expect(impactSentence('moderate', { ...noImpact, packages: ['waybar'] })).toBe("Installs 1 package from your distro's repositories.");
    expect(impactSentence('moderate', { ...noImpact, packages: ['a', 'b'], userPaths: ['~/.config/'] })).toBe('Installs 2 packages; file changes can be rolled back.');
    expect(impactSentence('advanced', { ...noImpact, upstreamCommands: ['./setup.sh'] })).toMatch(/its own installer/);
    expect(impactSentence('advanced', { ...noImpact, aurPackages: ['walker'] })).toBe('Installs 1 package from the AUR.');
    expect(impactSentence('advanced', { ...noImpact, packages: ['a'], aurPackages: ['b'] })).toBe('Installs 2 packages, some from the AUR.');
  });
});

describe('configSeoDescription', () => {
  it('joins what it is, what it works with and what installing it changes', () => {
    expect(configSeoDescription(base, 'manual', noImpact)).toBe(
      'Material-inspired GTK theme with rounded corners. Works with any desktop (Wayland & X11). Pinned source; you set it up by hand from the upstream guide.',
    );
    expect(
      configSeoDescription(cfg({ summary: 'Clean Hyprland rice.', wm: 'hyprland', displayServer: 'wayland', distros: ['arch', 'fedora'] }), 'easy', noImpact),
    ).toBe('Clean Hyprland rice. For Hyprland (Wayland) on Arch Linux, Fedora. Only copies files into your home folder, undone with one command.');
  });

  it('drops the least useful part first when the summary is long', () => {
    const long = cfg({ summary: `${'A'.repeat(60)} long summary about a desktop theme.` });
    const desc = configSeoDescription(long, 'manual', noImpact);
    expect(desc.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(desc).toContain('upstream guide');
    expect(desc).not.toContain('Works with');
  });
});
