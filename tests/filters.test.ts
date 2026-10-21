import { describe, it, expect } from 'vitest';
import { filterConfigs, parseQueryToFilters, filtersToQueryString, paginate, PAGE_SIZE, type CatalogueItem } from '../src/lib/filters';

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
    tags: ['waybar', 'minimal'],
    specs: {},
    thumbUrl: 'https://example.com/thumb1.png',
    thumbAlt: 'Thumb 1',
    updatedAt: '2026-10-10',
    votes: 1400,
    stars: 500,
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
    specs: {},
    thumbUrl: 'https://example.com/thumb2.png',
    thumbAlt: 'Thumb 2',
    updatedAt: '2026-10-12',
    votes: 900,
    stars: 9000,
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
    specs: { bar: 'polybar', terminal: 'alacritty' },
    thumbUrl: 'https://example.com/thumb3.png',
    thumbAlt: 'Thumb 3',
    updatedAt: '2026-10-01',
    votes: 500,
    stars: 120,
  },
];

describe('Catalogue Filter & Query State Logic', () => {
  it('filters by WM (single and multi-value array)', () => {
    const res = filterConfigs(mockItems, { wm: 'hyprland' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('user1/hypr-setup');

    const multi = filterConfigs(mockItems, { wm: ['hyprland', 'sway'] });
    expect(multi.map((m) => m.id)).toEqual(['user1/hypr-setup', 'user2/sway-setup']);
  });

  it('filters by multi-value category, style, and distro arrays', () => {
    expect(filterConfigs(mockItems, { category: ['bar'] }).map((m) => m.id)).toEqual(['user3/bspwm-setup']);
    expect(filterConfigs(mockItems, { style: ['cyberpunk', 'gruvbox'] }).map((m) => m.id)).toEqual([
      'user1/hypr-setup',
      'user3/bspwm-setup',
    ]);
    expect(filterConfigs(mockItems, { distro: ['arch', 'void'] }).map((m) => m.id)).toEqual([
      'user1/hypr-setup',
      'user3/bspwm-setup',
    ]);
  });

  it('filters by Style / Thème', () => {
    const res = filterConfigs(mockItems, { style: 'cyberpunk' });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('user1/hypr-setup');
    const resNord = filterConfigs(mockItems, { style: 'nord' });
    expect(resNord.length).toBe(1);
    expect(resNord[0].id).toBe('user2/sway-setup');
  });

  it('filters by multi-field search query including author.github, specs, and id', () => {
    expect(filterConfigs(mockItems, { query: 'fedora' }).map((m) => m.id)).toEqual(['user2/sway-setup']);
    expect(filterConfigs(mockItems, { query: 'user3' }).map((m) => m.id)).toEqual(['user3/bspwm-setup']);
    expect(filterConfigs(mockItems, { query: 'alacritty' }).map((m) => m.id)).toEqual(['user3/bspwm-setup']);
    expect(filterConfigs(mockItems, { query: 'user1/hypr-setup' }).map((m) => m.id)).toEqual(['user1/hypr-setup']);
  });

  it('filters by favoritesOnly when favorites list is provided', () => {
    const res = filterConfigs(mockItems, {
      favoritesOnly: true,
      favorites: ['user2/sway-setup', 'user3/bspwm-setup'],
    });
    expect(res.map((m) => m.id)).toEqual(['user2/sway-setup', 'user3/bspwm-setup']);
  });

  it('sorts by newest and oldest update date', () => {
    expect(filterConfigs(mockItems, { sort: 'new' })[0].id).toBe('user2/sway-setup'); // 2026-10-12
    const old = filterConfigs(mockItems, { sort: 'old' });
    expect(old[old.length - 1].id).toBe('user2/sway-setup');
  });

  it('sorts by most popular (upstream stars)', () => {
    expect(filterConfigs(mockItems, { sort: 'popular' }).map((r) => r.stars)).toEqual([9000, 500, 120]);
  });

  it('sorts by most approved, using stars to break ties', () => {
    const tied = mockItems.map((m) => ({ ...m, votes: 0 }));
    expect(filterConfigs(tied, { sort: 'votes' })[0].stars).toBe(9000);
  });

  it('paginates 10 per page and clamps out-of-range pages', () => {
    const many = Array.from({ length: 23 }, (_, i) => i);
    expect(PAGE_SIZE).toBe(10);
    expect(paginate(many, 1).items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paginate(many, 3)).toEqual({ items: [20, 21, 22], page: 3, pageCount: 3 });
    expect(paginate(many, 99).page).toBe(3);
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pageCount: 1 });
  });

  it('serializes and parses URL query string round-trip with single and multi-value facets', () => {
    const state = {
      wm: 'hyprland',
      style: 'cyberpunk',
      distro: 'arch',
      sort: 'popular' as const,
      page: 2,
    };

    const qs = filtersToQueryString(state);
    const parsed = parseQueryToFilters(new URLSearchParams(qs.replace('?', '')));

    expect(parsed.wm).toBe('hyprland');
    expect(parsed.style).toBe('cyberpunk');
    expect(parsed.distro).toBe('arch');
    expect(parsed.sort).toBe('popular');
    expect(parsed.page).toBe(2);

    const multiQs = filtersToQueryString({
      category: ['dotfiles', 'bar'],
      wm: ['hyprland', 'sway'],
    });
    expect(multiQs).toBe('?category=dotfiles&category=bar&wm=hyprland&wm=sway');
    const parsedMulti = parseQueryToFilters(new URLSearchParams(multiQs.replace('?', '')));
    expect(parsedMulti.category).toEqual(['dotfiles', 'bar']);
    expect(parsedMulti.wm).toEqual(['hyprland', 'sway']);
  });
});
