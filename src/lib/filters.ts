
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
    ramIdleMiB?: number;
    batteryProfile?: boolean;
  };
  thumbUrl: string;
  thumbAlt: string;
  version?: string;
  updatedAt: string;
  votes: number;
}

export interface FilterState {
  category?: string;
  wm?: string;
  style?: string;
  distro?: string;
  ramMax?: number;
  battery?: boolean;
  tag?: string;
  query?: string;
  favoritesOnly?: boolean;
  sort?: 'votes' | 'recent' | 'ram';
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

  if (filters.ramMax !== undefined && filters.ramMax > 0) {
    result = result.filter((item) => item.specs.ramIdleMiB !== undefined && item.specs.ramIdleMiB <= filters.ramMax!);
  }

  if (filters.battery === true) {
    result = result.filter((item) => item.specs.batteryProfile === true);
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

  // Sort
  const sort = filters.sort ?? 'votes';
  if (sort === 'votes') {
    result.sort((a, b) => b.votes - a.votes);
  } else if (sort === 'recent') {
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } else if (sort === 'ram') {
    result.sort((a, b) => (a.specs.ramIdleMiB ?? 99999) - (b.specs.ramIdleMiB ?? 99999));
  }

  return result;
}

export function parseQueryToFilters(searchParams: URLSearchParams): FilterState {
  const category = searchParams.get('category') || undefined;
  const wm = searchParams.get('wm') || undefined;
  const style = searchParams.get('style') || undefined;
  const distro = searchParams.get('distro') || undefined;
  const ramParam = searchParams.get('ramMax');
  const ramMax = ramParam ? parseInt(ramParam, 10) : undefined;
  const battery = searchParams.get('battery') === 'true' ? true : undefined;
  const tag = searchParams.get('tag') || undefined;
  const query = searchParams.get('q') || undefined;
  const favoritesOnly = searchParams.get('fav') === 'true' ? true : undefined;
  const sortParam = searchParams.get('sort');
  const sort = sortParam === 'recent' || sortParam === 'ram' ? sortParam : 'votes';
  const pageParam = searchParams.get('p');
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;

  return { category, wm, style, distro, ramMax, battery, tag, query, favoritesOnly, sort, page };
}

export function filtersToQueryString(filters: FilterState): string {
  const p = new URLSearchParams();
  if (filters.category && filters.category !== 'all') p.set('category', filters.category);
  if (filters.wm && filters.wm !== 'all') p.set('wm', filters.wm);
  if (filters.style && filters.style !== 'all') p.set('style', filters.style);
  if (filters.distro && filters.distro !== 'all') p.set('distro', filters.distro);
  if (filters.ramMax !== undefined) p.set('ramMax', String(filters.ramMax));
  if (filters.battery) p.set('battery', 'true');
  if (filters.tag) p.set('tag', filters.tag);
  if (filters.query) p.set('q', filters.query);
  if (filters.favoritesOnly) p.set('fav', 'true');
  if (filters.sort && filters.sort !== 'votes') p.set('sort', filters.sort);
  if (filters.page && filters.page > 1) p.set('p', String(filters.page));

  const s = p.toString();
  return s ? `?${s}` : '';
}
