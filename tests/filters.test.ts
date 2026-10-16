import { describe, it, expect } from 'vitest';
import { filterConfigs, parseQueryToFilters, filtersToQueryString, type CatalogueItem } from '../src/lib/filters';

const mockItems: CatalogueItem[] = [
  {
    id: 'user1/hypr-setup',
    name: 'Hyprland Setup',
    author: { name: 'User 1', github: 'user1' },
    summary: 'Hyprland setup for Arch Linux with high contrast.',
    category: 'dotfiles',
    distros: ['arch'],
    wm: 'hyprland',
    themeStyle: 'cyberpunk',
    displayServer: 'wayland',
    tags: ['battery-tuned', 'minimal'],
    specs: { ramIdleMiB: 280, batteryProfile: true },
    thumbUrl: 'https://example.com/thumb1.png',
    thumbAlt: 'Thumb 1',
    updatedAt: '2026-10-10',
    votes: 1400,
  },
  {
    id: 'user2/sway-setup',
    name: 'Sway Setup',
    author: { name: 'User 2', github: 'user2' },
    summary: 'Sway on Fedora for ThinkPad.',
    category: 'dotfiles',
    distros: ['fedora'],
    wm: 'sway',
    themeStyle: 'nord',
    displayServer: 'wayland',
    tags: ['thinkpad'],
    specs: { ramIdleMiB: 450, batteryProfile: false },
    thumbUrl: 'https://example.com/thumb2.png',
    thumbAlt: 'Thumb 2',
    updatedAt: '2026-10-12',
    votes: 900,
  },
  {
    id: 'user3/bspwm-setup',
    name: 'BSPWM Setup',
    author: { name: 'User 3', github: 'user3' },
    summary: 'BSPWM on Void Linux.',
    category: 'bar',
    distros: ['void'],
    wm: 'bspwm',
    themeStyle: 'gruvbox',
    displayServer: 'x11',
    tags: ['lightweight'],
    specs: { ramIdleMiB: 180, batteryProfile: true },
    thumbUrl: 'https://example.com/thumb3.png',
    thumbAlt: 'Thumb 3',
    updatedAt: '2026-10-01',
    votes: 500,
  },
];

describe('Catalogue Filter & Query State Logic', () => {
  it('filters by WM', () => {
    const res = filterConfigs(mockItems, { wm: 'hyprland' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('user1/hypr-setup');
  });

  it('filters by Style / Thème', () => {
    const res = filterConfigs(mockItems, { style: 'cyberpunk' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('user1/hypr-setup');
    const resNord = filterConfigs(mockItems, { style: 'nord' });
    expect(resNord.length).toBe(1);
    expect(resNord[0].id).toBe('user2/sway-setup');
  });

  it('filters by multi-field search query', () => {
    const res = filterConfigs(mockItems, { query: 'fedora' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('user2/sway-setup');
  });

  it('filters by RAM ceiling', () => {
    const res = filterConfigs(mockItems, { ramMax: 300 });
    expect(res.length).toBe(2);
    expect(res.map((r) => r.id)).toEqual(['user1/hypr-setup', 'user3/bspwm-setup']);
  });

  it('filters by battery optimization flag', () => {
    const res = filterConfigs(mockItems, { battery: true });
    expect(res.length).toBe(2);
  });

  it('sorts by lowest RAM', () => {
    const res = filterConfigs(mockItems, { sort: 'ram' });
    expect(res[0].specs.ramIdleMiB).toBe(180);
    expect(res[2].specs.ramIdleMiB).toBe(450);
  });

  it('sorts by most recent update date', () => {
    const res = filterConfigs(mockItems, { sort: 'recent' });
    expect(res[0].id).toBe('user2/sway-setup'); // 2026-10-12
  });

  it('serializes and parses URL query string round-trip with style', () => {
    const state = {
      wm: 'hyprland',
      style: 'cyberpunk',
      distro: 'arch',
      ramMax: 300,
      battery: true,
      sort: 'ram' as const,
    };

    const qs = filtersToQueryString(state);
    const parsed = parseQueryToFilters(new URLSearchParams(qs.replace('?', '')));

    expect(parsed.wm).toBe('hyprland');
    expect(parsed.style).toBe('cyberpunk');
    expect(parsed.distro).toBe('arch');
    expect(parsed.ramMax).toBe(300);
    expect(parsed.battery).toBe(true);
    expect(parsed.sort).toBe('ram');
  });
});
