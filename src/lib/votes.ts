import fs from 'node:fs';
import path from 'node:path';
import { REPO_URL, SITE_URL, VOTE_LABEL, voteIssueTitle, withBase } from '../../site.config';

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

/** "1 upvote" / "12 upvotes": the count as shown on cards, the spotlight and the config page. */
export function upvoteLabel(votes: number): string {
  return `${votes.toLocaleString('en')} upvote${votes === 1 ? '' : 's'}`;
}

/** Where the "Upvote on GitHub" links point: the config's vote issue. */
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
  body?: string | null;
  state?: string;
  reactions?: Record<string, number>;
  pull_request?: unknown;
}

/** Canonical markdown body for a config's GitHub vote issue, linking to its SITE_URL page. */
export function voteIssueBody(configId: string, siteUrl = SITE_URL): string {
  const configUrl = `${siteUrl.replace(/\/$/, '')}${withBase(`/configs/${configId}/`)}`;
  return (
    `### Upvotes for \`${configId}\`\n\n` +
    `- 📋 **Config page:** ${configUrl}\n` +
    `- 👍 **To upvote:** react to this message with 👍 (+1).\n\n` +
    `Votes are counted at every site rebuild. Please keep comments on-topic (feedback about this setup).`
  );
}

/** True when an existing vote issue already points to the canonical config URL on `siteUrl` and is closed. */
export function isVoteIssueUpToDate(issue: VoteIssue, configId: string, siteUrl = SITE_URL): boolean {
  const canonicalConfigUrl = `${siteUrl.replace(/\/$/, '')}${withBase(`/configs/${configId}/`)}`;
  return Boolean(issue.body?.includes(canonicalConfigUrl)) && issue.state === 'closed';
}

const POSITIVE_REACTIONS = ['+1'];
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

/** Vote issues → { configId: { votes, discussionUrl } }, counting 👍 (+1) reactions. */
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

