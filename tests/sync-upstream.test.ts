import { describe, it, expect } from 'vitest';
import { latestVersionTag } from '../scripts/sync-upstream';

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
