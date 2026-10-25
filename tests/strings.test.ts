import { describe, it, expect } from 'vitest';
import {
  dropLastWord,
  replaceTags,
  splitOnAnd,
  stripLeadingChars,
  stripLeadingSlashes,
  stripShellComment,
  stripTrailingChars,
  stripTrailingSlashes,
} from '../src/lib/strings';

/** Each helper replaces a regex that backtracks: it must give the same result, and stay fast on long runs. */
function fast(fn: () => unknown) {
  const t = performance.now();
  fn();
  expect(performance.now() - t).toBeLessThan(50);
}

describe('slash trimming', () => {
  it('strips leading/trailing slashes and stays linear on long slash runs', () => {
    expect(stripTrailingSlashes('https://github.com/a/b///')).toBe('https://github.com/a/b');
    expect(stripLeadingSlashes('//a/b/')).toBe('a/b/');
    const evil = '/'.repeat(200_000) + 'x';
    fast(() => expect(stripTrailingSlashes(evil)).toBe(evil));
  });

  it('strips any set of characters', () => {
    expect(stripTrailingChars(stripLeadingChars(`"'~/x';"`, `'"`), `'";`)).toBe('~/x');
    expect(stripTrailingChars('Done...', '.')).toBe('Done');
    expect(stripTrailingChars('...', '.')).toBe('');
  });
});

describe('shell comments', () => {
  it('matches .replace(/\\s+#.*$/, "")', () => {
    for (const s of ['foo bar # note', 'foo#bar', '#only', 'a  #  b # c', 'pkg\t# tab', 'no comment', 'x #']) {
      expect(stripShellComment(s), s).toBe(s.replace(/\s+#.*$/, ''));
    }
    fast(() => stripShellComment(' '.repeat(100_000) + 'x'));
  });
});

describe('splitting on &&', () => {
  it('matches split(/\\s*&&\\s*/) and, spaced, split(/\\s+&&\\s+/)', () => {
    for (const s of ['a && b', 'a&&b', 'cd x &&  make && make install', 'echo "a&&b"', 'single']) {
      expect(splitOnAnd(s), s).toEqual(s.split(/\s*&&\s*/).map((p) => p.trim()));
      expect(splitOnAnd(s, true), `${s} (spaced)`).toEqual(s.split(/\s+&&\s+/).map((p) => p.trim()));
    }
    fast(() => splitOnAnd(' '.repeat(100_000) + '&', true));
  });
});

describe('word and tag helpers', () => {
  it('matches .replace(/\\s+\\S*$/, "")', () => {
    for (const s of ['Hyprland Paper Minimal', 'oneword', 'trailing space ', 'a  b', '']) {
      expect(dropLastWord(s), s).toBe(s.replace(/\s+\S*$/, ''));
    }
    fast(() => dropLastWord(' '.repeat(100_000) + 'x'));
  });

  it('matches .replace(/<[^>]*>/g, " ")', () => {
    for (const s of ['<p>Hello <b>world</b></p>', 'a < b', '<a href="x">y</a> <', 'no tags', '<<b>>']) {
      expect(replaceTags(s, ' '), s).toBe(s.replace(/<[^>]*>/g, ' '));
    }
    fast(() => replaceTags('<'.repeat(100_000), ' '));
  });
});
