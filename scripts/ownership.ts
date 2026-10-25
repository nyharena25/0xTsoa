/**
 * Who may speak for a project: the GitHub account that owns its repository, or a *public* member of
 * the organization that owns it. The issue opener's login is authenticated by GitHub, so comparing
 * it with the repository owner is a real check, unlike any box ticked in a form. Used by the claim
 * bot, the submission bot and the edit/removal check. Repositories on GitLab or Codeberg cannot be
 * checked this way and are left to a maintainer.
 */

import { githubOwner } from '../src/lib/author-links';

export { githubOwner } from '../src/lib/author-links';

export type PublicMemberCheck = (org: string, user: string) => Promise<boolean>;

/** GET /orgs/{org}/public_members/{user}: 204 = public member, 404 = not one (or not an org). */
export async function githubPublicMember(org: string, user: string, token?: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/public_members/${encodeURIComponent(user)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': '0xTsoa-Ownership/1.0',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 204) return true;
  if (res.status === 404 || res.status === 302) return false;
  throw new Error(`GitHub API returned ${res.status} ${res.statusText} for the ${org} membership check`);
}

/** The membership check the bots use, with the workflow's token when there is one. */
export const publicMemberFromEnv: PublicMemberCheck = (org, user) => githubPublicMember(org, user, process.env.GITHUB_TOKEN);

export interface Ownership {
  owns: boolean;
  /** One sentence for the issue comment. */
  reason: string;
}

/** Whether `user` may speak for the repository at `repoUrl`. */
export async function checkOwnership(repoUrl: string, user: string, isPublicMember: PublicMemberCheck): Promise<Ownership> {
  const owner = githubOwner(repoUrl);
  if (!owner) {
    return { owns: false, reason: `The repository is not on GitHub (${repoUrl}), so ownership cannot be checked automatically.` };
  }
  if (owner.toLowerCase() === user.toLowerCase()) return { owns: true, reason: `@${user} owns ${repoUrl}.` };
  if (await isPublicMember(owner, user)) {
    return { owns: true, reason: `@${user} is a public member of the ${owner} organization, which owns ${repoUrl}.` };
  }
  return { owns: false, reason: `@${user} does not own ${repoUrl} and is not a public member of ${owner}.` };
}
