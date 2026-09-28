import { captureAnchor, type Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, createSideNote, deleteMarkup } from './markups';
import { appendMemoUpdate, createMemo, createQuote, deleteMemo, linkTargetStatus, listAllMemos } from './memos';
import { eraseTrashEntries } from './trash';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
let tick = 1000;
const open = () => Library.open(createNodeDriver(), { now: () => tick++ });

describe('listAllMemos', () => {
  it('lists every live memo, most recently edited first, with its home article or none (Review Focus 4)', async () => {
    const lib = await open();
    const spring = (await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('春风') })).articleId;
    const autumn = (await createArticle(lib, { title: '秋', importKind: 'paste', blocks: paras('秋水') })).articleId;
    const a = await createMemo(lib, { title: '甲', homeArticleId: spring });
    const b = await createMemo(lib, { title: '乙', homeArticleId: autumn });
    const c = await createMemo(lib, { title: '丙', homeArticleId: null });
    const gone = await createMemo(lib, { title: '丁', homeArticleId: spring });
    await deleteMemo(lib, gone);
    await appendMemoUpdate(lib, a, Uint8Array.from([1]), { text: '', links: [] });
    await deleteArticle(lib, autumn);
    expect(await listAllMemos(lib)).toEqual([
      { id: a, title: '甲', homeArticleId: spring, homeTitle: '春' },
      { id: c, title: '丙', homeArticleId: null, homeTitle: null },
      { id: b, title: '乙', homeArticleId: autumn, homeTitle: null },
    ]);
  });
});

describe('linkTargetStatus', () => {
  it('tells a target in the Trash from one that is gone (Review Focus 5)', async () => {
    const lib = await open();
    const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。') });
    const text = (await getArticle(lib, articleId))!.text;
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 0, 2) });
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
    const { markupId: removed } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 5, 7), style: 'bold' });
    await deleteMarkup(lib, removed);
    expect(await linkTargetStatus(lib, 'markup', removed)).toBe('gone');

    await deleteArticle(lib, articleId);
    expect(await linkTargetStatus(lib, 'anchor', quoteId)).toBe('trash');
    expect(await linkTargetStatus(lib, 'markup', markupId)).toBe('trash');

    await eraseTrashEntries(lib, [{ kind: 'article', id: articleId }]);
    expect(await linkTargetStatus(lib, 'anchor', quoteId)).toBe('gone');
    expect(await linkTargetStatus(lib, 'anchor', 'no-such-anchor')).toBe('gone');
  });

  it('a target removed on its own before its article was deleted is gone, not in the Trash (Review Focus 5)', async () => {
    const lib = await open();
    const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。') });
    const text = (await getArticle(lib, articleId))!.text;
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
    const noteId = await createSideNote(lib, { markupId, articleId, body: '以景起兴' });
    await deleteMarkup(lib, markupId);
    await deleteArticle(lib, articleId);
    expect(await linkTargetStatus(lib, 'markup', markupId)).toBe('gone');
    expect(await linkTargetStatus(lib, 'side_note', noteId)).toBe('gone');
  });
});
