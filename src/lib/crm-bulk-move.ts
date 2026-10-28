/** Limit concurrent requests and report each result so retries only include failures. */
export async function moveLeadBatch(
  ids: string[],
  move: (id: string) => Promise<unknown>,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const queue = [...new Set(ids)];
  const succeeded: string[] = [];
  const failed: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (next < queue.length) {
      const id = queue[next++];
      try { await move(id); succeeded.push(id); }
      catch { failed.push(id); }
    }
  }));
  return { succeeded, failed };
}
