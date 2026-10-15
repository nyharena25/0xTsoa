import fs from 'node:fs';
import path from 'node:path';
import { VOTES_CATEGORY, REPO_URL } from '../../site.config';

export interface VoteData {
  votes: number;
  discussionUrl?: string;
  updatedAt?: string;
}

export type VotesMap = Record<string, VoteData>;

let cachedVotes: VotesMap | null = null;

export function getVotesMap(): VotesMap {
  if (cachedVotes) return cachedVotes;

  const votesPath = path.resolve(process.cwd(), 'src/generated/votes.json');
  if (fs.existsSync(votesPath)) {
    try {
      cachedVotes = JSON.parse(fs.readFileSync(votesPath, 'utf-8'));
      return cachedVotes!;
    } catch {
      // Fallback
    }
  }
  return {};
}

export function getVotesForConfig(configId: string): number {
  const map = getVotesMap();
  return map[configId]?.votes ?? 0;
}

export function getDiscussionUrlForConfig(configId: string): string {
  const map = getVotesMap();
  if (map[configId]?.discussionUrl) {
    return map[configId].discussionUrl!;
  }
  // Generic fallback: link to discussions category search
  return `${REPO_URL}/discussions/categories/${encodeURIComponent(VOTES_CATEGORY.toLowerCase())}`;
}

export function getFeaturedIds(): string[] {
  const featuredPath = path.resolve(process.cwd(), 'featured.json');
  if (fs.existsSync(featuredPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(featuredPath, 'utf-8'));
      if (Array.isArray(data.pinned)) return data.pinned;
    } catch {
      // Fallback
    }
  }
  return [];
}

/**
 * Sort configs for the Top 5 Spotlight:
 * Pinned configs first (in order), then remaining configs sorted by votes descending.
 */
export function getTop5Configs<T extends { id: string }>(allConfigs: T[]): T[] {
  const pinned = getFeaturedIds();
  const votes = getVotesMap();

  const configMap = new Map<string, T>();
  for (const c of allConfigs) {
    configMap.set(c.id, c);
  }

  const result: T[] = [];

  // Add pinned configs first if they exist
  for (const id of pinned) {
    const item = configMap.get(id);
    if (item && !result.includes(item)) {
      result.push(item);
    }
  }

  // Get remaining configs sorted by votes
  const remaining = allConfigs
    .filter((c) => !result.includes(c))
    .sort((a, b) => {
      const vA = votes[a.id]?.votes ?? 0;
      const vB = votes[b.id]?.votes ?? 0;
      return vB - vA;
    });

  for (const item of remaining) {
    if (result.length >= 5) break;
    result.push(item);
  }

  return result.slice(0, 5);
}
