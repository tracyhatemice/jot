import { newId, type ResolutionStatus, type TextAnchor } from '@jot/core';
import { generateKeyBetween } from 'fractional-indexing';
import type { Stmt } from './driver';
import type { Library, OpInput } from './library';
import { indexStatements, unindexStatements } from './search';

/** How a markup looks. Any length of text can carry any style. */
export type MarkupStyle = 'underline' | 'bold' | 'highlight';

/**
 * Stored granularity. New markups are always 'term' (exactly the selection); 'line' and 'paragraph'
 * only exist on markups saved before styles were introduced.
 */
export type MarkupKind = 'term' | 'line' | 'paragraph';

export interface NewMarkup {
  articleId: string;
  revisionId: string;
  anchor: TextAnchor;
  style: MarkupStyle;
  kind?: MarkupKind;
}

export interface MarkupView {
  id: string;
  kind: MarkupKind;
  style: MarkupStyle;
  anchorId: string;
  start: number;
  end: number;
  exact: string;
  status: ResolutionStatus;
}

export interface SideNoteView {
  id: string;
  markupId: string;
  body: string;
  sortKey: string;
  createdAt: number;
}

export class EmptySelectionError extends Error {
  constructor() {
    super('Select some text first');
    this.name = 'EmptySelectionError';
  }
}

/** Local-only resolved position (spec §5.3); a new anchor sits exactly where it was captured. */
function anchorResStatement(anchorId: string, revisionId: string, start: number, end: number): Stmt {
  return {
    sql: `INSERT INTO anchor_res (anchor_id, revision_id, start, "end", status, score) VALUES (?, ?, ?, ?, 'exact', 1)
          ON CONFLICT (anchor_id) DO UPDATE SET revision_id = excluded.revision_id, start = excluded.start,
            "end" = excluded."end", status = excluded.status, score = excluded.score`,
    params: [anchorId, revisionId, start, end],
  };
}

export async function createMarkup(lib: Library, m: NewMarkup): Promise<{ markupId: string; anchorId: string }> {
  const a = m.anchor;
  if (a.exact.trim() === '') throw new EmptySelectionError();
  const anchorId = newId();
  const markupId = newId();
  const now = lib.now();
  await lib.commit(
    [
      {
        table: 'anchor',
        id: anchorId,
        fields: {
          article_id: m.articleId,
          revision_id: m.revisionId,
          start: a.start,
          end: a.end,
          exact: a.exact,
          prefix: a.prefix,
          suffix: a.suffix,
          unit: a.unit,
          created_at: now,
        },
      },
      {
        table: 'markup',
        id: markupId,
        fields: { article_id: m.articleId, anchor_id: anchorId, kind: m.kind ?? 'term', style: m.style, created_at: now },
      },
    ],
    [
      anchorResStatement(anchorId, m.revisionId, a.start, a.end),
      ...indexStatements({ entityType: 'markup', entityId: markupId, articleId: m.articleId, title: '', body: a.exact }),
    ],
  );
  return { markupId, anchorId };
}

export function listMarkups(lib: Library, articleId: string): Promise<MarkupView[]> {
  return lib.driver.query<MarkupView>(
    // Markups saved before styles existed have style 'default': a line was underlined, others highlighted.
    `SELECT m.id, m.kind,
            CASE WHEN m.style IN ('underline', 'bold', 'highlight') THEN m.style
                 WHEN m.kind = 'line' THEN 'underline'
                 ELSE 'highlight' END AS style,
            a.id AS anchorId,
            coalesce(r.start, a.start) AS start, coalesce(r."end", a."end") AS "end",
            a.exact, coalesce(r.status, 'exact') AS status
     FROM markup m
     JOIN anchor a ON a.id = m.anchor_id
     LEFT JOIN anchor_res r ON r.anchor_id = a.id
     WHERE m.article_id = ? AND m.deleted = 0
     ORDER BY start, "end", m.id`,
    [articleId],
  );
}

export async function deleteMarkup(lib: Library, markupId: string): Promise<void> {
  const [row] = await lib.driver.query<{ anchorId: string }>('SELECT anchor_id AS anchorId FROM markup WHERE id = ?', [markupId]);
  if (!row) return;
  const notes = await lib.driver.query<{ id: string }>('SELECT id FROM side_note WHERE markup_id = ? AND deleted = 0', [
    markupId,
  ]);
  await lib.commit(
    [
      { table: 'markup', id: markupId, fields: { deleted: 1 } },
      { table: 'anchor', id: row.anchorId, fields: { deleted: 1 } },
      ...notes.map((n): OpInput => ({ table: 'side_note', id: n.id, fields: { deleted: 1 } })),
    ],
    [...unindexStatements('markup', markupId), ...notes.flatMap((n) => unindexStatements('side_note', n.id))],
  );
}

export async function createSideNote(
  lib: Library,
  input: { markupId: string; articleId: string; body: string },
): Promise<string> {
  return lib.lock.run(async () => {
    const [last] = await lib.driver.query<{ k: string | null }>(
      'SELECT max(sort_key) AS k FROM side_note WHERE markup_id = ? AND deleted = 0',
      [input.markupId],
    );
    const id = newId();
    await lib.commit(
      [
        {
          table: 'side_note',
          id,
          fields: {
            markup_id: input.markupId,
            article_id: input.articleId,
            body: input.body,
            sort_key: generateKeyBetween(last?.k ?? null, null),
            created_at: lib.now(),
          },
        },
      ],
      indexStatements({ entityType: 'side_note', entityId: id, articleId: input.articleId, title: '', body: input.body }),
    );
    return id;
  });
}

export async function updateSideNote(lib: Library, id: string, body: string): Promise<void> {
  const [row] = await lib.driver.query<{ articleId: string }>(
    'SELECT article_id AS articleId FROM side_note WHERE id = ? AND deleted = 0',
    [id],
  );
  if (!row) return;
  await lib.commit(
    [{ table: 'side_note', id, fields: { body } }],
    indexStatements({ entityType: 'side_note', entityId: id, articleId: row.articleId, title: '', body }),
  );
}

export async function deleteSideNote(lib: Library, id: string): Promise<void> {
  await lib.commit([{ table: 'side_note', id, fields: { deleted: 1 } }], unindexStatements('side_note', id));
}

export function listSideNotes(lib: Library, articleId: string): Promise<SideNoteView[]> {
  return lib.driver.query<SideNoteView>(
    `SELECT id, markup_id AS markupId, body, sort_key AS sortKey, created_at AS createdAt
     FROM side_note WHERE article_id = ? AND deleted = 0 ORDER BY markup_id, sort_key, id`,
    [articleId],
  );
}
