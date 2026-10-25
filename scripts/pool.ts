/**
 * Runs `fn` over `items` with at most `limit` calls in flight, and returns the results in input
 * order. For network work that must stay polite: GitHub's secondary rate limits ask for serial
 * writes (limit 1), and a few parallel git fetches are faster than one at a time without
 * starting one process per entry.
 */
export async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    const i = next++;
    if (i >= items.length) return;
    results[i] = await fn(items[i], i);
    return worker();
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
