import fs from 'node:fs';
import path from 'node:path';
import { REPO_OWNER, REPO_NAME, VOTE_LABEL } from '../site.config';
import { listVoteIssues, votesFromIssues, type VotesMap } from '../src/lib/votes';
import {
  fetchShowcaseIssues,
  fetchIssueReactions,
  calculatePopularityScore,
  parseShowcaseIssueBody,
  parseGitHubRepo,
} from './ingest-configs';

async function main() {
  const outDir = path.resolve(process.cwd(), 'src/generated');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'votes.json');

  // Token optional: vote issues of a public repo are readable anonymously (Vercel builds have no token).
  const token = process.env.GITHUB_TOKEN || undefined;
  const owner = process.env.REPO_OWNER || REPO_OWNER;
  const repo = process.env.REPO_NAME || REPO_NAME;

  console.log(`Fetching votes for ${owner}/${repo} (issues labelled "${VOTE_LABEL}")...`);

  let votesMap: VotesMap = {};

  // 1. One vote issue per config (created by scripts/ensure-vote-issues.ts)
  try {
    votesMap = votesFromIssues(await listVoteIssues(owner, repo, token));
  } catch (err) {
    console.warn('Failed to fetch vote issues:', err);
    if (fs.existsSync(outFile)) {
      console.log('ℹ Keeping existing votes.json.');
      return;
    }
  }

  if (!token) {
    fs.writeFileSync(outFile, JSON.stringify(votesMap, null, 2), 'utf-8');
    console.log(`✓ Synchronized ${Object.keys(votesMap).length} vote counters (anonymous) to ${outFile}`);
    return;
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
    .filter(([, v]) => v.votes > 0)
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

