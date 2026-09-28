import { captureAnchor, SYNCED_COLUMNS, type Block, type SyncedTable } from '@jot/core';
import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { createArticle, deleteArticle, getArticle, listArticles } from './articles';
import { decodeExport, encodeExport, exportLibrary, importLibrary, InvalidExportError, NewerExportError, restoreRows } from './exchange';
import { Library } from './library';
import { createMarkup, createSideNote, listMarkups } from './markups';
import { appendMemoUpdate, compactMemo, createMemo, createQuote, getMemoState } from './memos';
import { saveRevision } from './revisions';
import { search } from './search';
import { addParent, createTag, deleteTag, listEdges, listTags, renameTag, tagEntity, tagsOf } from './tags';

const paras = (...texts: string[]): Block[] => texts.map((t) => ({ k: 'p', runs: [{ t }] }));
let tick = 1000;
const open = () => Library.open(createNodeDriver(), { now: () => tick++ });

/** Every synced row as the database holds it (derived tables left out; field clocks as objects, since key order may differ). */
async function syncedRows(lib: Library) {
  const out: Record<string, unknown[]> = {};
  for (const table of Object.keys(SYNCED_COLUMNS) as SyncedTable[]) {
    const rows = await lib.driver.query<Record<string, unknown>>(`SELECT * FROM "${table}" ORDER BY id`);
    out[table] = rows.map((r) => (typeof r.fhlc === 'string' ? { ...r, fhlc: JSON.parse(r.fhlc) as unknown } : r));
  }
  return out;
}

const NOTHING = { articles: 0, markups: 0, sideNotes: 0, memos: 0, tags: 0 };
const roundTrip = async (from: Library, to: Library) => importLibrary(to, decodeExport(encodeExport(await exportLibrary(from))));

async function sampleLibrary() {
  const lib = await open();
  const { articleId, revisionId } = await createArticle(lib, { title: '春', importKind: 'paste', blocks: paras('他用比喻写春天。明月何时照我还。') });
  const text = (await getArticle(lib, articleId))!.text;
  const { markupId } = await createMarkup(lib, { articleId, revisionId, anchor: captureAnchor(text, 2, 4), style: 'highlight' });
  const noteId = await createSideNote(lib, { markupId, articleId, body: '以景起兴' });
  await createQuote(lib, { articleId, revisionId, anchor: captureAnchor(text, 8, 10) });
  const memoId = await createMemo(lib, { title: '札记', homeArticleId: articleId });
  await appendMemoUpdate(lib, memoId, Uint8Array.from([1, 2, 255]), { text: '论比喻', links: [] });
  const parent = await createTag(lib, { name: '技巧' });
  const child = await createTag(lib, { name: '修辞' });
  await addParent(lib, child, parent);
  await tagEntity(lib, { tagId: child, entityType: 'side_note', entityId: noteId, articleId });
  await saveRevision(lib, articleId, paras('【注】他用比喻写春天。明月何时照我还。'));
  return { lib, articleId, noteId, memoId, parent, child };
}

