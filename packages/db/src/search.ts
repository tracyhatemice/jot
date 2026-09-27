import { buildFtsQuery, normalizeForIndex, type EntityType, type SqlValue } from '@jot/core';
import type { SqlDriver, Stmt } from './driver';
import type { Library } from './library';

export interface SearchDoc {
  entityType: EntityType;
  entityId: string;
  /** The article the item belongs to (an article's own id for articles; null for memos). */
  articleId: string | null;
  title: string;
  body: string;
}

export function unindexStatements(entityType: EntityType, entityId: string): Stmt[] {
  return [
    {
      sql: 'DELETE FROM search_fts WHERE rowid = (SELECT rowid FROM search_doc WHERE entity_type = ? AND entity_id = ?)',
      params: [entityType, entityId],
    },
    { sql: 'DELETE FROM search_doc WHERE entity_type = ? AND entity_id = ?', params: [entityType, entityId] },
  ];
}

/** (Re)indexes one item; append to a Library.commit batch so the index never drifts from the data. */
export function indexStatements(doc: SearchDoc): Stmt[] {
  return [
    ...unindexStatements(doc.entityType, doc.entityId),
    {
      sql: 'INSERT INTO search_doc (entity_type, entity_id, article_id) VALUES (?, ?, ?)',
      params: [doc.entityType, doc.entityId, doc.articleId],
    },
    {
      sql: 'INSERT INTO search_fts (rowid, title, body) SELECT rowid, ?, ? FROM search_doc WHERE entity_type = ? AND entity_id = ?',
      params: [normalizeForIndex(doc.title), normalizeForIndex(doc.body), doc.entityType, doc.entityId],
    },
  ];
}

export interface SearchParams {
  text?: string;
  /** Every tag must match (AND); each tag also matches its descendants. */
  tagIds?: string[];
  types?: EntityType[];
  /** Also match items whose ARTICLE carries the tag (spec: toggle, off by default). */
  inherit?: boolean;
  limit?: number;
}

export interface SearchHit {
  entityType: EntityType;
  entityId: string;
  articleId: string | null;
  /** bm25 score; lower is better. 0 for tag-only searches. */
  rank: number;
}

