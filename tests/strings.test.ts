import { describe, it, expect } from 'vitest';
import { stripLeadingSlashes, stripTrailingSlashes } from '../src/lib/strings';

describe('slash trimming', () => {
  it('strips leading/trailing slashes and stays linear on long slash runs', () => {
    expect(stripTrailingSlashes('https://github.com/a/b///')).toBe('https://github.com/a/b');
    expect(stripLeadingSlashes('//a/b/')).toBe('a/b/');
    const evil = '/'.repeat(200_000) + 'x';
    const t = performance.now();
    expect(stripTrailingSlashes(evil)).toBe(evil);
    expect(performance.now() - t).toBeLessThan(50);
  });
});
