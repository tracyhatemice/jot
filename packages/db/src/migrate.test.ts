import { describe, expect, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { migrate } from './migrate';
import { migrations } from './migrations';

const tableNames = async (d: ReturnType<typeof createNodeDriver>) =>
  (await d.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name);

describe('migrate', () => {
  it('creates the full schema on a fresh database', async () => {
    const d = createNodeDriver();
    expect(await migrate(d)).toBe(1);
    expect(await tableNames(d)).toEqual(
      expect.arrayContaining([
        'article', 'article_revision', 'anchor', 'markup', 'side_note', 'memo', 'memo_update',
        'tag', 'tag_edge', 'tagging', 'outbox', 'kv', 'anchor_res', 'memo_link', 'memo_cache',
        'search_doc', 'search_fts',
      ]),
    );
  });

  it('is a no-op when already current', async () => {
    const d = createNodeDriver();
    await migrate(d);
    expect(await migrate(d)).toBe(1);
  });

  it('leaves the database untouched when a migration fails', async () => {
    const d = createNodeDriver();
    await migrate(d);
    const broken = [...migrations, { version: 2, statements: ['CREATE TABLE partial (x)', 'CREATE TABLE broken ('] }];
    await expect(migrate(d, broken)).rejects.toThrow();
    const [row] = await d.query<{ user_version: number }>('PRAGMA user_version');
    expect(row.user_version).toBe(1);
    expect(await tableNames(d)).not.toContain('partial');
  });
});
