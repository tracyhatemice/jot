import { base64ToBytes, bytesToBase64, IMMUTABLE_TABLES, parseHlc, SYNCED_COLUMNS, type SqlValue, type SyncedTable } from '@jot/core';
import type { Library } from './library';
import type { RowImage } from './ops';
import { rebuildDerived } from './rebuild';
import { repairTagGraph } from './tags';

export const EXPORT_FORMAT = 'jot-library';
export const EXPORT_VERSION = 1;

/** A whole library as a file (spec §6.7): every synced row, tombstones included, with its clocks. */
export interface LibraryExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  rows: RowImage[];
}

/** What an import brought in (live items in the file). */
export interface ImportSummary {
  articles: number;
  markups: number;
  sideNotes: number;
  memos: number;
  tags: number;
}

export class InvalidExportError extends Error {
  constructor(reason: string) {
    super(`Not a Jot library export: ${reason}`);
    this.name = 'InvalidExportError';
  }
}

export class NewerExportError extends Error {
  constructor(version: number) {
    super(`This export was made by a newer version of Jot (format version ${version})`);
    this.name = 'NewerExportError';
  }
}

export async function exportLibrary(lib: Library): Promise<LibraryExport> {
  const rows: RowImage[] = [];
  for (const table of Object.keys(SYNCED_COLUMNS) as SyncedTable[]) {
    const cols = SYNCED_COLUMNS[table] as readonly string[];
    const immutable = IMMUTABLE_TABLES.has(table);
    const select = ['id', 'hlc', ...(immutable ? [] : ['fhlc']), ...cols].map((c) => `"${c}"`).join(', ');
    for (const r of await lib.driver.query<Record<string, SqlValue>>(`SELECT ${select} FROM "${table}" ORDER BY id`)) {
      rows.push({
        table,
        id: String(r.id),
        hlc: String(r.hlc),
        fhlc: immutable ? {} : (JSON.parse(String(r.fhlc)) as Record<string, string>),
        fields: Object.fromEntries(cols.map((c) => [c, r[c] ?? null])),
      });
    }
  }
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: lib.now(), rows };
}

/** The export as JSON text; BLOBs (memo updates) as `{ "$blob": base64 }`, as in encoded ops. */
export function encodeExport(data: LibraryExport): string {
  return JSON.stringify(data, (_key, value: unknown) => (value instanceof Uint8Array ? { $blob: bytesToBase64(value) } : value));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array);

/** Clocks past this (year 3000) aren't a device running ahead but a damaged file; one near the end of the range would overflow the library's clock. */
const MAX_CLOCK_MS = Date.UTC(3000, 0, 1);

const isHlc = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  try {
    return parseHlc(v).ms < MAX_CLOCK_MS;
  } catch {
    return false;
  }
};

const isJsonArray = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  try {
    return Array.isArray(JSON.parse(v));
  } catch {
    return false;
  }
};

function checkRow(row: unknown, i: number): RowImage {
  const bad = (why: string) => new InvalidExportError(`row ${i}: ${why}`);
  if (!isRecord(row)) throw bad('not an object');
  const { table, id, hlc, fhlc, fields } = row;
  if (typeof table !== 'string' || !Object.hasOwn(SYNCED_COLUMNS, table)) throw bad('unknown table');
  if (typeof id !== 'string' || id === '') throw bad('no id');
  if (!isHlc(hlc)) throw bad('bad clock');
  if (!isRecord(fields)) throw bad('no fields');
  const allowed = SYNCED_COLUMNS[table as SyncedTable] as readonly string[];
  if (!isRecord(fhlc) || !Object.entries(fhlc).every(([col, stamp]) => allowed.includes(col) && isHlc(stamp))) {
    throw bad('bad field clocks');
  }
  for (const [col, value] of Object.entries(fields)) {
    if (!allowed.includes(col)) throw bad(`unknown column ${JSON.stringify(col)}`);
    // A memo update is always a BLOB; every other value is text, a number or null.
    const isBlob = table === 'memo_update' && col === 'data';
    const ok = isBlob ? value instanceof Uint8Array : value === null || typeof value === 'string' || typeof value === 'number';
    if (!ok) throw bad(`bad value in ${col}`);
  }
  // A row that is new here is inserted whole, so every column must be present.
  for (const col of allowed) if (!Object.hasOwn(fields, col)) throw bad(`missing column ${col}`);
  if (table === 'article_revision' && !isJsonArray(fields.blocks)) throw bad('damaged article text');
  return { table: table as SyncedTable, id, hlc, fhlc: fhlc as Record<string, string>, fields: fields as Record<string, SqlValue> };
}

/** Parses an export and checks its format, version, tables, columns, clocks and values; nothing is written. */
export function decodeExport(text: string): LibraryExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, (_key, value: unknown) => {
      if (isRecord(value) && Object.keys(value).length === 1 && typeof value.$blob === 'string') return base64ToBytes(value.$blob);
      return value;
    });
  } catch {
    throw new InvalidExportError('not JSON');
  }
  if (!isRecord(parsed) || parsed.format !== EXPORT_FORMAT) throw new InvalidExportError('unknown format');
  if (typeof parsed.version !== 'number') throw new InvalidExportError('no version');
  if (parsed.version > EXPORT_VERSION) throw new NewerExportError(parsed.version);
  if (!Array.isArray(parsed.rows)) throw new InvalidExportError('no rows');
  const rows = parsed.rows.map((row, i) => checkRow(row, i));
  return { format: EXPORT_FORMAT, version: parsed.version, exportedAt: Number(parsed.exportedAt) || 0, rows };
}

/**
 * Merges an exported library into this one (spec §6.7): every row by per-field latest-edit-wins, so a
 * second import, or one into a library with newer edits, changes nothing it shouldn't. Then the derived
 * tables are rebuilt and the tag graph repaired (§6.4). Memo links and text are refreshed by the caller,
 * which can read memo documents (`refreshMemoDerived`).
 */
export async function importLibrary(lib: Library, data: LibraryExport): Promise<ImportSummary> {
  await lib.applyRows(data.rows);
  await rebuildDerived(lib);
  await repairTagGraph(lib);
  lib.announce();
  const live = (table: SyncedTable) => data.rows.filter((r) => r.table === table && r.fields.deleted !== 1).length;
  return { articles: live('article'), markups: live('markup'), sideNotes: live('side_note'), memos: live('memo'), tags: live('tag') };
}