export async function search(driver: SqlDriver, p: SearchParams): Promise<SearchHit[]> {
  const fts = p.text ? buildFtsQuery(p.text) : null;
  const tagIds = p.tagIds ?? [];
  if (fts === null && tagIds.length === 0) return [];

  // Bind in textual order: CTEs, then MATCH, then types, then LIMIT.
  const params: SqlValue[] = [];
  const ctes = tagIds.map((id, i) => {
    params.push(id);
    return `scope${i}(id) AS (SELECT ? UNION SELECT e.child_id FROM tag_edge e JOIN scope${i} s ON e.parent_id = s.id WHERE e.deleted = 0)`;
  });
  const where: string[] = [];
  let from = 'search_doc d';
  let rank = '0';
  if (fts !== null) {
    from = 'search_fts JOIN search_doc d ON d.rowid = search_fts.rowid';
    rank = 'bm25(search_fts, 5.0, 1.0)';
    where.push('search_fts MATCH ?');
    params.push(fts);
  }
  if (p.types && p.types.length > 0) {
    where.push(`d.entity_type IN (${p.types.map(() => '?').join(', ')})`);
    params.push(...p.types);
  }
  const inherit = p.inherit ? " OR (t.entity_type = 'article' AND t.entity_id = d.article_id)" : '';
  tagIds.forEach((_, i) => {
    where.push(
      `EXISTS (SELECT 1 FROM tagging t WHERE t.deleted = 0 AND t.tag_id IN (SELECT id FROM scope${i}) ` +
        `AND ((t.entity_type = d.entity_type AND t.entity_id = d.entity_id)${inherit}))`,
    );
  });
  params.push(p.limit ?? 50);

  const sql =
    (ctes.length > 0 ? `WITH RECURSIVE ${ctes.join(', ')} ` : '') +
    `SELECT d.entity_type AS entityType, d.entity_id AS entityId, d.article_id AS articleId, ${rank} AS rank ` +
    `FROM ${from}` +
    (where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY rank, d.rowid DESC LIMIT ?';
  return driver.query<SearchHit>(sql, params);
}

export interface SearchResult extends SearchHit {
  /** An article's or memo's title; empty for markups and side notes. */
  title: string;
  /** The text the item is found by: article text, quoted passage, note body or memo text. */
  text: string;
  /** Title of the article the item belongs to (null for memos). */
  articleTitle: string | null;
}

type ShownRow = { id: string; title: string; text: string };

async function rowsById<T extends { id: string }>(
  driver: SqlDriver,
  sql: (inList: string) => string,
  ids: readonly string[],
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();
  const rows = await driver.query<T>(sql(ids.map(() => '?').join(', ')), [...ids]);
  return new Map(rows.map((r) => [r.id, r]));
}

type MarkupRow = ShownRow & {
  articleId: string;
  start: number | null;
  end: number | null;
  status: string | null;
  resolvedOn: string | null;
};

/** Markups with the words they now cover in their article's current text (their quote if that is unknown). */
async function markupRows(driver: SqlDriver, ids: readonly string[]): Promise<Map<string, ShownRow>> {
  const rows = [
    ...(
      await rowsById<MarkupRow>(
        driver,
        (list) =>
          `SELECT m.id, '' AS title, a.exact AS text, m.article_id AS articleId, r.start, r."end", r.status,
                  r.revision_id AS resolvedOn
           FROM markup m JOIN anchor a ON a.id = m.anchor_id LEFT JOIN anchor_res r ON r.anchor_id = a.id
           WHERE m.deleted = 0 AND m.id IN (${list})`,
        ids,
      )
    ).values(),
  ];
  const texts = await rowsById<{ id: string; revisionId: string; text: string }>(
    driver,
    (list) =>
      `SELECT a.id, a.current_revision_id AS revisionId, r.text FROM article a
       JOIN article_revision r ON r.id = a.current_revision_id WHERE a.id IN (${list})`,
    [...new Set(rows.map((r) => r.articleId))],
  );
  return new Map(
    rows.map((r) => {
      const current = texts.get(r.articleId);
      const found = current && r.status !== 'orphan' && r.resolvedOn === current.revisionId && r.start !== null && r.end !== null;
      return [r.id, { id: r.id, title: '', text: found ? current.text.slice(r.start!, r.end!) : r.text }];
    }),
  );
}

/** `search`, plus what the results list shows for each hit. Hits whose item is gone are skipped. */
export async function searchLibrary(lib: Library, p: SearchParams): Promise<SearchResult[]> {
  const hits = await search(lib.driver, p);
  const idsOf = (type: EntityType) => hits.filter((h) => h.entityType === type).map((h) => h.entityId);
  const articleIds = [...new Set(hits.flatMap((h) => (h.articleId ? [h.articleId] : [])))];
  const [articles, markups, notes, memos, titles] = await Promise.all([
    rowsById<ShownRow>(
      lib.driver,
      (list) =>
        `SELECT a.id, a.title, r.text FROM article a JOIN article_revision r ON r.id = a.current_revision_id
         WHERE a.deleted = 0 AND a.id IN (${list})`,
      idsOf('article'),
    ),
    markupRows(lib.driver, idsOf('markup')),
    rowsById<ShownRow>(
      lib.driver,
      (list) => `SELECT id, '' AS title, body AS text FROM side_note WHERE deleted = 0 AND id IN (${list})`,
      idsOf('side_note'),
    ),
    rowsById<ShownRow>(
      lib.driver,
      (list) =>
        `SELECT m.id, m.title, coalesce(c.text, '') AS text FROM memo m LEFT JOIN memo_cache c ON c.memo_id = m.id
         WHERE m.deleted = 0 AND m.id IN (${list})`,
      idsOf('memo'),
    ),
    rowsById<{ id: string; title: string }>(lib.driver, (list) => `SELECT id, title FROM article WHERE id IN (${list})`, articleIds),
  ]);
  const rowsOf: Record<EntityType, Map<string, ShownRow>> = { article: articles, markup: markups, side_note: notes, memo: memos };
  return hits.flatMap((h) => {
    const row = rowsOf[h.entityType].get(h.entityId);
    if (!row) return [];
    const articleTitle = h.articleId ? (titles.get(h.articleId)?.title ?? null) : null;
    return [{ ...h, title: row.title, text: row.text, articleTitle }];
  });
}
