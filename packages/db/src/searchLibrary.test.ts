import { captureAnchor } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, createSideNote } from './markups';
import { appendMemoUpdate, createMemo } from './memos';
import { searchLibrary } from './search';
import { createTag, tagEntity } from './tags';

let lib: Library;
let articleId: string;
let markupId: string;
let noteId: string;
let memoId: string;

beforeEach(async () => {
  let t = 1000;
  lib = await Library.open(createNodeDriver(), { now: () => t++ });
  const created = await createArticle(lib, {
    title: '春',
    importKind: 'paste',
    blocks: [{ k: 'p', runs: [{ t: '春风又绿江南岸。他用比喻写春天。' }] }],
  });
  articleId = created.articleId;
  const text = (await getArticle(lib, articleId))!.text;
  ({ markupId } = await createMarkup(lib, {
    articleId,
    revisionId: created.revisionId,
    anchor: captureAnchor(text, 10, 12),
    style: 'highlight',
  }));
  noteId = await createSideNote(lib, { markupId, articleId, body: '这个比喻很妙' });
  memoId = await createMemo(lib, { title: '比喻札记', homeArticleId: articleId });
  await appendMemoUpdate(lib, memoId, Uint8Array.from([1]), { text: '论比喻', links: [] });
});

describe('searchLibrary', () => {
  it('returns every matching item with the text to show for it', async () => {
    const results = await searchLibrary(lib, { text: '比喻' });
    const byType = Object.fromEntries(results.map((r) => [r.entityType, r]));
    expect(results).toHaveLength(4);
    expect(byType.article).toMatchObject({ entityId: articleId, title: '春', articleTitle: '春', text: '春风又绿江南岸。他用比喻写春天。' });
    expect(byType.markup).toMatchObject({ entityId: markupId, articleId, title: '', articleTitle: '春', text: '比喻' });
    expect(byType.side_note).toMatchObject({ entityId: noteId, articleId, title: '', articleTitle: '春', text: '这个比喻很妙' });
    expect(byType.memo).toMatchObject({ entityId: memoId, articleId: null, title: '比喻札记', articleTitle: null, text: '论比喻' });
  });

  it('filters by type and by tag', async () => {
    const tag = await createTag(lib, { name: '修辞' });
    await tagEntity(lib, { tagId: tag, entityType: 'side_note', entityId: noteId, articleId });
    expect((await searchLibrary(lib, { text: '比喻', types: ['markup'] })).map((r) => r.entityId)).toEqual([markupId]);
    expect((await searchLibrary(lib, { tagIds: [tag] })).map((r) => r.entityId)).toEqual([noteId]);
  });

  it('treats search syntax in the query as plain text (Review Focus 1)', async () => {
    await expect(searchLibrary(lib, { text: '") OR * NEAR(' })).resolves.toEqual([]);
    await expect(searchLibrary(lib, { text: '   ' })).resolves.toEqual([]);
    expect((await searchLibrary(lib, { text: '"比喻"', types: ['markup'] })).map((r) => r.entityId)).toEqual([markupId]);
  });
});
