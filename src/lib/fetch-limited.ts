/**
 * Dependency-free HTTP(S) fetcher with host allowlist, manual redirect validation,
 * streaming byte limit, and total operation timeout.
 */

export const SCRIPT_HOSTS = [
  'raw.githubusercontent.com',
  'github.com',
  'objects.githubusercontent.com',
  'gitlab.com',
  'codeberg.org',
] as const;

export interface FetchLimitedOptions {
  maxBytes: number;
  timeoutMs: number;
  allowedHosts: readonly string[];
  headers?: Record<string, string>;
}

const MAX_REDIRECTS = 3;

export function isHostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  const lower = hostname.toLowerCase();
  for (const pattern of allowedHosts) {
    const p = pattern.toLowerCase();
    if (!p.includes('*')) {
      if (lower === p) return true;
    } else {
      const regexStr =
        '^' +
        p
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^.]+') +
        '$';
      if (new RegExp(regexStr).test(lower)) return true;
    }
  }
  return false;
}

function assertAllowedUrl(rawUrl: string, allowedHosts: readonly string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`URL must use https:// (got ${parsed.protocol})`);
  }
  if (!isHostAllowed(parsed.hostname, allowedHosts)) {
    throw new Error(`Host '${parsed.hostname}' is not in allowedHosts`);
  }
  return parsed;
}

export async function fetchLimited(
  url: string,
  { maxBytes, timeoutMs, allowedHosts, headers }: FetchLimitedOptions,
): Promise<{ status: number; body: Buffer }> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const abortController = new AbortController();
  const signal = AbortSignal.any([timeoutSignal, abortController.signal]);

  let currentUrl = assertAllowedUrl(url, allowedHosts).toString();
  let res: Response | undefined;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    res = await fetch(currentUrl, {
      redirect: 'manual',
      signal,
      ...(headers ? { headers } : {}),
    });

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      if (redirects === MAX_REDIRECTS) {
        throw new Error(`Too many redirects (exceeded ${MAX_REDIRECTS})`);
      }
      const location = res.headers.get('location');
      if (!location) {
        throw new Error(`Redirect HTTP ${res.status} missing Location header`);
      }
      const resolvedNext = new URL(location, currentUrl).toString();
      currentUrl = assertAllowedUrl(resolvedNext, allowedHosts).toString();
      continue;
    }

    break;
  }

  if (!res) {
    return { status: 0, body: Buffer.alloc(0) };
  }

  const status = res.status ?? (res.ok ? 200 : 500);

  if (!res.body) {
    if (typeof res.text === 'function') {
      const txt = await res.text();
      const buf = Buffer.from(txt, 'utf-8');
      if (buf.length > maxBytes) {
        throw new Error(`Response body exceeds ${maxBytes} bytes`);
      }
      return { status, body: buf };
    }
    return { status, body: Buffer.alloc(0) };
  }

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      if (timeoutSignal.aborted) {
        throw timeoutSignal.reason ?? new Error('Request timed out');
      }
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        abortController.abort();
        await reader.cancel().catch(() => {});
        throw new Error(`Response body exceeds ${maxBytes} bytes`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return { status, body: Buffer.concat(chunks, totalBytes) };
}
