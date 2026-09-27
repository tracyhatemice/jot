import { captureAnchor, type Block } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, EmptyArticleError, getArticle } from './articles';
import { Library } from './library';
import { createMarkup, createSideNote, listMarkups, listSideNotes, reattachMarkup } from './markups';
import { createQuote, targetRange } from './memos';
import { saveRevision } from './revisions';
import { search, searchLibrary } from './search';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));

// Canonical text: '春风又绿江南岸。\n\n他用比喻写春天。明月何时照我还。'
//   江南 [4, 6)   他用比喻写春天。 [10, 18)   比喻 [12, 14)   明月 [18, 20)
const ORIGINAL = paras('春风又绿江南岸。', '他用比喻写春天。明月何时照我还。');
const NOTE_ADDED = paras('春风又绿江南岸。', '【注】他用比喻写春天。明月何时照我还。');

async function open() {
  let t = 1000;
  return Library.open(createNodeDriver(), { now: () => t++ });
}

async function setup(lib: Library, blocks = ORIGINAL) {
  const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks });
  const text = (await getArticle(lib, articleId))!.text;
  const mark = async (start: number, end: number) =>
    (await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, start, end), style: 'highlight' })).markupId;
  return { articleId, revisionId, text, mark };
}

/** Each markup's quoted words → where it is now, and how it was found. */
const placed = async (lib: Library, articleId: string) =>
  Object.fromEntries((await listMarkups(lib, articleId)).map((m) => [m.exact, { start: m.start, end: m.end, status: m.status }]));

