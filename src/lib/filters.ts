
export interface CatalogueItem {
  id: string;
  name: string;
  author: {
    name: string;
    github: string;
  };
  summary: string;
  category: string;
  distros: string[];
  wm: string;
  themeStyle?: string;
  displayServer: string;
  tags: string[];
  specs: {
    bar?: string;
    terminal?: string;
    launcher?: string;
    theme?: string;
    shell?: string;
  };
  source?: {
    repo: string;
    ref: string;
  };
  install?: {
    steps: {
      id: 'deps' | 'dotfiles' | 'reload';
      title: string;
      commands: string[];
    }[];
    script?: {
      url: string;
      sha256: string;
      shell: 'sh' | 'bash';
    };
  };
  thumbUrl: string;
  thumbAlt: string;
  version?: string;
  updatedAt: string;
  votes: number;
  stars: number;
}

export const SORT_KEYS = ['votes', 'new', 'old', 'popular'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const PAGE_SIZE = 10;

/** One page (1-based) of an already filtered and sorted list. */
export function paginate<T>(items: T[], page = 1): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  return { items: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), page: current, pageCount };
}

export interface FilterState {
  category?: string | string[];
  wm?: string | string[];
  style?: string | string[];
  distro?: string | string[];
  tag?: string;
  query?: string;
  favoritesOnly?: boolean;
  favorites?: string[];
  sort?: SortKey;
  page?: number;
}

function normalizeFacetValues(val?: string | string[]): string[] {
  if (!val) return [];
  const list = Array.isArray(val) ? val : [val];
  return list
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.toLowerCase() !== 'all');
}

export function filterConfigs(items: CatalogueItem[], filters: FilterState): CatalogueItem[] {
  let result = items.slice();

  const categories = normalizeFacetValues(filters.category).map((c) => c.toLowerCase());
  if (categories.length > 0) {
    result = result.filter((item) => categories.includes(item.category.toLowerCase()));
  }

  const wms = normalizeFacetValues(filters.wm).map((w) => w.toLowerCase());
  if (wms.length > 0) {
    result = result.filter((item) => wms.includes(item.wm.toLowerCase()));
  }

  const styles = normalizeFacetValues(filters.style).map((s) => s.toLowerCase());
  if (styles.length > 0) {
    result = result.filter((item) =>
      styles.includes((item.themeStyle || 'minimalist').toLowerCase()),
    );
  }

  const distros = normalizeFacetValues(filters.distro).map((d) => d.toLowerCase());
  if (distros.length > 0) {
    result = result.filter(
      (item) =>
        item.distros.includes('any') ||
        item.distros.some((d) => distros.includes(d.toLowerCase())),
    );
  }

  if (filters.tag) {
    const targetTag = filters.tag.toLowerCase().replace(/^#/, '');
    result = result.filter((item) => item.tags.some((t) => t.toLowerCase() === targetTag));
  }

  if (filters.favoritesOnly) {
    const favSet = new Set(filters.favorites ?? []);
    result = result.filter((item) => favSet.has(item.id));
  }

  if (filters.query && filters.query.trim().length > 0) {
    const q = filters.query.toLowerCase().trim();
    result = result.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.author.name.toLowerCase().includes(q) ||
        item.author.github.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.wm.toLowerCase().includes(q) ||
        (item.themeStyle && item.themeStyle.toLowerCase().includes(q)) ||
        item.tags.some((t) => t.toLowerCase().includes(q)) ||
        (item.specs.terminal && item.specs.terminal.toLowerCase().includes(q)) ||
        (item.specs.bar && item.specs.bar.toLowerCase().includes(q)) ||
        (item.specs.launcher && item.specs.launcher.toLowerCase().includes(q)) ||
        (item.specs.theme && item.specs.theme.toLowerCase().includes(q)) ||
        (item.specs.shell && item.specs.shell.toLowerCase().includes(q)),
    );
  }

  const date = (item: CatalogueItem) => new Date(item.updatedAt).getTime();
  const sort = filters.sort ?? 'votes';
  if (sort === 'new') result.sort((a, b) => date(b) - date(a));
  else if (sort === 'old') result.sort((a, b) => date(a) - date(b));
  else if (sort === 'popular') result.sort((a, b) => b.stars - a.stars);
  else result.sort((a, b) => b.votes - a.votes || b.stars - a.stars);

  return result;
}

function parseFacetParam(searchParams: URLSearchParams, key: string): string | string[] | undefined {
  const vals = searchParams
    .getAll(key)
    .map((v) => v.trim())
    .filter(Boolean);
  if (vals.length === 0) return undefined;
  return vals.length === 1 ? vals[0] : vals;
}

export function parseQueryToFilters(searchParams: URLSearchParams): FilterState {
  const category = parseFacetParam(searchParams, 'category');
  const wm = parseFacetParam(searchParams, 'wm');
  const style = parseFacetParam(searchParams, 'style');
  const distro = parseFacetParam(searchParams, 'distro');
  const tag = searchParams.get('tag') || undefined;
  const query = searchParams.get('q') || undefined;
  const favoritesOnly = searchParams.get('fav') === 'true' ? true : undefined;
  const sortParam = searchParams.get('sort');
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sortParam ?? '') ? (sortParam as SortKey) : 'votes';
  const pageParam = searchParams.get('p');
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;

  return { category, wm, style, distro, tag, query, favoritesOnly, sort, page };
}

export function filtersToQueryString(filters: FilterState): string {
  const p = new URLSearchParams();
  for (const c of normalizeFacetValues(filters.category)) p.append('category', c);
  for (const w of normalizeFacetValues(filters.wm)) p.append('wm', w);
  for (const s of normalizeFacetValues(filters.style)) p.append('style', s);
  for (const d of normalizeFacetValues(filters.distro)) p.append('distro', d);
  if (filters.tag) p.set('tag', filters.tag);
  if (filters.query) p.set('q', filters.query);
  if (filters.favoritesOnly) p.set('fav', 'true');
  if (filters.sort && filters.sort !== 'votes') p.set('sort', filters.sort);
  if (filters.page && filters.page > 1) p.set('p', String(filters.page));

  const s = p.toString();
  return s ? `?${s}` : '';
}
