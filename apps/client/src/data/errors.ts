type ErrorListener = (error: Error) => void;

const listeners = new Set<ErrorListener>();

/** Surfaces a failed action (usually a library write) to the user via <ErrorBanner>. */
export function reportError(error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(err);
  for (const listener of listeners) listener(err);
}

export function onError(listener: ErrorListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