describe('library export and import', () => {
  it('copies a whole library into a fresh one: every row with its clocks, and the derived data (spec §10 step 6)', async () => {
    const { lib: a, articleId, memoId } = await sampleLibrary();
    const b = await open();
    expect((await roundTrip(a, b)).changed).toEqual({ articles: 1, markups: 1, sideNotes: 1, memos: 1, tags: 2 });
    expect(await syncedRows(b)).toEqual(await syncedRows(a));
    expect(await listMarkups(b, articleId)).toEqual(await listMarkups(a, articleId));
    expect((await search(b.driver, { text: '起兴' })).map((h) => h.entityType)).toEqual(['side_note']);
    expect((await getMemoState(b, memoId)).updates.map((u) => [...u.data])).toEqual([[1, 2, 255]]);
  });

  it('keeps the newest edit of every field when imported twice or into a library with newer edits (Review Focus 1)', async () => {
    const { lib: a, child } = await sampleLibrary();
    const b = await open();
    await roundTrip(a, b);
    await renameTag(b, child, '修辞手法');
    const before = await syncedRows(b);
    await roundTrip(a, b);
    expect(await syncedRows(b)).toEqual(before);
    expect((await listTags(b)).map((t) => t.name)).toContain('修辞手法');
  });

  it('reports only what changed: the same file a second time changes nothing', async () => {
    const { lib: a } = await sampleLibrary();
    const b = await open();
    await roundTrip(a, b);
    const again = await roundTrip(a, b);
    expect(again.changed).toEqual(NOTHING);
    expect(again.deletedHere).toEqual(NOTHING);
    expect(again.deletedHereRows).toEqual([]);
  });

  it('counts memo text that arrived as changed, though the memo row itself did not change', async () => {
    const { lib: a, memoId } = await sampleLibrary();
    const b = await open();
    await roundTrip(a, b);
    await appendMemoUpdate(a, memoId, Uint8Array.from([7]), { text: '', links: [] });
    expect((await roundTrip(a, b)).changed).toEqual({ ...NOTHING, memos: 1 });
  });

  it('offers what this library deleted after the export, and restoring brings it back whole', async () => {
    const { lib, articleId, noteId, parent, child } = await sampleLibrary();
    const file = decodeExport(encodeExport(await exportLibrary(lib)));
    const markups = await listMarkups(lib, articleId);
    await deleteArticle(lib, articleId);
    await deleteTag(lib, child);

    const result = await importLibrary(lib, file);
    expect(result.changed).toEqual(NOTHING);
    expect(result.deletedHere).toEqual({ articles: 1, markups: 1, sideNotes: 1, memos: 0, tags: 1 });

    await restoreRows(lib, result.deletedHereRows);
    expect((await listArticles(lib)).map((x) => x.id)).toEqual([articleId]);
    expect(await listMarkups(lib, articleId)).toEqual(markups);
    expect((await search(lib.driver, { text: '起兴' })).map((h) => h.entityType)).toEqual(['side_note']);
    expect((await listTags(lib)).map((t) => t.id).sort()).toEqual([parent, child].sort());
    expect((await listEdges(lib)).map((e) => [e.parent_id, e.child_id])).toEqual([[parent, child]]);
    expect(await tagsOf(lib, 'side_note', noteId)).toEqual([child]);
    expect((await importLibrary(lib, file)).deletedHereRows).toEqual([]);
  });

  it('removes what the export deleted, where the deletion is the newer edit (Review Focus 1)', async () => {
    const { lib: a, parent } = await sampleLibrary();
    const b = await open();
    await roundTrip(a, b);
    await deleteTag(a, parent);
    await roundTrip(a, b);
    expect((await listTags(b)).map((t) => t.name)).toEqual(['修辞']);
  });

  it('shows memo edits from the file even where this library has compacted the memo (Review Focus 1)', async () => {
    const { lib: a, memoId } = await sampleLibrary();
    const b = await open();
    await roundTrip(a, b);
    await appendMemoUpdate(a, memoId, Uint8Array.from([2]), { text: '', links: [] });
    await appendMemoUpdate(b, memoId, Uint8Array.from([3]), { text: '', links: [] });
    const local = await getMemoState(b, memoId);
    await compactMemo(b, memoId, Uint8Array.from([9]), local.updates[local.updates.length - 1].hlc);
    await roundTrip(a, b);
    const state = await getMemoState(b, memoId);
    expect(state.updates.map((u) => [...u.data])).toContainEqual([2]);
  });

  it('merges tags that share a name after the import (spec §6.4, Review Focus 4)', async () => {
    const { lib: a } = await sampleLibrary();
    const b = await open();
    await createTag(b, { name: '修辞' });
    await roundTrip(a, b);
    expect((await listTags(b)).filter((t) => t.name === '修辞')).toHaveLength(1);
  });

  it('refuses files that are not Jot exports, before writing anything (Review Focus 3)', async () => {
    const { lib: a } = await sampleLibrary();
    const good = JSON.parse(encodeExport(await exportLibrary(a))) as { rows: Record<string, unknown>[] };
    const withRow = (table: string, change: (row: Record<string, unknown>, fields: Record<string, unknown>) => void) => {
      const copy = structuredClone(good);
      const row = copy.rows.find((r) => r.table === table)!;
      change(row, row.fields as Record<string, unknown>);
      return JSON.stringify(copy);
    };
    const withFirstRow = (change: (row: Record<string, unknown>, fields: Record<string, unknown>) => void) =>
      withRow(String(good.rows[0].table), change);
    const invalid = [
      'not json',
      '{"hello":"world"}',
      JSON.stringify({ ...good, format: 'other' }),
      JSON.stringify({ ...good, rows: 'nope' }),
      withFirstRow((row) => {
        row.table = 'outbox';
      }),
      withFirstRow((_row, fields) => {
        fields['title" = 1; DROP TABLE article; --'] = 'x';
      }),
      withFirstRow((row) => {
        row.hlc = 'yesterday';
      }),
      withFirstRow((_row, fields) => {
        fields.title = true;
      }),
      withFirstRow((_row, fields) => {
        fields.title = { $blob: 'AAAA' };
      }),
      withFirstRow((_row, fields) => {
        delete fields.title;
      }),
      // A clock at the end of its range would overflow this library's clock and leave it unable to open.
      withFirstRow((row) => {
        row.hlc = '999999999999999-ffff-00000000000000aa';
      }),
      withRow('memo_update', (_row, fields) => {
        fields.data = 'hello';
      }),
      withRow('article_revision', (_row, fields) => {
        fields.blocks = 'not json';
      }),
    ];
    for (const text of invalid) expect(() => decodeExport(text), text.slice(0, 80)).toThrow(InvalidExportError);
    expect(() => decodeExport(JSON.stringify({ ...good, version: 99 }))).toThrow(NewerExportError);
  });
});
