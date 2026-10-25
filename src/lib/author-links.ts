import { REPO_URL, SITE_URL, withBase } from '../../site.config';

/** Absolute URL of a config page: the badge links here, so it must be the canonical host. */
export function configPageUrl(id: string): string {
  return `${SITE_URL}${withBase(`/configs/${id}/`)}`;
}

export const BADGE_URL = `${SITE_URL}${withBase('/badge.svg')}`;

/** README snippet offered to the author: the "indexed on 0xTsoa" badge linking to their entry. */
export function badgeMarkdown(id: string): string {
  return `[![Indexed on 0xTsoa](${BADGE_URL})](${configPageUrl(id)})`;
}

export type EntryChange = 'edit' | 'remove';

const CHANGE_TITLE: Record<EntryChange, string> = { edit: 'Edit', remove: 'Removal' };

/** The entry-change issue form, prefilled with the entry id and a title naming the request. */
export function entryChangeUrl(id: string, kind: EntryChange): string {
  const params = new URLSearchParams({
    template: 'entry-change.yml',
    title: `[${CHANGE_TITLE[kind]}]: ${id}`,
    entry: id,
  });
  return `${REPO_URL}/issues/new?${params}`;
}

/** The claim form (`claim-entry.yml`), prefilled with the entry id; checked by scripts/claim-entry.ts. */
export function claimEntryUrl(id: string): string {
  const params = new URLSearchParams({ template: 'claim-entry.yml', title: `[Claim]: ${id}`, entry: id });
  return `${REPO_URL}/issues/new?${params}`;
}

/** Link to the claim issue that verified an entry. */
export function claimIssueUrl(issue: number): string {
  return `${REPO_URL}/issues/${issue}`;
}
