import { buildFtsQuery, normalizeForIndex, type EntityType, type SqlValue } from '@jot/core';
import type { SqlDriver, Stmt } from './driver';

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
