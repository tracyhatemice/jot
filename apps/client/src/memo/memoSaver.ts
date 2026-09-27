import * as Y from 'yjs';
import type { MemoJournal } from './journal';
import { LOAD_ORIGIN } from './openMemoDoc';

export interface MemoSaverOptions {
  memoId: string;
  /** Stores one merged update (with the memo's derived data). */
  save(update: Uint8Array): Promise<void>;
  /** Keeps unsaved edits across a reload or close. */
  journal: MemoJournal;
  /** Typing pauses this long before a save. */
  delayMs: number;
  onError(error: unknown): void;
}

export interface MemoSaver {
  /** Saves every edit not saved yet. */
  flush(): Promise<void>;
  /** Stops listening and saves what is left. */
  dispose(): Promise<void>;
}

/**
 * Batches a memo's local Yjs updates and saves them after a pause in typing, one save at a time.
 * A failed update goes back to the front of the queue: later updates build on it, so it must be stored
 * with them. Until an edit is saved it is also kept in the journal.
 */
export function createMemoSaver(doc: Y.Doc, { memoId, save, journal, delayMs, onError }: MemoSaverOptions): MemoSaver {
  const pending: Uint8Array[] = [];
  let saving: Uint8Array | null = null;
  let chain = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const journalUnsaved = () => {
    const unsaved = saving ? [saving, ...pending] : pending;
    if (unsaved.length === 0) journal.clear(memoId);
    else journal.write(memoId, Y.mergeUpdates(unsaved));
  };

  const saveNext = async () => {
    if (pending.length === 0) return;
    const update = Y.mergeUpdates(pending.splice(0));
    saving = update;
    try {
      await save(update);
    } catch (error) {
      pending.unshift(update);
      onError(error);
    } finally {
      saving = null;
      journalUnsaved();
    }
  };

  const flush = (): Promise<void> => {
    clearTimeout(timer);
    chain = chain.then(saveNext);
    return chain;
  };

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === LOAD_ORIGIN) return;
    pending.push(update);
    journalUnsaved();
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  };
  doc.on('update', onUpdate);

  return {
    flush,
    dispose() {
      doc.off('update', onUpdate);
      return flush();
    },
  };
}
