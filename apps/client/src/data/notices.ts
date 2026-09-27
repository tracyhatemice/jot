type NoticeListener = (text: string) => void;

const listeners = new Set<NoticeListener>();

/** Tells the user something finished (an export saved, an import done), via <NoticeBanner>. */
export function showNotice(text: string): void {
  for (const listener of listeners) listener(text);
}

export function onNotice(listener: NoticeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
