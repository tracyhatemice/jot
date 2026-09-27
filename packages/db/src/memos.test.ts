import { captureAnchor, type Block } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, createSideNote, deleteMarkup, EmptySelectionError } from './markups';
import {
  appendMemoUpdate, compactMemo, createMemo, createQuote, deleteMemo, getMemo, getMemoState, listBacklinks, listMemos,
  renameMemo, targetRange,
} from './memos';
import { search } from './search';

let lib: Library;
let articleId: string;
let revisionId: string;
let text: string;

const blocks: Block[] = [
  { k: 'p', runs: [{ t: '他用比喻写春天。' }] },
  { k: 'p', runs: [{ t: '她笑😀了。' }] },
];

beforeEach(async () => {
  let t = 1000;
  lib = await Library.open(createNodeDriver(), { now: () => t++ });
  ({ articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks }));
  text = (await getArticle(lib, articleId))!.text;
});

const bytes = (...b: number[]) => Uint8Array.from(b);

describe('memos', () => {
  it('creates, lists, renames and finds memos by title', async () => {
    const a = await createMemo(lib, { title: '结构', homeArticleId: articleId });
    const b = await createMemo(lib, { title: '修辞', homeArticleId: articleId });
    expect((await listMemos(lib, articleId)).map((m) => m.title)).toEqual(['结构', '修辞']);
    await renameMemo(lib, a, '开头');
    expect((await getMemo(lib, a))?.title).toBe('开头');
    expect((await search(lib.driver, { text: '开头', types: ['memo'] })).map((h) => h.entityId)).toEqual([a]);
    expect(b).not.toBe(a);
  });

  it('stores updates in order with derived text for search', async () => {
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), { text: '先写景', links: [] });
    await appendMemoUpdate(lib, memoId, bytes(2), { text: '先写景，后抒情', links: [] });
    const state = await getMemoState(lib, memoId);
    expect(state.snapshot).toBeNull();
    expect(state.updates.map((u) => [...u.data])).toEqual([[1], [2]]);
    expect((await search(lib.driver, { text: '抒情' })).map((h) => h.entityId)).toEqual([memoId]);
  });

  it('only returns updates newer than a compacted snapshot', async () => {
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), { text: '', links: [] });
    const first = await getMemoState(lib, memoId);
    await compactMemo(lib, memoId, bytes(9, 9), first.updates[0].hlc);
    await appendMemoUpdate(lib, memoId, bytes(2), { text: '', links: [] });
    const state = await getMemoState(lib, memoId);
    expect([...(state.snapshot ?? [])]).toEqual([9, 9]);
    expect(state.updates.map((u) => [...u.data])).toEqual([[2]]);
  });

  it('resolves backlinks for markups, side notes and quotes, once per link even if a link id repeats (Review Focus 4)', async () => {
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
    const noteId = await createSideNote(lib, { markupId, articleId, body: '注' });
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 10, 12) });
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), {
      text: '比喻 注 她笑',
      links: [
        { nodeId: 'n1', targetType: 'markup', targetId: markupId, articleId },
        { nodeId: 'n1', targetType: 'markup', targetId: markupId, articleId },
        { nodeId: 'n2', targetType: 'side_note', targetId: noteId, articleId },
        { nodeId: 'n3', targetType: 'anchor', targetId: quoteId, articleId },
      ],
    });
    expect((await listBacklinks(lib, articleId)).map((b) => [b.targetType, b.start, b.end, b.memoTitle])).toEqual([
      ['markup', 2, 4, 'M'],
      ['side_note', 2, 4, 'M'],
      ['anchor', 10, 12, 'M'],
    ]);
  });

  it('drops backlinks and target ranges whose target is deleted (Review Focus 2)', async () => {
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'bold' });
    const memoId = await createMemo(lib, { title: 'M', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), { text: '', links: [{ nodeId: 'n1', targetType: 'markup', targetId: markupId, articleId }] });
    expect(await targetRange(lib, 'markup', markupId)).toEqual({ articleId, start: 2, end: 4, status: 'exact' });
    await deleteMarkup(lib, markupId);
    expect(await targetRange(lib, 'markup', markupId)).toBeNull();
    expect(await listBacklinks(lib, articleId)).toEqual([]);
  });

  it('resolves target ranges for quotes and side notes, and not after the article is deleted', async () => {
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 12, 14) });
    expect(await targetRange(lib, 'anchor', quoteId)).toMatchObject({ articleId, start: 12, end: 14 });
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 0, 2), style: 'underline' });
    const noteId = await createSideNote(lib, { markupId, articleId, body: 'x' });
    expect(await targetRange(lib, 'side_note', noteId)).toMatchObject({ start: 0, end: 2 });
    await deleteArticle(lib, articleId);
    expect(await targetRange(lib, 'side_note', noteId)).toBeNull();
  });

  it('refuses a whitespace-only quote', async () => {
    await expect(createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10) })).rejects.toBeInstanceOf(EmptySelectionError);
  });

  it('deleting a memo removes it from lists, search and backlinks', async () => {
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4) });
    const memoId = await createMemo(lib, { title: '要删', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, bytes(1), { text: '内容', links: [{ nodeId: 'n', targetType: 'anchor', targetId: quoteId, articleId }] });
    await deleteMemo(lib, memoId);
    expect(await listMemos(lib, articleId)).toEqual([]);
    expect(await getMemo(lib, memoId)).toBeNull();
    expect(await search(lib.driver, { text: '要删' })).toEqual([]);
    expect(await listBacklinks(lib, articleId)).toEqual([]);
  });

  it('a save that lands after the memo was deleted keeps it out of search and backlinks', async () => {
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4) });
    const memoId = await createMemo(lib, { title: '迟到', homeArticleId: articleId });
    await deleteMemo(lib, memoId);
    await appendMemoUpdate(lib, memoId, bytes(1), { text: '迟到的内容', links: [{ nodeId: 'n', targetType: 'anchor', targetId: quoteId, articleId }] });
    expect(await search(lib.driver, { text: '迟到' })).toEqual([]);
    expect(await lib.driver.query('SELECT memo_id FROM memo_link')).toEqual([]);
  });
});