describe('saveRevision', () => {
  it('stores the edit as the current text and moves every markup with it', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib);
    await mark(4, 6);
    await mark(12, 14);
    await mark(18, 20);
    const result = await saveRevision(lib, articleId, NOTE_ADDED);
    expect(result?.markups).toEqual({ exact: 0, mapped: 3, fuzzy: 0, orphan: 0 });
    expect(await placed(lib, articleId)).toEqual({
      江南: { start: 4, end: 6, status: 'mapped' },
      比喻: { start: 15, end: 17, status: 'mapped' },
      明月: { start: 21, end: 23, status: 'mapped' },
    });
    expect((await getArticle(lib, articleId))!.text).toBe('春风又绿江南岸。\n\n【注】他用比喻写春天。明月何时照我还。');
  });

  it('orphans a markup whose words were deleted, rather than moving it to another copy of them (Review Focus 1)', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib, paras('他用比喻写春天。', '比喻很妙。'));
    const markupId = await mark(2, 4);
    const result = await saveRevision(lib, articleId, paras('比喻很妙。'));
    expect(result).toMatchObject({ markups: { exact: 0, mapped: 0, fuzzy: 0, orphan: 1 }, orphanedMarkupIds: [markupId] });
    expect((await listMarkups(lib, articleId))[0].status).toBe('orphan');
  });

  it('finds a slightly changed passage again by its surroundings (fuzzy)', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib);
    await mark(10, 18);
    const result = await saveRevision(lib, articleId, paras('春风又绿江南岸。', '他用比喻描写春天。明月何时照我还。'));
    expect(result?.markups.fuzzy).toBe(1);
    const [m] = await listMarkups(lib, articleId);
    expect((await getArticle(lib, articleId))!.text.slice(m.start, m.end)).toContain('比喻描写春天');
  });

  it('follows markups when paragraphs are joined or split (Review Focus 5)', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib);
    await mark(12, 14);
    await mark(18, 20);
    await saveRevision(lib, articleId, paras('春风又绿江南岸。他用比喻写春天。明月何时照我还。'));
    expect(await placed(lib, articleId)).toMatchObject({ 比喻: { start: 10, end: 12 }, 明月: { start: 16, end: 18 } });
    await saveRevision(lib, articleId, paras('春风又绿江南岸。他用比喻写春天。', '明月何时照我还。'));
    expect(await placed(lib, articleId)).toMatchObject({ 比喻: { start: 10, end: 12 }, 明月: { start: 18, end: 20 } });
  });

  it('re-attaches from the revision each markup was made on, so two edits end where one would (spec §5.3)', async () => {
    const final = paras('春风又绿江南岸。', '【注】他用比喻描写春天。明月何时照我还。');
    const a = await open();
    const one = await setup(a);
    await one.mark(12, 14);
    await saveRevision(a, one.articleId, NOTE_ADDED);
    await saveRevision(a, one.articleId, final);
    const b = await open();
    const two = await setup(b);
    await two.mark(12, 14);
    await saveRevision(b, two.articleId, final);
    expect(await placed(a, one.articleId)).toEqual(await placed(b, two.articleId));
  });

  it('makes the edited text searchable and forgets the old words (Review Focus 2)', async () => {
    const lib = await open();
    const { articleId } = await setup(lib);
    await saveRevision(lib, articleId, paras('春风又绿塞北岸。', '他用比喻写春天。明月何时照我还。'));
    expect((await search(lib.driver, { text: '塞北', types: ['article'] })).map((h) => h.entityId)).toEqual([articleId]);
    expect(await search(lib.driver, { text: '江南', types: ['article'] })).toEqual([]);
  });

  it('search and results show a markup’s corrected words after a typo fix inside them (Review Focus 2)', async () => {
    const lib = await open();
    const line = '春风又绿江男岸，明月何时照我还';
    const { articleId, text, mark } = await setup(lib, paras(`前面的一些文字。${line}。后面的一些文字。`));
    const at = text.indexOf(line);
    const markupId = await mark(at, at + line.length);
    await saveRevision(lib, articleId, paras('前面的一些文字。春风又绿江南岸，明月何时照我还。后面的一些文字。'));
    expect((await search(lib.driver, { text: '江南', types: ['markup'] })).map((h) => h.entityId)).toEqual([markupId]);
    expect(await search(lib.driver, { text: '江男', types: ['markup'] })).toEqual([]);
    expect((await searchLibrary(lib, { text: '江南', types: ['markup'] })).map((r) => r.text)).toEqual(['春风又绿江南岸，明月何时照我还']);
  });

  it('moves quotes too, so memo links follow the text (Review Focus 2)', async () => {
    const lib = await open();
    const { articleId, revisionId, text } = await setup(lib);
    const quoteId = await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 18, 20) });
    await saveRevision(lib, articleId, NOTE_ADDED);
    expect(await targetRange(lib, 'anchor', quoteId)).toMatchObject({ start: 21, end: 23, status: 'mapped' });
  });

  it('writes nothing when the text and formatting are unchanged (Review Focus 4)', async () => {
    const lib = await open();
    const { articleId, revisionId } = await setup(lib);
    expect(await saveRevision(lib, articleId, paras('春风又绿江南岸。  ', '他用比喻写春天。明月何时照我还。'))).toBeNull();
    expect((await getArticle(lib, articleId))!.revisionId).toBe(revisionId);
  });

  it('refuses to save an article with no text left (Review Focus 4)', async () => {
    const lib = await open();
    const { articleId } = await setup(lib);
    await expect(saveRevision(lib, articleId, paras('  ', '\u{3000}'))).rejects.toBeInstanceOf(EmptyArticleError);
  });
});

describe('reattachMarkup', () => {
  it('points a markup at new words; its notes follow, the old anchor retires, search uses the new words', async () => {
    const lib = await open();
    const { articleId, mark } = await setup(lib, paras('他用比喻写春天。', '明月何时照我还。'));
    const markupId = await mark(2, 4);
    await createSideNote(lib, { markupId, articleId, body: '修辞' });
    const [{ anchorId: oldAnchorId }] = await listMarkups(lib, articleId);
    await saveRevision(lib, articleId, paras('明月何时照我还。'));
    const current = (await getArticle(lib, articleId))!;
    await reattachMarkup(lib, markupId, { revisionId: current.revisionId, anchor: captureAnchor(current.text, 0, 2) });
    expect(await listMarkups(lib, articleId)).toMatchObject([{ id: markupId, exact: '明月', start: 0, end: 2, status: 'exact' }]);
    expect((await listSideNotes(lib, articleId)).map((n) => n.markupId)).toEqual([markupId]);
    expect(await lib.driver.query('SELECT deleted FROM anchor WHERE id = ?', [oldAnchorId])).toEqual([{ deleted: 1 }]);
    expect((await search(lib.driver, { text: '明月', types: ['markup'] })).map((h) => h.entityId)).toEqual([markupId]);
    expect(await search(lib.driver, { text: '比喻', types: ['markup'] })).toEqual([]);
  });
});
