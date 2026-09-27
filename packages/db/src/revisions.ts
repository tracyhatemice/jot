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
 * Where each live anchor of an article sits in `text`: re-attached from the revision it was captured on,
 * so every device gets the same answer whatever edits came in between (spec §5.3). `knownTexts` spares
 * reading revisions the caller already has.
 */
export async function resolveAnchors(
  lib: Library,
  articleId: string,
  text: string,
  knownTexts: ReadonlyMap<string, string>,
): Promise<Map<string, Resolution>> {
  const anchors = await lib.driver.query<AnchorRow>(
    'SELECT id, revision_id AS revisionId, start, "end", exact, prefix, suffix FROM anchor WHERE article_id = ? AND deleted = 0',
    [articleId],
  );
  const oldTexts = new Map(knownTexts);
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
  return resolved;
}

export interface LiveMarkup {
  id: string;
  anchorId: string;
  /** The words the markup was made on. */
  exact: string;
}

export function liveMarkups(lib: Library, articleId: string): Promise<LiveMarkup[]> {
  return lib.driver.query<LiveMarkup>(
    `SELECT m.id, m.anchor_id AS anchorId, a.exact FROM markup m JOIN anchor a ON a.id = m.anchor_id
     WHERE m.article_id = ? AND m.deleted = 0`,
    [articleId],
  );
}

/**
 * Local statements placing an article's anchors on `revisionId`, and indexing its markups by the words
 * they now cover (a typo fixed inside one included; an orphan keeps its original words).
 */
export function placementStatements(
  articleId: string,
  revisionId: string,
  text: string,
  resolved: ReadonlyMap<string, Resolution>,
  markups: readonly LiveMarkup[],
): Stmt[] {
  return [
    ...[...resolved].map(([anchorId, r]) => anchorResStatement(anchorId, revisionId, r.start, r.end, r.status, r.score)),
    ...markups.flatMap((m) => {
      const r = resolved.get(m.anchorId);
      const body = r && r.status !== 'orphan' ? text.slice(r.start, r.end) : m.exact;
      return indexStatements({ entityType: 'markup', entityId: m.id, articleId, title: '', body });
    }),
  ];
}

/**
 * A fix-up edit (spec §6.6): the edited blocks become a new revision that the article points at, and
 * every live anchor of the article is re-attached to it (§6.2). Returns null, writing nothing, when the
 * text and formatting are unchanged.
 */
export async function saveRevision(lib: Library, articleId: string, blocks: Block[]): Promise<RevisionResult | null> {
  const current = await getArticle(lib, articleId);
  if (!current) throw new Error(`Article ${articleId} does not exist`);
  const normalized = normalizeBlocks(blocks);
  if (normalized.length === 0) throw new EmptyArticleError();
  if (JSON.stringify(normalized) === JSON.stringify(current.blocks)) return null;
  const text = canonicalText(normalized);
  const revisionId = newId();
  const resolved = await resolveAnchors(lib, articleId, text, new Map([[current.revisionId, current.text]]));
  const markups = await liveMarkups(lib, articleId);

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
      ...placementStatements(articleId, revisionId, text, resolved, markups),
      ...indexStatements({ entityType: 'article', entityId: articleId, articleId, title: current.title, body: text }),
    ],
  );
  return { revisionId, markups: counts, orphanedMarkupIds };
}
