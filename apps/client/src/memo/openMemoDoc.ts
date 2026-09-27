import { compactMemo, getMemoState, type Library } from '@jot/db';
import * as Y from 'yjs';

/** Origin of updates applied while loading: never saved again and outside the editor's undo history. */
export const LOAD_ORIGIN = Symbol('jot-memo-load');

/** A memo whose load applies this many stored updates gets a compacted snapshot. */
const COMPACT_AFTER = 50;

export async function openMemoDoc(lib: Library, memoId: string): Promise<Y.Doc> {
  const state = await getMemoState(lib, memoId);
  const doc = new Y.Doc();
  if (state.snapshot) Y.applyUpdate(doc, state.snapshot, LOAD_ORIGIN);
  for (const update of state.updates) Y.applyUpdate(doc, update.data, LOAD_ORIGIN);
  if (state.updates.length >= COMPACT_AFTER) {
    await compactMemo(lib, memoId, Y.encodeStateAsUpdate(doc), state.updates[state.updates.length - 1].hlc);
  }
  return doc;
}
