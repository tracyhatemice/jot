import { base64ToBytes, bytesToBase64 } from '@jot/core';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Unsaved memo edits, written synchronously as they happen. Saving to the library is asynchronous and
 * cannot finish while a page unloads, so text typed just before a reload or close is recovered from here.
 */
export interface MemoJournal {
  read(memoId: string): Uint8Array | null;
  write(memoId: string, update: Uint8Array): void;
  clear(memoId: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A journal in localStorage, scoped to one library (by its device id). Without storage it keeps nothing. */
export function storageJournal(scope: string, storage: KeyValueStorage | null = defaultStorage()): MemoJournal {
  const key = (memoId: string) => `jot.memoJournal.${scope}.${memoId}`;
  return {
    read(memoId) {
      try {
        const value = storage?.getItem(key(memoId));
        return value ? base64ToBytes(value) : null;
      } catch {
        return null;
      }
    },
    write(memoId, update) {
      try {
        storage?.setItem(key(memoId), bytesToBase64(update));
      } catch {
        // Storage full or blocked: the regular save still runs.
      }
    },
    clear(memoId) {
      try {
        storage?.removeItem(key(memoId));
      } catch {
        // Nothing to clear.
      }
    },
  };
}
