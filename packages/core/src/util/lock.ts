export interface Lock {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/** Async mutex: sections run one after another, in call order, even if one throws. */
export function createLock(): Lock {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const result = tail.then(() => fn());
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
