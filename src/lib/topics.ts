/**
 * Topic guides in the Docs section (/docs/hyprland/, /docs/gtk-themes/…): one per window manager, desktop part or palette that
 * people search for. Each groups the registry entries of one catalogue facet, with a hand-written
 * introduction, tips and FAQ. A topic is only published with MIN_TOPIC_ENTRIES entries or more,
 * so the site never ships a thin page; below that it stays a catalogue filter.
 */
import type { ConfigData } from './schema';
import { TOPICS } from './topics-data';

export const MIN_TOPIC_ENTRIES = 5;

export type TopicFacet =
  | { kind: 'wm'; value: ConfigData['wm'] }
  | { kind: 'category'; value: ConfigData['category'] }
  | { kind: 'style'; value: ConfigData['themeStyle'] };

/** A "Picks by need" row: the first candidate that is listed, maintained and not already picked wins. */
export interface TopicPick {
  need: string;
  candidates: { id: string; reason: string }[];
}

/** An entry to move away from although its repository is not archived (deprecated, replaced by a successor). */
export interface RetiredEntry {
  id: string;
  note: string;
  /** Entries to move to; without it, maintained entries of the same category are suggested. */
  to?: string[];
}

export interface Topic {
  slug: string;
  /** Short name for links and breadcrumbs. */
  label: string;
  facet: TopicFacet;
  /** Search title without the " — 0xTsoa" suffix (at most 51 characters). `{year}` becomes the build year. */
  title: string;
  /** `{year}` becomes the build year. */
  h1: string;
  /** When the hand-written text was last reviewed (YYYY-MM-DD). Feeds dateModified with the entries' dates. */
  updated: string;
  /** Meta description; `{n}` becomes the number of entries. At most 160 characters once filled. */
  description: string;
  intro: string[];
  choose: string[];
  faq: { q: string; a: string }[];
  picks?: TopicPick[];
  retired?: RetiredEntry[];
}

export { TOPICS };

/** Topic pages live in the Docs section. */
export function topicPath(slug: string): string {
  return `/docs/${slug}/`;
}

/** How the Docs index groups the guides. Every topic slug appears once. */
export const TOPIC_GROUPS: { title: string; slugs: string[] }[] = [
  { title: 'Desktops and full setups', slugs: ['dotfiles', 'hyprland', 'gnome', 'kde-plasma', 'awesomewm'] },
  { title: 'Desktop parts', slugs: ['bars', 'launchers', 'notification-daemons', 'login-managers'] },
  { title: 'Themes and colors', slugs: ['gtk-themes', 'icon-themes', 'cursor-themes', 'color-schemes', 'catppuccin'] },
];

export function topicMatches(topic: Topic, data: ConfigData): boolean {
  const { facet } = topic;
  if (facet.kind === 'wm') return data.wm === facet.value;
  if (facet.kind === 'category') return data.category === facet.value;
  return data.themeStyle === facet.value;
}

export function topicEntries<T extends { data: ConfigData }>(topic: Topic, all: T[]): T[] {
  return all.filter((e) => topicMatches(topic, e.data));
}

/** Topics with enough entries to publish, in TOPICS order. */
export function liveTopics<T extends { data: ConfigData }>(all: T[]): { topic: Topic; entries: T[] }[] {
  return TOPICS.map((topic) => ({ topic, entries: topicEntries(topic, all) })).filter((t) => t.entries.length >= MIN_TOPIC_ENTRIES);
}

export function topicForFacet(live: Topic[], facet: TopicFacet): Topic | undefined {
  return live.find((t) => t.facet.kind === facet.kind && t.facet.value === facet.value);
}

/**
 * The topic page a config belongs under, for breadcrumbs: dotfiles go under their window
 * manager (Hyprland dotfiles), everything else under its desktop part (a Hyprland bar is a bar),
 * then the window manager, then the palette.
 */
export function primaryTopic(data: ConfigData, live: Topic[]): Topic | undefined {
  const byWm = topicForFacet(live, { kind: 'wm', value: data.wm });
  const byCategory = topicForFacet(live, { kind: 'category', value: data.category });
  const byStyle = topicForFacet(live, { kind: 'style', value: data.themeStyle });
  if (data.category === 'dotfiles') return byWm ?? byCategory ?? byStyle;
  return byCategory ?? byWm ?? byStyle;
}

export function topicDescription(topic: Topic, count: number): string {
  return topicText(topic.description.replace('{n}', String(count)));
}

/** Fills `{year}` in a topic's title or heading with the build year, so "in 2026" never goes stale. */
export function topicText(text: string, year: number = new Date().getUTCFullYear()): string {
  return text.replaceAll('{year}', String(year));
}

/**
 * The page's dateModified: the latest of the text's review date and the entries' pinned dates.
 * Stars and maintenance refresh every night but are not edits, so they do not count.
 */
export function topicModified(topic: Topic, entries: { data: ConfigData }[]): string {
  // YYYY-MM-DD strings sort as dates.
  return [topic.updated, ...entries.map((e) => e.data.updatedAt)].toSorted((a, b) => a.localeCompare(b)).at(-1)!;
}

/** "Picks by need": per need, the first candidate that is in the topic, not retired, and not picked for an earlier need. */
export function choosePicks<T extends { id: string }>(
  topic: Topic,
  entries: T[],
  isRetired: (entry: T) => boolean,
): { need: string; reason: string; entry: T }[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const used = new Set<string>();
  const picks: { need: string; reason: string; entry: T }[] = [];
  for (const { need, candidates } of topic.picks ?? []) {
    const choice = candidates.find((c) => byId.has(c.id) && !used.has(c.id) && !isRetired(byId.get(c.id)!));
    if (!choice) continue;
    used.add(choice.id);
    picks.push({ need, reason: choice.reason, entry: byId.get(choice.id)! });
  }
  return picks;
}

/** Entries to move away from: archived upstream (detected) or retired by hand in the topic, in that order. */
export function retiredEntries<T extends { id: string }>(
  topic: Topic,
  entries: T[],
  isArchived: (entry: T) => boolean,
): { entry: T; note: string; to?: string[] }[] {
  const listed = new Map((topic.retired ?? []).map((r) => [r.id, r]));
  const archived = entries.filter((e) => isArchived(e)).map((entry) => ({ entry, note: listed.get(entry.id)?.note ?? 'The upstream repository is archived: it may still work, but bugs will not be fixed.', to: listed.get(entry.id)?.to }));
  const byHand = entries.filter((e) => listed.has(e.id) && !isArchived(e)).map((entry) => ({ entry, note: listed.get(entry.id)!.note, to: listed.get(entry.id)!.to }));
  return [...archived, ...byHand];
}
