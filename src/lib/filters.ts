
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
  category?: string;
  wm?: string;
  style?: string;
  distro?: string;
  tag?: string;
  query?: string;
  favoritesOnly?: boolean;
  sort?: SortKey;
  page?: number;
}

export function filterConfigs(items: CatalogueItem[], filters: FilterState): CatalogueItem[] {
  let result = items.slice();

  if (filters.category && filters.category !== 'all') {
    result = result.filter((item) => item.category === filters.category);
  }

  if (filters.wm && filters.wm !== 'all') {
    result = result.filter((item) => item.wm.toLowerCase() === filters.wm?.toLowerCase());
  }

  if (filters.style && filters.style !== 'all') {
    result = result.filter(
      (item) => (item.themeStyle || '').toLowerCase() === filters.style?.toLowerCase(),
    );
  }

  if (filters.distro && filters.distro !== 'all') {
    result = result.filter(
      (item) => item.distros.includes('any') || item.distros.map((d) => d.toLowerCase()).includes(filters.distro!.toLowerCase()),
    );
  }


  if (filters.tag) {
    const targetTag = filters.tag.toLowerCase().replace(/^#/, '');
    result = result.filter((item) => item.tags.map((t) => t.toLowerCase()).includes(targetTag));
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
        item.wm.toLowerCase().includes(q) ||
        (item.themeStyle && item.themeStyle.toLowerCase().includes(q)) ||
        item.tags.some((t) => t.toLowerCase().includes(q)) ||
        (item.specs.terminal && item.specs.terminal.toLowerCase().includes(q)) ||
        (item.specs.bar && item.specs.bar.toLowerCase().includes(q)) ||
        (item.specs.theme && item.specs.theme.toLowerCase().includes(q)),
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

export function parseQueryToFilters(searchParams: URLSearchParams): FilterState {
  const category = searchParams.get('category') || undefined;
  const wm = searchParams.get('wm') || undefined;
  const style = searchParams.get('style') || undefined;
  const distro = searchParams.get('distro') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const query = searchParams.get('q') || undefined;
  const favoritesOnly = searchParams.get('fav') === 'true' ? true : undefined;
  const sortParam = searchParams.get('sort');
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sortParam ?? '') ? (sortParam as SortKey) : 'votes';
  const pageParam = searchParams.get('p');
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;

  return { category, wm, style, distro, tag, query, favoritesOnly, sort, page };
}

export function filtersToQueryString(filters: FilterState): string {
  const p = new URLSearchParams();
  if (filters.category && filters.category !== 'all') p.set('category', filters.category);
  if (filters.wm && filters.wm !== 'all') p.set('wm', filters.wm);
  if (filters.style && filters.style !== 'all') p.set('style', filters.style);
  if (filters.distro && filters.distro !== 'all') p.set('distro', filters.distro);
  if (filters.tag) p.set('tag', filters.tag);
  if (filters.query) p.set('q', filters.query);
  if (filters.favoritesOnly) p.set('fav', 'true');
  if (filters.sort && filters.sort !== 'votes') p.set('sort', filters.sort);
  if (filters.page && filters.page > 1) p.set('p', String(filters.page));

  const s = p.toString();
  return s ? `?${s}` : '';
}
