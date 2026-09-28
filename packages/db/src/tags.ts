import { edgesToBreakCycles, foldTagName, newId, planTagMerges, tagEdgeId, taggingId, type EntityType } from '@jot/core';
import { generateKeyBetween } from 'fractional-indexing';
import type { Library, OpInput } from './library';

export class InvalidTagNameError extends Error {
  constructor() {
    super('Tag name must not be empty');
    this.name = 'InvalidTagNameError';
  }
}

export class DuplicateTagNameError extends Error {
  readonly tagName: string;

  constructor(tagName: string) {
    super(`A tag named "${tagName}" already exists`);
    this.name = 'DuplicateTagNameError';
    this.tagName = tagName;
  }
}

export class TagCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TagCycleError';
  }
}

export type TagRow = { id: string; name: string; color: string | null; sort_key: string };
export type TagEdgeRow = { id: string; parent_id: string; child_id: string; hlc: string };
type TaggingRow = { id: string; tag_id: string; entity_type: EntityType; entity_id: string; article_id: string | null; created_at: number };

export interface TaggingTarget {
  tagId: string;
  entityType: EntityType;
  entityId: string;
  articleId: string | null;
}

const DESCENDANTS_SQL =
  'WITH RECURSIVE d(id) AS (SELECT ? UNION SELECT e.child_id FROM tag_edge e JOIN d ON e.parent_id = d.id WHERE e.deleted = 0) SELECT id FROM d';

function cleanName(name: string): string {
  const clean = name.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!clean) throw new InvalidTagNameError();
  return clean;
}

export function listTags(lib: Library): Promise<TagRow[]> {
  return lib.driver.query<TagRow>('SELECT id, name, color, sort_key FROM tag WHERE deleted = 0 ORDER BY sort_key, id');
}

export function listEdges(lib: Library): Promise<TagEdgeRow[]> {
  return lib.driver.query<TagEdgeRow>('SELECT id, parent_id, child_id, hlc FROM tag_edge WHERE deleted = 0 ORDER BY id');
}

export async function descendantTagIds(lib: Library, tagId: string): Promise<string[]> {
  return (await lib.driver.query<{ id: string }>(DESCENDANTS_SQL, [tagId])).map((r) => r.id);
}

export async function tagsOf(lib: Library, entityType: EntityType, entityId: string): Promise<string[]> {
  const rows = await lib.driver.query<{ tag_id: string }>(
    'SELECT tag_id FROM tagging WHERE deleted = 0 AND entity_type = ? AND entity_id = ? ORDER BY tag_id',
    [entityType, entityId],
  );
  return rows.map((r) => r.tag_id);
}

export async function createTag(lib: Library, input: { name: string; color?: string | null }): Promise<string> {
  const name = cleanName(input.name);
  return lib.lock.run(async () => {
    const tags = await listTags(lib);
    if (tags.some((t) => foldTagName(t.name) === foldTagName(name))) throw new DuplicateTagNameError(name);
    const lastKey = tags.reduce<string | null>((max, t) => (max === null || t.sort_key > max ? t.sort_key : max), null);
    const id = newId();
    await lib.commit([
      {
        table: 'tag',
        id,
        fields: { name, color: input.color ?? null, sort_key: generateKeyBetween(lastKey, null), created_at: lib.now() },
      },
    ]);
    return id;
  });
}

export async function renameTag(lib: Library, id: string, name: string): Promise<void> {
  const clean = cleanName(name);
  await lib.lock.run(async () => {
    const tags = await listTags(lib);
    if (tags.some((t) => t.id !== id && foldTagName(t.name) === foldTagName(clean))) throw new DuplicateTagNameError(clean);
    await lib.commit([{ table: 'tag', id, fields: { name: clean } }]);
  });
}

export async function deleteTag(lib: Library, id: string): Promise<void> {
  await lib.lock.run(async () => {
    const edges = await lib.driver.query<{ id: string }>(
      'SELECT id FROM tag_edge WHERE deleted = 0 AND (parent_id = ? OR child_id = ?)',
      [id, id],
    );
    const taggings = await lib.driver.query<{ id: string }>('SELECT id FROM tagging WHERE deleted = 0 AND tag_id = ?', [id]);
    await lib.commit([
      { table: 'tag', id, fields: { deleted: 1 } },
      ...edges.map((e): OpInput => ({ table: 'tag_edge', id: e.id, fields: { deleted: 1 } })),
      ...taggings.map((t): OpInput => ({ table: 'tagging', id: t.id, fields: { deleted: 1 } })),
    ]);
  });
}

const edgeInput = (parentId: string, childId: string, deleted: 0 | 1): OpInput => ({
  table: 'tag_edge',
  id: tagEdgeId(parentId, childId),
  fields: { parent_id: parentId, child_id: childId, deleted },
});

