// String helpers that run in linear time where the obvious regex (`/\/+$/`, `/\s+&&\s+/`, `/<[^>]*>/g`…)
// backtracks on long runs of the repeated character.

/** Removes every trailing character found in `chars`. */
export function stripTrailingChars(s: string, chars: string): string {
  let end = s.length;
  while (end > 0 && chars.includes(s[end - 1])) end--;
  return s.slice(0, end);
}

/** Removes every leading character found in `chars`. */
export function stripLeadingChars(s: string, chars: string): string {
  let start = 0;
  while (start < s.length && chars.includes(s[start])) start++;
  return s.slice(start);
}

/** Removes every trailing `/` in linear time (a `/\/+$/` regex backtracks on long slash runs). */
export function stripTrailingSlashes(s: string): string {
  return stripTrailingChars(s, '/');
}

/** Removes every leading `/` in linear time. */
export function stripLeadingSlashes(s: string): string {
  return stripLeadingChars(s, '/');
}

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);

/** Drops a trailing shell comment: from the first `#` that follows whitespace (like `.replace(/\s+#.*$/, '')`). */
export function stripShellComment(s: string): string {
  for (let i = s.indexOf('#', 1); i !== -1; i = s.indexOf('#', i + 1)) {
    if (isSpace(s[i - 1])) return s.slice(0, i).trimEnd();
  }
  return s;
}

/**
 * Splits a command line on `&&`, trimming each part. With `spaced`, only an `&&` with whitespace on both
 * sides counts (like `split(/\s+&&\s+/)`); otherwise any `&&` does (like `split(/\s*&&\s*\/)`).
 */
export function splitOnAnd(s: string, spaced = false): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = s.indexOf('&&'); i !== -1; i = s.indexOf('&&', i + 2)) {
    if (spaced && !(isSpace(s[i - 1]) && isSpace(s[i + 2]))) continue;
    parts.push(s.slice(start, i).trim());
    start = i + 2;
  }
  parts.push(s.slice(start).trim());
  return parts;
}

/** Cuts the last word and the whitespace before it (like `.replace(/\s+\S*$/, '')`); unchanged without whitespace. */
export function dropLastWord(s: string): string {
  for (let i = s.length - 1; i >= 0; i--) {
    if (isSpace(s[i])) return s.slice(0, i).trimEnd();
  }
  return s;
}

/** Replaces every `<…>` tag with `replacement` (like `.replace(/<[^>]*>/g, replacement)`). */
export function replaceTags(html: string, replacement: string): string {
  let out = '';
  let cursor = 0;
  for (let open = html.indexOf('<'); open !== -1; open = html.indexOf('<', cursor)) {
    const close = html.indexOf('>', open + 1);
    if (close === -1) break;
    out += html.slice(cursor, open) + replacement;
    cursor = close + 1;
  }
  return out + html.slice(cursor);
}
