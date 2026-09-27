import type { Library } from './library';
import { liveMarkups, placementStatements, resolveAnchors } from './revisions';
import { indexStatements } from './search';

/**
 * Rebuilds the local derived tables that come from synced rows alone — the search index and the anchor
 * positions — for the whole library (spec §5.3). Memo links and text come from the memo documents; the
 * caller refreshes them (`refreshMemoDerived`). Used after an import; safe to run any time.
 */
export async function rebuildDerived(lib: Library): Promise<void> {
  await lib.driver.batch([
    { sql: 'DELETE FROM anchor_res' },
    { sql: 'DELETE FROM search_doc' },
    { sql: "INSERT INTO search_fts (search_fts) VALUES ('delete-all')" },
  ]);
  const articles = await lib.driver.query<{ id: string; title: string; revisionId: string; text: string }>(
    `SELECT a.id, a.title, r.id AS revisionId, r.text FROM article a
     JOIN article_revision r ON r.id = a.current_revision_id WHERE a.deleted = 0`,
  );
  for (const a of articles) {
    const resolved = await resolveAnchors(lib, a.id, a.text, new Map([[a.revisionId, a.text]]));
    const markups = await liveMarkups(lib, a.id);
    const notes = await lib.driver.query<{ id: string; body: string }>(
      'SELECT id, body FROM side_note WHERE article_id = ? AND deleted = 0',
      [a.id],
    );
    await lib.driver.batch([
      ...placementStatements(a.id, a.revisionId, a.text, resolved, markups),
      ...indexStatements({ entityType: 'article', entityId: a.id, articleId: a.id, title: a.title, body: a.text }),
      ...notes.flatMap((n) => indexStatements({ entityType: 'side_note', entityId: n.id, articleId: a.id, title: '', body: n.body })),
    ]);
  }
  const memos = await lib.driver.query<{ id: string; title: string; text: string }>(
    `SELECT m.id, m.title, coalesce(c.text, '') AS text FROM memo m LEFT JOIN memo_cache c ON c.memo_id = m.id
     WHERE m.deleted = 0`,
  );
  if (memos.length > 0) {
    await lib.driver.batch(
      memos.flatMap((m) => indexStatements({ entityType: 'memo', entityId: m.id, articleId: null, title: m.title, body: m.text })),
    );
  }
}
