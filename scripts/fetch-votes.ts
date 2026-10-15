import fs from 'node:fs';
import path from 'node:path';
import { REPO_OWNER, REPO_NAME, VOTES_CATEGORY } from '../site.config';

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

  console.log(`Fetching votes for ${REPO_OWNER}/${REPO_NAME} (Category: ${VOTES_CATEGORY})...`);

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
        variables: { owner: REPO_OWNER, repo: REPO_NAME },
      }),
    });

    if (!res.ok) {
      console.warn(`GitHub API returned ${res.status}: ${res.statusText}`);
      if (!fs.existsSync(outFile)) fs.writeFileSync(outFile, JSON.stringify({}, null, 2), 'utf-8');
      return;
    }

    const json = (await res.json()) as any;
    const nodes: DiscussionNode[] = json?.data?.repository?.discussions?.nodes ?? [];

    const votesMap: Record<string, { votes: number; discussionUrl: string }> = {};

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

    fs.writeFileSync(outFile, JSON.stringify(votesMap, null, 2), 'utf-8');
    console.log(`✓ Synchronized ${Object.keys(votesMap).length} discussion vote counters to ${outFile}`);
  } catch (err) {
    console.warn('Failed to fetch votes from GitHub GraphQL API:', err);
    if (!fs.existsSync(outFile)) {
      fs.writeFileSync(outFile, JSON.stringify({}, null, 2), 'utf-8');
    }
  }
}

main().catch(console.error);
