/** Removes every trailing `/` in linear time (a `/\/+$/` regex backtracks on long slash runs). */
export function stripTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

/** Removes every leading `/` in linear time. */
export function stripLeadingSlashes(s: string): string {
  let start = 0;
  while (start < s.length && s[start] === '/') start++;
  return s.slice(start);
}
