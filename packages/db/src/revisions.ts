import {
  canonicalText, createReanchorer, detectLang, newId, normalizeBlocks, type Block, type Resolution, type ResolutionStatus,
  type StoredAnchor,
} from '@jot/core';
import { EmptyArticleError, getArticle } from './articles';
import type { Stmt } from './driver';
import type { Library } from './library';
import { anchorResStatement } from './markups';
import { indexStatements } from './search';

export interface RevisionResult {
  revisionId: string;
  /** How the article's markups were found in the new text. */
  markups: Record<ResolutionStatus, number>;
  /** Markups whose words can't be found in the new text (listed in the orphaned-markups panel). */
  orphanedMarkupIds: string[];
}

type AnchorRow = StoredAnchor & { id: string; revisionId: string };

/**
 * A fix-up edit (spec §6.6): the edited blocks become a new revision that the article points at, and
 * every live anchor of the article is re-attached to it (§6.2). Each anchor is re-attached from the
 * revision it was captured on, so the result doesn't depend on the edits in between (§5.3). Returns
 * null, writing nothing, when the text and formatting are unchanged.
 */
export async function saveRevision(lib: Library, articleId: string, blocks: Block[]): Promise<RevisionResult | null> {
  const current = await getArticle(lib, articleId);
  if (!current) throw new Error(`Article ${articleId} does not exist`);
  const normalized = normalizeBlocks(blocks);
  if (normalized.length === 0) throw new EmptyArticleError();
  if (JSON.stringify(normalized) === JSON.stringify(current.blocks)) return null;
  const text = canonicalText(normalized);
  const revisionId = newId();

  const anchors = await lib.driver.query<AnchorRow>(
    'SELECT id, revision_id AS revisionId, start, "end", exact, prefix, suffix FROM anchor WHERE article_id = ? AND deleted = 0',
    [articleId],
  );
  const oldTexts = new Map([[current.revisionId, current.text]]);
  for (const id of new Set(anchors.map((a) => a.revisionId))) {
    if (oldTexts.has(id)) continue;
    const [row] = await lib.driver.query<{ text: string }>('SELECT text FROM article_revision WHERE id = ?', [id]);
    oldTexts.set(id, row?.text ?? '');
  }
  const reanchorers = new Map<string, (anchor: StoredAnchor) => Resolution>();
  const resolved = new Map<string, Resolution>();
  for (const a of anchors) {
    let reanchor = reanchorers.get(a.revisionId);
    if (!reanchor) {
      reanchor = createReanchorer(oldTexts.get(a.revisionId) ?? '', text);
      reanchorers.set(a.revisionId, reanchor);
    }
    resolved.set(a.id, reanchor(a));
  }

  const markups = await lib.driver.query<{ id: string; anchorId: string }>(
    'SELECT id, anchor_id AS anchorId FROM markup WHERE article_id = ? AND deleted = 0',
    [articleId],
  );
  const counts: Record<ResolutionStatus, number> = { exact: 0, mapped: 0, fuzzy: 0, orphan: 0 };
  const orphanedMarkupIds: string[] = [];
  for (const m of markups) {
    const status = resolved.get(m.anchorId)?.status ?? 'orphan';
    counts[status] += 1;
    if (status === 'orphan') orphanedMarkupIds.push(m.id);
  }

  await lib.commit(
    [
      {
        table: 'article_revision',
        id: revisionId,
        fields: { article_id: articleId, parent_id: current.revisionId, blocks: JSON.stringify(normalized), text, created_at: lib.now() },
      },
      { table: 'article', id: articleId, fields: { current_revision_id: revisionId, lang: detectLang(text) } },
    ],
    [
      ...[...resolved].map(([anchorId, r]): Stmt => anchorResStatement(anchorId, revisionId, r.start, r.end, r.status, r.score)),
      ...indexStatements({ entityType: 'article', entityId: articleId, articleId, title: current.title, body: text }),
      // A found markup is searched by the words it now covers (a typo fixed inside it included).
      ...markups.flatMap((m) => {
        const r = resolved.get(m.anchorId);
        if (!r || r.status === 'orphan') return [];
        return indexStatements({ entityType: 'markup', entityId: m.id, articleId, title: '', body: text.slice(r.start, r.end) });
      }),
    ],
  );
  return { revisionId, markups: counts, orphanedMarkupIds };
}
