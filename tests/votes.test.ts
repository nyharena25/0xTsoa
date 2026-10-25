import { describe, it, expect } from 'vitest';
import { getDiscussionUrlForConfig, getVotesForConfig, getTop5Configs, votesFromIssues, upvoteLabel } from '../src/lib/votes';
import { REPO_URL } from '../site.config';

describe('Votes & upvote URL resolver', () => {
  it('labels counts as upvotes, singular for one', () => {
    expect(upvoteLabel(0)).toBe('0 upvotes');
    expect(upvoteLabel(1)).toBe('1 upvote');
    expect(upvoteLabel(1234)).toBe('1,234 upvotes');
  });

  it('falls back to an exact-title search on vote issues for configs not synced yet', () => {
    const url = getDiscussionUrlForConfig('custom/setup-abc');
    expect(url).not.toContain('/discussions');
    expect(url).toBe(`${REPO_URL}/issues?q=${encodeURIComponent('is:issue label:vote in:title "[0xTsoa] custom/setup-abc"')}`);
  });

  it('counts only 👍 (+1) reactions per vote issue and ignores other reactions and unrelated titles', () => {
    const map = votesFromIssues([
      { number: 1, title: '[0xTsoa] catppuccin/hyprland-theme', html_url: 'https://github.com/o/r/issues/1', reactions: { '+1': 3, heart: 1, hooray: 1, '-1': 5, laugh: 2 } },
      { number: 2, title: 'Bug: broken link', html_url: 'https://github.com/o/r/issues/2', reactions: { '+1': 9 } },
      { number: 3, title: '[0xTsoa] i3/i3-tiling', html_url: 'https://github.com/o/r/issues/3' },
    ]);
    expect(map).toEqual({
      'catppuccin/hyprland-theme': { votes: 3, discussionUrl: 'https://github.com/o/r/issues/1' },
      'i3/i3-tiling': { votes: 0, discussionUrl: 'https://github.com/o/r/issues/3' },
    });
  });

  it('correctly handles votes lookup fallback to 0 for unknown configs', () => {
    expect(getVotesForConfig('unknown/nonexistent-config')).toBe(0);
  });

  it('returns top 5 configs', () => {
    const configs = Array.from({ length: 6 }, (_, i) => ({ id: `config-${i}` }));
    expect(getTop5Configs(configs)).toHaveLength(5);
  });
});
