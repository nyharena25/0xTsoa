import fs from 'node:fs';
import path from 'node:path';
import { REPO_OWNER, REPO_NAME, VOTE_LABEL, voteIssueTitle, SITE_URL, withBase } from '../site.config';
import { listVoteIssues } from '../src/lib/votes';

/** Ensures every configs/<author>/<slug>.json has one open GitHub issue that collects its votes. */
async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('ℹ GITHUB_TOKEN not provided. Skipping ensure-vote-issues.');
    return;
  }
  const owner = process.env.REPO_OWNER || REPO_OWNER;
  const repo = process.env.REPO_NAME || REPO_NAME;
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': '0xTsoa-Vote-Issues/1.0',
    'Content-Type': 'application/json',
  };

  const configsDir = path.resolve(process.cwd(), 'configs');
  const configIds = fs
    .readdirSync(configsDir)
    .filter((a) => fs.statSync(path.join(configsDir, a)).isDirectory())
    .flatMap((a) =>
      fs.readdirSync(path.join(configsDir, a))
        .filter((f) => f.endsWith('.json'))
        .map((f) => `${a}/${f.replace(/\.json$/, '')}`),
    );

  // Throws on API failure: never create issues from an incomplete listing.
  const existing = new Set((await listVoteIssues(owner, repo, token)).map((i) => i.title.trim()));
  const missing = configIds.filter((id) => !existing.has(voteIssueTitle(id)));
  console.log(`${configIds.length} configs, ${missing.length} without a vote issue.`);
  if (missing.length === 0) return;

  // Create the label explicitly (422 = already exists).
  const labelRes = await fetch(`${api}/labels`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: VOTE_LABEL, color: '18181b', description: 'Community sign-off for a configuration' }),
  });
  if (!labelRes.ok && labelRes.status !== 422) throw new Error(`Cannot create label: ${labelRes.status}`);

  for (const id of missing) {
    const configPath = withBase(`/configs/${id}/`);
    const configUrl = `${SITE_URL}${configPath}`;
    const body =
      `### Community sign-off for \`${id}\`\n\n` +
      `- 📋 **Config page:** ${configUrl}\n` +
      `- ✓ **To sign off:** react to this message with 👍, ❤️ or 🎉.\n\n` +
      `Votes are counted at every site rebuild. Please keep comments on-topic (feedback about this setup).`;
    const res = await fetch(`${api}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: voteIssueTitle(id), body, labels: [VOTE_LABEL] }),
    });
    console.log(res.ok ? `✓ Vote issue created for ${id}` : `✖ Failed for ${id}: ${res.status} ${await res.text()}`);
  }
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
