import fs from 'node:fs';
import path from 'node:path';
import { REPO_OWNER, REPO_NAME, VOTES_CATEGORY } from '../site.config';
import {
  fetchShowcaseIssues,
  fetchIssueReactions,
  calculatePopularityScore,
  parseShowcaseIssueBody,
  parseGitHubRepo,
} from './ingest-configs';

interface DiscussionNode {
  title: string;
  url: string;
  reactions: {
    totalCount: number;
  };
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'src/generated');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, 'votes.json');

  const token = process.env.GITHUB_TOKEN;
  if (!token || REPO_OWNER === 'CHANGE_ME') {
    console.log('ℹ GITHUB_TOKEN not provided or REPO_OWNER unset. Using empty fallback votes.json.');
    if (!fs.existsSync(outFile)) {
      fs.writeFileSync(outFile, JSON.stringify({}, null, 2), 'utf-8');
    }
    return;
  }

  const owner = process.env.REPO_OWNER || REPO_OWNER;
  const repo = process.env.REPO_NAME || REPO_NAME;

  console.log(`Fetching votes for ${owner}/${repo} (Category: ${VOTES_CATEGORY})...`);

  const votesMap: Record<string, { votes: number; discussionUrl: string }> = {};

  // 1. Fetch from GitHub Discussions GraphQL
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        discussions(first: 100) {
          nodes {
            title
            url
            reactions(content: THUMBS_UP) {
              totalCount
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': '0xTsoa-Vote-Sync/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { owner, repo },
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as any;
      const nodes: DiscussionNode[] = json?.data?.repository?.discussions?.nodes ?? [];
      for (const node of nodes) {
        const match = node.title.match(/^\[0xTsoa\]\s+([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/);
        if (match) {
          const configId = match[1];
          votesMap[configId] = {
            votes: node.reactions.totalCount,
            discussionUrl: node.url,
          };
        }
      }
    } else {
      console.warn(`GitHub Discussions GraphQL API returned ${res.status}: ${res.statusText}`);
    }
  } catch (err) {
    console.warn('Failed to fetch votes from GitHub GraphQL API:', err);
  }

  // 2. Fetch from GitHub Issues Reactions (label: showcase-submission)
  try {
    console.log(`Scanning showcase submission issues in ${owner}/${repo} for reactions...`);
    const issues = await fetchShowcaseIssues(owner, repo, token);
    for (const issue of issues) {
      const metadata = parseShowcaseIssueBody(issue.body || '');
      const reactions = await fetchIssueReactions(owner, repo, issue.number, token);
      const score = calculatePopularityScore(reactions);

      let targetId = '';
      if (metadata.repoUrl) {
        try {
          const parsed = parseGitHubRepo(metadata.repoUrl);
          targetId = `${parsed.owner}/${parsed.repo}`;
        } catch {}
      }
      if (!targetId && metadata.projectName) {
        targetId = `${metadata.authorGithub || 'community'}/${metadata.projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
      }

      if (targetId) {
        const existing = votesMap[targetId];
        votesMap[targetId] = {
          votes: (existing?.votes || 0) + score,
          discussionUrl: existing?.discussionUrl || `https://github.com/${owner}/${repo}/issues/${issue.number}`,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to fetch showcase issues reactions:', err);
  }

  fs.writeFileSync(outFile, JSON.stringify(votesMap, null, 2), 'utf-8');
  console.log(`✓ Synchronized ${Object.keys(votesMap).length} vote counters to ${outFile}`);

  // 3. Update featured.json if top voted items exist
  const sortedIds = Object.entries(votesMap)
    .sort(([, a], [, b]) => b.votes - a.votes)
    .map(([id]) => id)
    .slice(0, 5);

  if (sortedIds.length > 0) {
    const featuredPath = path.resolve(process.cwd(), 'featured.json');
    try {
      fs.writeFileSync(featuredPath, JSON.stringify({ pinned: sortedIds }, null, 2), 'utf-8');
      console.log(`✓ Synchronized top ${sortedIds.length} setups to featured.json`);
    } catch {}
  }
}

main().catch(console.error);

