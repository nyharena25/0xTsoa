/**
 * "Related setups" on a config page: other entries for the same part of the desktop,
 * the same window manager or the same look, maintained ones first.
 */
import type { ConfigData } from './schema';
import type { MaintenanceStatus } from './stats';

export interface RelatedEntry {
  id: string;
  data: ConfigData;
}

export interface RelatedOptions {
  stars: (id: string) => number;
  status: (id: string, data: ConfigData) => MaintenanceStatus | null;
  limit?: number;
}

// Status tags, not topics: they say nothing about what two entries have in common.
const IGNORED_TAGS = new Set(['archived']);

export function relatednessScore(a: ConfigData, b: ConfigData): number {
  let score = 0;
  if (a.category === b.category) score += 3;
  if (a.wm === b.wm && a.wm !== 'any' && a.wm !== 'other') score += 2;
  if (a.themeStyle === b.themeStyle && a.themeStyle !== 'other') score += 1;
  const shared = a.tags.filter((t) => !IGNORED_TAGS.has(t) && b.tags.includes(t)).length;
  return score + Math.min(shared, 3);
}

/**
 * "Tools" and "Lists & guides" group unlike things (a wallpaper daemon and a fetch tool), so sharing
 * that category alone is not enough: they also need a window manager, tag or style in common.
 */
function minScore(category: ConfigData['category']): number {
  return category === 'tool' || category === 'resource' ? 4 : 2;
}

/** At most `limit` entries sharing the category or window manager, best match first. */
export function relatedConfigs(current: RelatedEntry, all: RelatedEntry[], { stars, status, limit = 4 }: RelatedOptions): RelatedEntry[] {
  return all
    .filter((e) => e.id !== current.id)
    .map((e) => ({ e, score: relatednessScore(current.data, e.data), archived: status(e.id, e.data) === 'archived' }))
    .filter((r) => r.score >= minScore(current.data.category))
    .sort(
      (x, y) =>
        y.score - x.score ||
        Number(x.archived) - Number(y.archived) ||
        stars(y.e.id) - stars(x.e.id) ||
        x.e.id.localeCompare(y.e.id),
    )
    .slice(0, limit)
    .map((r) => r.e);
}

/** For an archived entry: maintained entries of the same category, most starred first. */
export function maintainedAlternatives(current: RelatedEntry, all: RelatedEntry[], { stars, status, limit = 3 }: RelatedOptions): RelatedEntry[] {
  return all
    .filter((e) => e.id !== current.id && e.data.category === current.data.category && status(e.id, e.data) !== 'archived')
    .filter((e) => relatednessScore(current.data, e.data) >= Math.max(3, minScore(current.data.category)))
    .sort((x, y) => relatednessScore(current.data, y.data) - relatednessScore(current.data, x.data) || stars(y.id) - stars(x.id))
    .slice(0, limit);
}
