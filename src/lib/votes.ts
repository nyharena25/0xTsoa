import fs from 'node:fs';
import path from 'node:path';
import { REPO_URL, VOTE_LABEL, voteIssueTitle } from '../../site.config';

export interface VoteData {
  votes: number;
  /** URL of the config's vote issue (name kept from the former Discussions backend). */
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

/** Where the ✓ Sign-Off button points: the config's vote issue. */
export function getDiscussionUrlForConfig(configId: string): string {
  const url = getVotesMap()[configId]?.discussionUrl;
  if (url) return url;
  // Vote issue not synced into this build yet: an exact-title search still lands on it once it exists.
  const q = `is:issue label:${VOTE_LABEL} in:title "${voteIssueTitle(configId)}"`;
  return `${REPO_URL}/issues?q=${encodeURIComponent(q)}`;
}

export interface VoteIssue {
  number: number;
  title: string;
  html_url: string;
  reactions?: Record<string, number>;
  pull_request?: unknown;
}

const POSITIVE_REACTIONS = ['+1', 'heart', 'hooray'];
const VOTE_TITLE_RE = /^\[0xTsoa\]\s+([\w.-]+\/[\w.-]+)$/;

/**
 * Every issue labelled VOTE_LABEL (open and closed, all pages).
 * Works without a token on a public repo. Throws on API errors so callers never
 * mistake a failed listing for "no vote issues yet" (that would create duplicates).
 */
export async function listVoteIssues(owner: string, repo: string, token?: string): Promise<VoteIssue[]> {
  const issues: VoteIssue[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?labels=${VOTE_LABEL}&state=all&per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': '0xTsoa-Votes/1.0',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) throw new Error(`GitHub issues API returned ${res.status} ${res.statusText}`);
    const batch = (await res.json()) as VoteIssue[];
    issues.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) return issues;
  }
}

/** Vote issues → { configId: { votes, discussionUrl } }, counting 👍 ❤️ 🎉 reactions. */
export function votesFromIssues(issues: VoteIssue[]): VotesMap {
  const map: VotesMap = {};
  for (const issue of issues) {
    const id = issue.title.trim().match(VOTE_TITLE_RE)?.[1];
    if (!id || map[id]) continue;
    const votes = POSITIVE_REACTIONS.reduce((n, k) => n + (issue.reactions?.[k] ?? 0), 0);
    map[id] = { votes, discussionUrl: issue.html_url };
  }
  return map;
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
