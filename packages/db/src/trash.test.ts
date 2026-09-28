import { captureAnchor, type Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle, listArticles } from './articles';
import { restoreRows } from './exchange';
import { Library } from './library';
import { createMarkup, createSideNote, deleteMarkup, listMarkups } from './markups';
import { createMemo, deleteMemo } from './memos';
import { search } from './search';
import { addParent, createTag, deleteTag, listEdges, listTags, tagEntity, tagsOf } from './tags';
import { countTrash, listTrash, trashEntryRows } from './trash';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
let tick = 1000;
const open = () => Library.open(createNodeDriver(), { now: () => tick++ });

/** An article with a highlight (with a tagged side note) and an underline, and a two-level tag. */
async function sample() {
  const lib = await open();
  const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。明月何时照我还。') });
  const text = (await getArticle(lib, articleId))!.text;
  const kept = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
  const noteId = await createSideNote(lib, { markupId: kept.markupId, articleId, body: '以景起兴' });
  const early = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10), style: 'underline' });
  const parent = await createTag(lib, { name: '技巧' });
  const child = await createTag(lib, { name: '修辞' });
  await addParent(lib, child, parent);
  await tagEntity(lib, { tagId: child, entityType: 'side_note', entityId: noteId, articleId });
  return { lib, articleId, revisionId, text, noteId, kept: kept.markupId, early: early.markupId, parent, child };
}

describe('the Trash', () => {
  it('lists a deleted article with what comes back with it; a markup removed before it is not part of it', async () => {
    const { lib, articleId, early } = await sample();
    await deleteMarkup(lib, early);
    await deleteArticle(lib, articleId);
    expect(await listTrash(lib)).toEqual([
      expect.objectContaining({ kind: 'article', id: articleId, title: '春', markups: 1, sideNotes: 1, taggings: 0 }),
    ]);
    expect(await countTrash(lib)).toBe(1);
  });

  it('restoring an article brings back what was deleted with it, not a markup removed before (Review Focus 1)', async () => {
    const { lib, articleId, kept, early } = await sample();
    await deleteMarkup(lib, early);
    await deleteArticle(lib, articleId);
    await restoreRows(lib, await trashEntryRows(lib, 'article', articleId));
    expect((await listArticles(lib)).map((a) => a.id)).toEqual([articleId]);
    expect((await listMarkups(lib, articleId)).map((m) => m.id)).toEqual([kept]);
    expect((await search(lib.driver, { text: '起兴' })).map((h) => h.entityType)).toEqual(['side_note']);
    expect(await listTrash(lib)).toEqual([]);
  });

  it('restoring a tag brings back its place in the tree and its taggings', async () => {
    const { lib, noteId, parent, child } = await sample();
    await deleteTag(lib, child);
    expect(await listTrash(lib)).toEqual([expect.objectContaining({ kind: 'tag', id: child, title: '修辞', taggings: 1 })]);
    await restoreRows(lib, await trashEntryRows(lib, 'tag', child));
    expect((await listEdges(lib)).map((e) => [e.parent_id, e.child_id])).toEqual([[parent, child]]);
    expect(await tagsOf(lib, 'side_note', noteId)).toEqual([child]);
  });

  it('lists deleted memos too, newest deletion first', async () => {
    const { lib, articleId } = await sample();
    const first = await createMemo(lib, { title: '甲', homeArticleId: articleId });
    const last = await createMemo(lib, { title: '乙', homeArticleId: null });
    await deleteMemo(lib, first);
    await deleteArticle(lib, articleId);
    await deleteMemo(lib, last);
    expect((await listTrash(lib)).map((e) => [e.kind, e.id])).toEqual([
      ['memo', last],
      ['article', articleId],
      ['memo', first],
    ]);
    expect(await trashEntryRows(lib, 'memo', 'no-such-memo')).toEqual([]);
  });

  it('a restored tag whose name is taken merges into the other one and leaves nothing in the Trash (Review Focus 3)', async () => {
    const { lib, child } = await sample();
    await deleteTag(lib, child);
    await createTag(lib, { name: '修辞' });
    await restoreRows(lib, await trashEntryRows(lib, 'tag', child));
    expect((await listTags(lib)).filter((t) => t.name === '修辞')).toHaveLength(1);
    expect(await listTrash(lib)).toEqual([]);
  });
});
