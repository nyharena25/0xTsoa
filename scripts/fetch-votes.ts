import fs from 'node:fs';
import path from 'node:path';
import { REPO_OWNER, REPO_NAME, VOTE_LABEL } from '../site.config';
import { listVoteIssues, votesFromIssues, type VotesMap } from '../src/lib/votes';

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

  try {
    votesMap = votesFromIssues(await listVoteIssues(owner, repo, token));
  } catch (err) {
    console.warn('Failed to fetch vote issues:', err);
    if (fs.existsSync(outFile)) {
      console.log('ℹ Keeping existing votes.json.');
      return;
    }
  }

  fs.writeFileSync(outFile, JSON.stringify(votesMap, null, 2), 'utf-8');
  console.log(`✓ Synchronized ${Object.keys(votesMap).length} vote counters to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

