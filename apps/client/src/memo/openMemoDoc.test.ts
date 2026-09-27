import { appendMemoUpdate, createArticle, createMemo, getMemoState, Library } from '@jot/db';
import { createNodeDriver } from '@jot/db/testing/node';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { LOAD_ORIGIN, openMemoDoc } from './openMemoDoc';

async function setup() {
  let t = 1000;
  const lib = await Library.open(createNodeDriver(), { now: () => t++ });
  const { articleId } = await createArticle(lib, { title: 'A', importKind: 'paste', blocks: [{ k: 'p', runs: [{ t: '文' }] }] });
  const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
  return { lib, memoId };
}

/** Records one stored update per edit, like the editor's save loop with a very short delay. */
async function edit(lib: Library, memoId: string, doc: Y.Doc, change: (text: Y.Text) => void) {
  const updates: Uint8Array[] = [];
  const onUpdate = (u: Uint8Array, origin: unknown) => {
    if (origin !== LOAD_ORIGIN) updates.push(u);
  };
  doc.on('update', onUpdate);
  change(doc.getText('t'));
  doc.off('update', onUpdate);
  for (const u of updates) await appendMemoUpdate(lib, memoId, u, { text: '', links: [] });
}

describe('openMemoDoc', () => {
  it('rebuilds the document from its stored updates', async () => {
    const { lib, memoId } = await setup();
    const doc = new Y.Doc();
    await edit(lib, memoId, doc, (t) => t.insert(0, '先写景'));
    await edit(lib, memoId, doc, (t) => t.insert(3, '，后抒情'));
    expect((await openMemoDoc(lib, memoId)).getText('t').toString()).toBe('先写景，后抒情');
  });

  it('compacts a long history into a snapshot and keeps later edits (Review Focus 3)', async () => {
    const { lib, memoId } = await setup();
    const doc = new Y.Doc();
    for (let i = 0; i < 60; i++) await edit(lib, memoId, doc, (t) => t.insert(t.length, String(i % 10)));
    const reopened = await openMemoDoc(lib, memoId);
    const expected = doc.getText('t').toString();
    expect(reopened.getText('t').toString()).toBe(expected);
    const state = await getMemoState(lib, memoId);
    expect(state.snapshot).not.toBeNull();
    expect(state.updates).toHaveLength(0);
    await edit(lib, memoId, reopened, (t) => t.insert(t.length, '尾'));
    expect((await openMemoDoc(lib, memoId)).getText('t').toString()).toBe(`${expected}尾`);
  });
});
