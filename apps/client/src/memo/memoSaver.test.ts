import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { fakeStorage } from '../testing/fakeStorage';
import { storageJournal } from './journal';
import { createMemoSaver } from './memoSaver';

function setup() {
  const doc = new Y.Doc();
  const journal = storageJournal('lib', fakeStorage());
  const stored: Uint8Array[] = [];
  const errors: unknown[] = [];
  const state = { fail: false };
  const saver = createMemoSaver(doc, {
    memoId: 'm1',
    journal,
    delayMs: 60_000,
    onError: (e) => errors.push(e),
    save: async (update) => {
      if (state.fail) throw new Error('disk full');
      stored.push(update);
    },
  });
  const reload = (...extra: Uint8Array[]) => {
    const copy = new Y.Doc();
    for (const u of [...stored, ...extra]) Y.applyUpdate(copy, u);
    return copy.getText('t').toString();
  };
  return { doc, text: doc.getText('t'), stored, errors, state, saver, reload, journal };
}

describe('createMemoSaver', () => {
  it('saves edits made since the last save as one update', async () => {
    const { text, stored, saver, reload } = setup();
    text.insert(0, '先写景');
    text.insert(3, '，后抒情');
    await saver.flush();
    expect(stored).toHaveLength(1);
    expect(reload()).toBe('先写景，后抒情');
  });

  it('keeps an edit whose save failed and stores it with the next save (Review Focus 1)', async () => {
    const { text, errors, state, saver, reload } = setup();
    text.insert(0, 'first ');
    await saver.flush();
    state.fail = true;
    text.insert(text.length, 'second ');
    await saver.flush();
    expect(errors).toHaveLength(1);
    state.fail = false;
    text.insert(text.length, 'third');
    await saver.flush();
    expect(reload()).toBe('first second third');
  });

  it('journals unsaved edits as they happen and clears the journal once they are saved (Review Focus 1)', async () => {
    const { text, state, saver, reload, journal } = setup();
    text.insert(0, '刚打的字');
    const unsaved = journal.read('m1');
    expect(unsaved).not.toBeNull();
    expect(reload(unsaved!)).toBe('刚打的字');
    await saver.flush();
    expect(journal.read('m1')).toBeNull();
    state.fail = true;
    text.insert(text.length, '，没存上');
    await saver.flush();
    expect(reload(journal.read('m1')!)).toBe('刚打的字，没存上');
  });
});
