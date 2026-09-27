const inFlight = new Map<string, Promise<void>>();

/** Remembers a memo save, so reopening that memo (for example switching tabs quickly) waits for it. */
export function trackSave(memoId: string, save: Promise<unknown>): void {
  const all = Promise.allSettled([inFlight.get(memoId), save]).then(() => undefined);
  inFlight.set(memoId, all);
  void all.then(() => {
    if (inFlight.get(memoId) === all) inFlight.delete(memoId);
  });
}

export function whenSaved(memoId: string): Promise<void> {
  return inFlight.get(memoId) ?? Promise.resolve();
}