/** Call inside `lib.lock`: the check and the write that follows must not interleave with another change. */
async function assertCanAddParent(lib: Library, childId: string, parentId: string): Promise<void> {
  if (childId === parentId) throw new TagCycleError('A tag cannot be its own parent');
  if ((await descendantTagIds(lib, childId)).includes(parentId)) {
    throw new TagCycleError('That parent is already below this tag');
  }
}

export async function addParent(lib: Library, childId: string, parentId: string): Promise<void> {
  await lib.lock.run(async () => {
    await assertCanAddParent(lib, childId, parentId);
    await lib.commit([edgeInput(parentId, childId, 0)]);
  });
}

/** Moves a tag from one parent (or the top level) to another in one commit; refuses cycles like `addParent`. */
export async function moveTag(lib: Library, childId: string, fromParentId: string | null, toParentId: string): Promise<void> {
  await lib.lock.run(async () => {
    await assertCanAddParent(lib, childId, toParentId);
    const inputs = [edgeInput(toParentId, childId, 0)];
    if (fromParentId && fromParentId !== toParentId) inputs.push(edgeInput(fromParentId, childId, 1));
    await lib.commit(inputs);
  });
}

export async function removeParent(lib: Library, childId: string, parentId: string): Promise<void> {
  await lib.commit([edgeInput(parentId, childId, 1)]);
}

function taggingInput(target: TaggingTarget, createdAt: number, deleted: 0 | 1): OpInput {
  return {
    table: 'tagging',
    id: taggingId(target.tagId, target.entityType, target.entityId),
    fields: {
      tag_id: target.tagId,
      entity_type: target.entityType,
      entity_id: target.entityId,
      article_id: target.articleId,
      created_at: createdAt,
      deleted,
    },
  };
}

export async function tagEntity(lib: Library, target: TaggingTarget): Promise<void> {
  await lib.commit([taggingInput(target, lib.now(), 0)]);
}

export async function untagEntity(lib: Library, target: TaggingTarget): Promise<void> {
  await lib.commit([taggingInput(target, lib.now(), 1)]);
}

/**
 * Restores the tag invariants after edges or tags arrive from other devices (sync, JSON import):
 * duplicate names merge into the smallest id, then each cycle loses its newest edge.
 */
export async function repairTagGraph(
  lib: Library,
): Promise<{ mergedTags: { keep: string; drop: string[] }[]; removedEdges: string[] }> {
  return lib.lock.run(async () => {
    const mergedTags = planTagMerges(await listTags(lib));
    const redirect = new Map(mergedTags.flatMap((m) => m.drop.map((d) => [d, m.keep] as const)));

    if (redirect.size > 0) {
      const inputs: OpInput[] = [];
      for (const e of await listEdges(lib)) {
        const parent = redirect.get(e.parent_id) ?? e.parent_id;
        const child = redirect.get(e.child_id) ?? e.child_id;
        if (parent === e.parent_id && child === e.child_id) continue;
        inputs.push({ table: 'tag_edge', id: e.id, fields: { deleted: 1 } });
        if (parent !== child) {
          inputs.push({ table: 'tag_edge', id: tagEdgeId(parent, child), fields: { parent_id: parent, child_id: child, deleted: 0 } });
        }
      }
      const dropped = [...redirect.keys()];
      const taggings = await lib.driver.query<TaggingRow>(
        `SELECT id, tag_id, entity_type, entity_id, article_id, created_at FROM tagging WHERE deleted = 0 AND tag_id IN (${dropped.map(() => '?').join(', ')})`,
        dropped,
      );
      for (const t of taggings) {
        inputs.push({ table: 'tagging', id: t.id, fields: { deleted: 1 } });
        const keep = redirect.get(t.tag_id) as string;
        inputs.push(
          taggingInput({ tagId: keep, entityType: t.entity_type, entityId: t.entity_id, articleId: t.article_id }, t.created_at, 0),
        );
      }
      // A merged-away tag lives on in the kept one: erased, not deleted, so it never shows in the Trash (§6.9).
      for (const id of dropped) inputs.push({ table: 'tag', id, fields: { deleted: 2 } });
      await lib.commit(inputs);
    }

    const edges = await listEdges(lib);
    const removedEdges = edgesToBreakCycles(
      edges.map((e) => ({ id: e.id, parent: e.parent_id, child: e.child_id, hlc: e.hlc })),
    );
    if (removedEdges.length > 0) {
      await lib.commit(removedEdges.map((id): OpInput => ({ table: 'tag_edge', id, fields: { deleted: 1 } })));
    }
    return { mergedTags, removedEdges };
  });
}

export interface TaggingRef {
  entityType: EntityType;
  entityId: string;
  tagId: string;
}

/** Live taggings of an article and of the markups and side notes in it (memos are not inside an article). */
export function listArticleTaggings(lib: Library, articleId: string): Promise<TaggingRef[]> {
  return lib.driver.query<TaggingRef>(
    `SELECT entity_type AS entityType, entity_id AS entityId, tag_id AS tagId FROM tagging
     WHERE deleted = 0 AND article_id = ? AND entity_type <> 'memo' ORDER BY created_at, id`,
    [articleId],
  );
}
