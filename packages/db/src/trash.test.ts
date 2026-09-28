import { captureAnchor, type Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle, listArticles } from './articles';
import { decodeExport, encodeExport, exportLibrary, importLibrary, restoreRows } from './exchange';
import { Library } from './library';
import { createMarkup, createSideNote, deleteMarkup, listMarkups } from './markups';
import { appendMemoUpdate, createMemo, deleteMemo } from './memos';
import { search } from './search';
import { addParent, createTag, deleteTag, listEdges, listTags, tagEntity, tagsOf } from './tags';
import { eraseTrashEntries, listTrash, trashEntryRows } from './trash';

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
    expect(await listTrash(lib)).toHaveLength(1);
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

describe('Delete forever', () => {
  it('erases an article with everything that belongs to it, leaving bare markers', async () => {
    const { lib, articleId, early } = await sample();
    await deleteMarkup(lib, early);
    await deleteArticle(lib, articleId);
    await eraseTrashEntries(lib, [{ kind: 'article', id: articleId }]);
    expect(await listTrash(lib)).toEqual([]);
    expect(await lib.driver.query('SELECT title, author, source, deleted FROM article WHERE id = ?', [articleId])).toEqual([
      { title: '', author: null, source: null, deleted: 2 },
    ]);
    const left = (sql: string) => lib.driver.query(sql, [articleId]);
    expect(await left('SELECT id FROM article_revision WHERE article_id = ?')).toEqual([]);
    expect(await left("SELECT id FROM anchor WHERE article_id = ? AND (exact <> '' OR prefix <> '' OR suffix <> '' OR deleted <> 2)")).toEqual([]);
    expect(await left('SELECT id FROM markup WHERE article_id = ? AND deleted <> 2')).toEqual([]);
    expect(await left("SELECT id FROM side_note WHERE article_id = ? AND (body <> '' OR deleted <> 2)")).toEqual([]);
    expect(await left('SELECT id FROM tagging WHERE article_id = ? AND deleted <> 2')).toEqual([]);
  });

  it('only erases entries that are in the Trash', async () => {
    const { lib, articleId } = await sample();
    await eraseTrashEntries(lib, [{ kind: 'article', id: articleId }]);
    expect((await listArticles(lib)).map((a) => a.id)).toEqual([articleId]);
  });

  it('Empty Trash erases every entry: a memo loses its writing, a tag its name', async () => {
    const { lib, articleId, child } = await sample();
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, Uint8Array.from([1, 2]), { text: '论比喻', links: [] });
    await deleteMemo(lib, memoId);
    await deleteTag(lib, child);
    await deleteArticle(lib, articleId);
    await eraseTrashEntries(lib, await listTrash(lib));
    expect(await listTrash(lib)).toEqual([]);
    expect(await lib.driver.query('SELECT title, deleted FROM memo WHERE id = ?', [memoId])).toEqual([{ title: '', deleted: 2 }]);
    expect(await lib.driver.query('SELECT id FROM memo_update WHERE memo_id = ?', [memoId])).toEqual([]);
    expect(await lib.driver.query('SELECT memo_id FROM memo_cache WHERE memo_id = ?', [memoId])).toEqual([]);
    expect(await lib.driver.query('SELECT name, deleted FROM tag WHERE id = ?', [child])).toEqual([{ name: '', deleted: 2 }]);
    expect(await search(lib.driver, { text: '比喻' })).toEqual([]);
  });

  it('an older backup brings no erased content back, and offers nothing to restore (Review Focus 2)', async () => {
    const { lib, articleId } = await sample();
    const file = decodeExport(encodeExport(await exportLibrary(lib)));
    await deleteArticle(lib, articleId);
    await eraseTrashEntries(lib, [{ kind: 'article', id: articleId }]);
    const result = await importLibrary(lib, file);
    expect(result.deletedHereRows).toEqual([]);
    expect(result.changed).toEqual({ articles: 0, markups: 0, sideNotes: 0, memos: 0, tags: 0 });
    expect(await lib.driver.query('SELECT id FROM article_revision WHERE article_id = ?', [articleId])).toEqual([]);
    expect(await search(lib.driver, { text: '比喻' })).toEqual([]);
    expect(await listTrash(lib)).toEqual([]);
  });
});

describe('erased content and other libraries', () => {
  it('a file from another library brings no content back into an erased article (Review Focus 2)', async () => {
    const a = await open();
    const { articleId, revisionId } = await createArticle(a, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。') });
    const b = await open();
    await importLibrary(b, decodeExport(encodeExport(await exportLibrary(a))));
    const text = (await getArticle(b, articleId))!.text;
    const { markupId } = await createMarkup(b, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
    await createSideNote(b, { markupId, articleId, body: '机密旁注' });
    const fromB = decodeExport(encodeExport(await exportLibrary(b)));

    await deleteArticle(a, articleId);
    await eraseTrashEntries(a, [{ kind: 'article', id: articleId }]);
    const result = await importLibrary(a, fromB);
    const left = (sql: string) => a.driver.query(sql, [articleId]);
    expect(await left("SELECT id FROM side_note WHERE article_id = ? AND (body <> '' OR deleted <> 2)")).toEqual([]);
    expect(await left("SELECT id FROM anchor WHERE article_id = ? AND (exact <> '' OR prefix <> '' OR suffix <> '' OR deleted <> 2)")).toEqual([]);
    expect(await left('SELECT id FROM markup WHERE article_id = ? AND deleted <> 2')).toEqual([]);
    expect(result.changed).toEqual({ articles: 0, markups: 0, sideNotes: 0, memos: 0, tags: 0 });
    expect(await listTrash(a)).toEqual([]);
  });

  it('a file from another library brings no taggings back onto an erased tag', async () => {
    const a = await open();
    const tag = await createTag(a, { name: '修辞' });
    const b = await open();
    await importLibrary(b, decodeExport(encodeExport(await exportLibrary(a))));
    const { articleId } = await createArticle(b, { title: '秋', importKind: 'paste', blocks: paras('秋水') });
    await tagEntity(b, { tagId: tag, entityType: 'article', entityId: articleId, articleId });
    const fromB = decodeExport(encodeExport(await exportLibrary(b)));

    await deleteTag(a, tag);
    await eraseTrashEntries(a, [{ kind: 'tag', id: tag }]);
    await importLibrary(a, fromB);
    expect(await a.driver.query('SELECT id FROM tagging WHERE tag_id = ? AND deleted <> 2', [tag])).toEqual([]);
  });
});
