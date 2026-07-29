export interface OrderedPrefetcher<T> {
  take(index: number): Promise<T>;
}

export function createOrderedPrefetcher<TInput, TOutput>(
  inputs: readonly TInput[],
  load: (input: TInput, index: number) => Promise<TOutput>,
  windowSize = 3
): OrderedPrefetcher<TOutput> {
  const pending = new Map<number, Promise<TOutput>>();
  const limit = Math.max(1, Math.floor(windowSize));
  let nextIndex = 0;

  const fill = (): void => {
    while (nextIndex < inputs.length && pending.size < limit) {
      const index = nextIndex;
      const input = inputs[index]!;
      nextIndex += 1;
      pending.set(index, Promise.resolve().then(() => load(input, index)));
    }
  };

  fill();

  return {
    async take(index: number): Promise<TOutput> {
      const value = pending.get(index);
      if (!value) throw new Error(`Prefetch item ${index} is unavailable.`);
      try {
        return await value;
      } finally {
        pending.delete(index);
        fill();
      }
    }
  };
}
