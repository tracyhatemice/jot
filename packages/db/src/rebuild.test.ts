import { captureAnchor, type Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, createSideNote, listMarkups } from './markups';
import { appendMemoUpdate, createMemo, createQuote, deleteMemo, listBacklinks, liveMemoIds, refreshMemoDerived } from './memos';
import { rebuildDerived } from './rebuild';
import { saveRevision } from './revisions';
import { search } from './search';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
const kindsFound = async (lib: Library, text: string) => (await search(lib.driver, { text })).map((h) => h.entityType).sort();
const wipeDerived = (lib: Library) =>
  lib.driver.batch([
    { sql: 'DELETE FROM anchor_res' },
    { sql: 'DELETE FROM search_doc' },
    { sql: "INSERT INTO search_fts (search_fts) VALUES ('delete-all')" },
  ]);

async function article(lib: Library) {
  const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。') });
  const text = (await getArticle(lib, articleId))!.text;
  return { articleId, revisionId, text };
}

describe('rebuildDerived', () => {
  it('rebuilds search and markup positions from the synced rows alone (Review Focus 4)', async () => {
    const lib = await Library.open(createNodeDriver());
    const { articleId, revisionId, text } = await article(lib);
    const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
    await createSideNote(lib, { markupId, articleId, body: '比喻的妙处' });
    const memoId = await createMemo(lib, { title: '论比喻', homeArticleId: articleId });
    await appendMemoUpdate(lib, memoId, Uint8Array.from([1]), { text: '', links: [] });
    await saveRevision(lib, articleId, paras('【注】他用比喻写春天。'));
    const before = await listMarkups(lib, articleId);
    await wipeDerived(lib);
    expect(await kindsFound(lib, '比喻')).toEqual([]);
    await rebuildDerived(lib);
    expect(await kindsFound(lib, '比喻')).toEqual(['article', 'markup', 'memo', 'side_note']);
    expect(await listMarkups(lib, articleId)).toEqual(before);
  });
});

describe('refreshMemoDerived', () => {
  it('rewrites a memo’s links and searchable text; a deleted memo is left alone', async () => {
    const lib = await Library.open(createNodeDriver());
    const { articleId, revisionId, text } = await article(lib);
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4) });
    const memoId = await createMemo(lib, { title: '札记', homeArticleId: articleId });
    await refreshMemoDerived(lib, memoId, { text: '新写的札记', links: [{ nodeId: 'n1', targetType: 'anchor', targetId: quoteId, articleId }] });
    expect((await search(lib.driver, { text: '新写' })).map((h) => h.entityId)).toEqual([memoId]);
    expect((await listBacklinks(lib, articleId)).map((b) => b.memoId)).toEqual([memoId]);

    const gone = await createMemo(lib, { title: '删', homeArticleId: articleId });
    await deleteMemo(lib, gone);
    await refreshMemoDerived(lib, gone, { text: '不该出现', links: [] });
    expect(await search(lib.driver, { text: '不该出现' })).toEqual([]);
    expect(await liveMemoIds(lib)).toEqual([memoId]);
  });
});
