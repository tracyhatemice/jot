import { appendMemoUpdate, compactMemo, getMemoState, type Library } from '@jot/db';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import type { MemoJournal } from './journal';
import { memoDerived } from './memoDerived';

/** Origin of updates applied while loading: never saved again and outside the editor's undo history. */
export const LOAD_ORIGIN = Symbol('jot-memo-load');

/** A memo whose load applies this many stored updates gets a compacted snapshot. */
const COMPACT_AFTER = 50;

/**
 * Rebuilds a memo from its snapshot and stored updates, then from edits a previous session journaled
 * but did not save (which are stored now; applying an update twice is harmless).
 */
export async function openMemoDoc(lib: Library, memoId: string, journal?: MemoJournal): Promise<Y.Doc> {
  const state = await getMemoState(lib, memoId);
  const doc = new Y.Doc();
  if (state.snapshot) Y.applyUpdate(doc, state.snapshot, LOAD_ORIGIN);
  for (const update of state.updates) Y.applyUpdate(doc, update.data, LOAD_ORIGIN);
  if (state.updates.length >= COMPACT_AFTER) {
    await compactMemo(lib, memoId, Y.encodeStateAsUpdate(doc), state.updates[state.updates.length - 1].hlc);
  }
  const unsaved = journal?.read(memoId);
  if (journal && unsaved) {
    Y.applyUpdate(doc, unsaved, LOAD_ORIGIN);
    await appendMemoUpdate(lib, memoId, unsaved, memoDerived(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default'))));
    journal.clear(memoId);
  }
  return doc;
}
