import { canonicalText, detectLang, newId, normalizeBlocks, type Block } from '@jot/core';
import type { Library, OpInput } from './library';
import { indexStatements, unindexStatements } from './search';

export type ImportKind = 'paste' | 'txt' | 'md' | 'docx';

export interface NewArticle {
  title: string;
  author?: string | null;
  source?: string | null;
  importKind: ImportKind;
  blocks: Block[];
}

export interface ArticleSummary {
  id: string;
  title: string;
  author: string | null;
  lang: string | null;
  createdAt: number;
}

export interface ArticleDetail extends ArticleSummary {
  source: string | null;
  revisionId: string;
  blocks: Block[];
  text: string;
}

export class EmptyArticleError extends Error {
  constructor() {
    super('The article has no text');
    this.name = 'EmptyArticleError';
  }
}

const TITLE_LENGTH = 40;

function deriveTitle(blocks: Block[]): string {
  const chars = [...blocks[0].runs.map((r) => r.t).join('')];
  return chars.length > TITLE_LENGTH ? `${chars.slice(0, TITLE_LENGTH).join('')}…` : chars.join('');
}

const optional = (value: string | null | undefined): string | null => {
  const clean = value?.normalize('NFC').trim();
  return clean ? clean : null;
};

export async function createArticle(lib: Library, input: NewArticle): Promise<{ articleId: string; revisionId: string }> {
  const blocks = normalizeBlocks(input.blocks);
  if (blocks.length === 0) throw new EmptyArticleError();
  const text = canonicalText(blocks);
  const title = input.title.normalize('NFC').trim() || deriveTitle(blocks);
  const articleId = newId();
  const revisionId = newId();
  const now = lib.now();
  await lib.commit(
    [
      {
        table: 'article_revision',
        id: revisionId,
        fields: { article_id: articleId, parent_id: null, blocks: JSON.stringify(blocks), text, created_at: now },
      },
      {
        table: 'article',
        id: articleId,
        fields: {
          title,
          author: optional(input.author),
          source: optional(input.source),
          lang: detectLang(text),
          import_kind: input.importKind,
          current_revision_id: revisionId,
          created_at: now,
        },
      },
    ],
    indexStatements({ entityType: 'article', entityId: articleId, articleId, title, body: text }),
  );
  return { articleId, revisionId };
}

export function listArticles(lib: Library): Promise<ArticleSummary[]> {
  return lib.driver.query<ArticleSummary>(
    'SELECT id, title, author, lang, created_at AS createdAt FROM article WHERE deleted = 0 ORDER BY created_at DESC, id DESC',
  );
}

export async function getArticle(lib: Library, id: string): Promise<ArticleDetail | null> {
  const [row] = await lib.driver.query<Omit<ArticleDetail, 'blocks'> & { blocks: string }>(
    `SELECT a.id, a.title, a.author, a.source, a.lang, a.created_at AS createdAt,
            r.id AS revisionId, r.blocks, r.text
     FROM article a JOIN article_revision r ON r.id = a.current_revision_id
     WHERE a.id = ? AND a.deleted = 0`,
    [id],
  );
  return row ? { ...row, blocks: JSON.parse(row.blocks) as Block[] } : null;
}

/** Tombstones the article with its markups, anchors and side notes, and drops them from search. */
export async function deleteArticle(lib: Library, id: string): Promise<void> {
  const markups = await lib.driver.query<{ id: string; anchorId: string }>(
    'SELECT id, anchor_id AS anchorId FROM markup WHERE article_id = ? AND deleted = 0',
    [id],
  );
  const notes = await lib.driver.query<{ id: string }>('SELECT id FROM side_note WHERE article_id = ? AND deleted = 0', [id]);
  const tombstone = (table: OpInput['table'], rowId: string): OpInput => ({ table, id: rowId, fields: { deleted: 1 } });
  await lib.commit(
    [
      tombstone('article', id),
      ...markups.flatMap((m) => [tombstone('markup', m.id), tombstone('anchor', m.anchorId)]),
      ...notes.map((n) => tombstone('side_note', n.id)),
    ],
    [
      ...unindexStatements('article', id),
      ...markups.flatMap((m) => unindexStatements('markup', m.id)),
      ...notes.flatMap((n) => unindexStatements('side_note', n.id)),
    ],
  );
}
