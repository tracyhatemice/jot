import { captureAnchor, type Block } from '@jot/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle } from './articles';
import { Library } from './library';
import {
  createMarkup, createSideNote, deleteMarkup, deleteSideNote, EmptySelectionError, listMarkups, listSideNotes, updateSideNote,
} from './markups';
import { search } from './search';

let lib: Library;
let articleId: string;
let revisionId: string;
let text: string;

const blocks: Block[] = [
  { k: 'p', runs: [{ t: '他用比喻写春天。' }] },
  { k: 'p', runs: [{ t: '她也用比喻。' }] },
];

beforeEach(async () => {
  let t = 1000;
  lib = await Library.open(createNodeDriver(), { now: () => t++ });
  ({ articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks }));
  text = (await getArticle(lib, articleId))!.text;
});

const mark = (start: number, end: number, kind: 'term' | 'line' | 'paragraph' = 'term') =>
  createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, start, end), kind });

describe('markups', () => {
  it('creates a markup and lists it at its position', async () => {
    const { markupId } = await mark(2, 4);
    expect(await listMarkups(lib, articleId)).toEqual([
      { id: markupId, kind: 'term', style: 'default', anchorId: expect.any(String), start: 2, end: 4, exact: '比喻', status: 'exact' },
    ]);
  });

  it('lists overlapping markups in position order', async () => {
    const b = await mark(4, 8, 'line');
    const a = await mark(2, 6);
    expect((await listMarkups(lib, articleId)).map((m) => m.id)).toEqual([a.markupId, b.markupId]);
  });

  it('rejects a whitespace-only selection (Review Focus 2)', async () => {
    await expect(
      createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10), kind: 'term' }),
    ).rejects.toBeInstanceOf(EmptySelectionError);
  });

  it('indexes the quote for search', async () => {
    const { markupId } = await mark(2, 4);
    const hits = await search(lib.driver, { text: '比喻', types: ['markup'] });
    expect(hits.map((h) => h.entityId)).toEqual([markupId]);
  });

  it('keeps side notes in creation order and searchable', async () => {
    const { markupId } = await mark(2, 4);
    const first = await createSideNote(lib, { markupId, articleId, body: '以物喻物' });
    const second = await createSideNote(lib, { markupId, articleId, body: '' });
    await updateSideNote(lib, second, '通感');
    expect((await listSideNotes(lib, articleId)).map((n) => [n.id, n.body])).toEqual([
      [first, '以物喻物'],
      [second, '通感'],
    ]);
    expect((await search(lib.driver, { text: '通感' })).map((h) => h.entityId)).toEqual([second]);
    await deleteSideNote(lib, first);
    expect((await listSideNotes(lib, articleId)).map((n) => n.id)).toEqual([second]);
    expect(await search(lib.driver, { text: '以物' })).toEqual([]);
  });

  it('deleting a markup deletes its side notes', async () => {
    const { markupId } = await mark(2, 4);
    await createSideNote(lib, { markupId, articleId, body: '旁注' });
    await deleteMarkup(lib, markupId);
    expect(await listMarkups(lib, articleId)).toEqual([]);
    expect(await listSideNotes(lib, articleId)).toEqual([]);
    expect(await search(lib.driver, { text: '旁注' })).toEqual([]);
  });

  it('deleting an article deletes its markups and side notes', async () => {
    const { markupId } = await mark(2, 4);
    await createSideNote(lib, { markupId, articleId, body: '旁注' });
    await deleteArticle(lib, articleId);
    expect(await listMarkups(lib, articleId)).toEqual([]);
    expect(await listSideNotes(lib, articleId)).toEqual([]);
    expect(await search(lib.driver, { text: '比喻' })).toEqual([]);
  });
});
