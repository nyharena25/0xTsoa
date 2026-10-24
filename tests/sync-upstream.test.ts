import { describe, it, expect } from 'vitest';
import {
  latestVersionTag,
  versionTagAtRef,
  buildCompareUrl,
  formatSyncSummary,
  repoStatsFromApi,
} from '../scripts/sync-upstream';

describe('latestVersionTag', () => {
  it('picks the highest version numerically, not lexically', () => {
    expect(latestVersionTag(['v1.9.2', 'v1.10.0', 'v1.2'])).toBe('v1.10.0');
    expect(latestVersionTag(['0.45.0', '0.5.0'])).toBe('0.45.0');
  });

  it('ignores pre-releases and non-version tags', () => {
    expect(latestVersionTag(['v2.0.0-rc1', 'nightly', 'v1.4.0'])).toBe('v1.4.0');
    expect(latestVersionTag(['latest', 'catppuccin-v2'])).toBeUndefined();
    expect(latestVersionTag([])).toBeUndefined();
  });
});

describe('versionTagAtRef', () => {
  const TARGET_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const OTHER_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const TAG_OBJ_SHA = 'cccccccccccccccccccccccccccccccccccccccc';

  it('matches an annotated tag via its peeled ^{} commit SHA instead of the tag object SHA', () => {
    const lsRemote = [
      `${TAG_OBJ_SHA}\trefs/tags/v1.2.0`,
      `${TARGET_SHA}\trefs/tags/v1.2.0^{}`,
      `${OTHER_SHA}\trefs/tags/v1.3.0`,
    ].join('\n');

    expect(versionTagAtRef(lsRemote, TARGET_SHA)).toBe('v1.2.0');
    // Tag object SHA itself must not match once peeled ^{} line is present
    expect(versionTagAtRef(lsRemote, TAG_OBJ_SHA)).toBeUndefined();
  });

  it('matches a lightweight tag when no ^{} line exists and picks highest version when multiple tags share the commit', () => {
    const lsRemote = [
      `${TARGET_SHA}\trefs/tags/v1.2.0`,
      `${TARGET_SHA}\trefs/tags/v1.10.0`,
      `${TARGET_SHA}\trefs/tags/v2.0.0-beta1`,
      `${OTHER_SHA}\trefs/tags/v3.0.0`,
    ].join('\n');

    expect(versionTagAtRef(lsRemote, TARGET_SHA)).toBe('v1.10.0');
  });

  it('returns undefined when no version-like tag points at the ref', () => {
    const lsRemote = [
      `${OTHER_SHA}\trefs/tags/v2.1.0`,
      `${TARGET_SHA}\trefs/tags/nightly`,
    ].join('\n');

    expect(versionTagAtRef(lsRemote, TARGET_SHA)).toBeUndefined();
  });
});

describe('buildCompareUrl and formatSyncSummary', () => {
  it('formats compare URLs for GitHub, GitLab, and Codeberg', () => {
    const oldRef = '1111111111111111111111111111111111111111';
    const newRef = '2222222222222222222222222222222222222222';

    expect(buildCompareUrl('https://github.com/owner/repo', oldRef, newRef)).toBe(
      `https://github.com/owner/repo/compare/${oldRef}...${newRef}`,
    );
    expect(buildCompareUrl('https://gitlab.com/owner/repo', oldRef, newRef)).toBe(
      `https://gitlab.com/owner/repo/-/compare/${oldRef}...${newRef}`,
    );
    expect(buildCompareUrl('https://codeberg.org/owner/repo', oldRef, newRef)).toBe(
      `https://codeberg.org/owner/repo/compare/${oldRef}...${newRef}`,
    );
  });

  it('renders a sorted markdown summary of ref changes with compare links', () => {
    const oldRef = '1111111111111111111111111111111111111111';
    const newRef = '2222222222222222222222222222222222222222';
    const md = formatSyncSummary([
      {
        id: 'zeta/dots',
        repo: 'https://codeberg.org/zeta/dots',
        oldRef,
        newRef,
      },
      {
        id: 'alpha/bar',
        repo: 'https://github.com/alpha/bar',
        oldRef,
        newRef,
        version: 'v1.4.0',
      },
    ]);

    expect(md).toContain('**alpha/bar**');
    expect(md).toContain(`https://github.com/alpha/bar/compare/${oldRef}...${newRef}`);
    expect(md).toContain('(tag `v1.4.0`)');
    expect(md).toContain(`https://codeberg.org/zeta/dots/compare/${oldRef}...${newRef}`);
    expect(md.indexOf('alpha/bar')).toBeLessThan(md.indexOf('zeta/dots'));
  });
});

describe('repoStatsFromApi', () => {
  it('reads GitHub stars, archived flag and last push day', () => {
    expect(repoStatsFromApi({ stargazers_count: 120, archived: true, pushed_at: '2026-03-01T09:12:44Z', updated_at: '2026-10-01T00:00:00Z' }))
      .toEqual({ stars: 120, archived: true, pushedAt: '2026-03-01' });
  });

  it('reads GitLab and Codeberg field names', () => {
    expect(repoStatsFromApi({ star_count: 7, archived: false, last_activity_at: '2026-09-30T23:59:59.000Z' }))
      .toEqual({ stars: 7, archived: false, pushedAt: '2026-09-30' });
    expect(repoStatsFromApi({ stars_count: 3, archived: false, updated_at: '2025-12-24T10:00:00+01:00' }))
      .toEqual({ stars: 3, archived: false, pushedAt: '2025-12-24' });
  });

  it('keeps zero stars and skips missing or malformed fields', () => {
    expect(repoStatsFromApi({ stargazers_count: 0, pushed_at: 'yesterday' })).toEqual({ stars: 0 });
  });

  it('returns undefined without a star count (error bodies, rate limits)', () => {
    expect(repoStatsFromApi({ message: 'API rate limit exceeded' })).toBeUndefined();
  });
});
