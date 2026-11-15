/** Finish every admitted task; report failure only after its peers have settled. */
export async function runBounded<T>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
) {
  let index = 0;
  const failures: unknown[] = [];
  await Promise.all(
    Array.from(
      { length: Math.min(items.length, Math.max(1, concurrency)) },
      async () => {
        for (;;) {
          const at = index++;
          if (at >= items.length) return;
          try {
            await run(items[at]);
          } catch (e) {
            failures.push(e);
          }
        }
      },
    ),
  );
  if (failures.length)
    throw new AggregateError(
      failures,
      "Background tasks require reconciliation.",
    );
}
