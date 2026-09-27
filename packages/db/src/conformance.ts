import { buildFtsQuery, normalizeForIndex } from '@jot/core';
import type { SqlDriver } from './driver';

/**
 * Behaviour every SqlDriver must have. Runs in Vitest (Node drivers) and on the diagnostics
 * screen (OPFS and Tauri drivers). Uses only temp tables so it never touches library data.
 */
export interface ConformanceCase {
  name: string;
  run(driver: SqlDriver): Promise<void>;
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const FTS_ROWS: [number, string][] = [
  [1, '他用比喻写春天。'],
  [2, 'Writers love a good metaphor. Café culture.'],
  [3, '比方说，喻体不同。'],
];

async function createFts(driver: SqlDriver): Promise<(input: string) => Promise<number[]>> {
  await driver.batch([
    { sql: 'DROP TABLE IF EXISTS temp.conf_fts' },
    {
      sql: "CREATE VIRTUAL TABLE temp.conf_fts USING fts5(body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')",
    },
    ...FTS_ROWS.map(([rowid, body]) => ({
      sql: 'INSERT INTO temp.conf_fts (rowid, body) VALUES (?, ?)',
      params: [rowid, normalizeForIndex(body)],
    })),
  ]);
  return async (input) => {
    const query = buildFtsQuery(input);
    if (query === null) return [];
    const rows = await driver.query<{ rowid: number }>(
      'SELECT rowid FROM temp.conf_fts WHERE conf_fts MATCH ? ORDER BY rowid',
      [query],
    );
    return rows.map((r) => Number(r.rowid));
  };
}

const dropFts = (driver: SqlDriver) => driver.batch([{ sql: 'DROP TABLE IF EXISTS temp.conf_fts' }]);
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export const conformanceCases: ConformanceCase[] = [
  {
    name: 'SQLite is 3.43 or newer',
    async run(d) {
      const [row] = await d.query<{ v: string }>('SELECT sqlite_version() AS v');
      const [major, minor] = row.v.split('.').map(Number);
      check(major > 3 || (major === 3 && minor >= 43), `SQLite ${row.v} is older than 3.43`);
    },
  },
  {
    name: 'binds and returns null, integer, real, text and blob',
    async run(d) {
      const blob = new Uint8Array([0, 1, 254, 255]);
      const [r] = await d.query<{ n: null; i: number; f: number; t: string; b: Uint8Array }>(
        'SELECT ? AS n, ? AS i, ? AS f, ? AS t, ? AS b',
        [null, 1727430000123, 1.5, '中文 text 😀', blob],
      );
      check(r.n === null, `null came back as ${String(r.n)}`);
      check(r.i === 1727430000123, `integer came back as ${String(r.i)} (${typeof r.i})`);
      check(r.f === 1.5, `real came back as ${String(r.f)}`);
      check(r.t === '中文 text 😀', `text came back as ${String(r.t)}`);
      check(r.b instanceof Uint8Array && [...r.b].join() === '0,1,254,255', `blob came back as ${String(r.b)}`);
    },
  },
  {
    name: 'invalid SQL rejects instead of throwing synchronously',
    async run(d) {
      let rejected = false;
      await d.query('SELEC 1').catch(() => {
        rejected = true;
      });
      check(rejected, 'invalid SQL did not reject');
    },
  },
  {
    name: 'batch rolls back entirely when a statement fails',
    async run(d) {
      await d.batch([
        { sql: 'DROP TABLE IF EXISTS temp.conf_atomic' },
        { sql: 'CREATE TEMP TABLE conf_atomic (x INTEGER PRIMARY KEY)' },
      ]);
      let failed = false;
      try {
        await d.batch([
          { sql: 'INSERT INTO temp.conf_atomic VALUES (1)' },
          { sql: 'INSERT INTO temp.conf_atomic VALUES (1)' },
        ]);
      } catch {
        failed = true;
      }
      const rows = await d.query('SELECT x FROM temp.conf_atomic');
      await d.batch([{ sql: 'DROP TABLE temp.conf_atomic' }]);
      check(failed, 'a duplicate primary key did not fail the batch');
      check(rows.length === 0, `expected a rollback, found ${rows.length} row(s)`);
    },
  },
  {
    name: 'JSON functions are available',
    async run(d) {
      const [r] = await d.query<{ a: string; b: string; n: number }>(
        `SELECT json_extract(json_set('{"x":{}}', '$.x.z', 'hi'), '$.x.z') AS a,
                json_object('k', 'v') AS b,
                (SELECT count(*) FROM json_each('[1,2,3]')) AS n`,
      );
      check(r.a === 'hi' && r.b === '{"k":"v"}' && r.n === 3, `JSON functions returned ${JSON.stringify(r)}`);
    },
  },
  {
    name: 'FTS5 contentless-delete tables support bm25 and deletes',
    async run(d) {
      const match = await createFts(d);
      const scored = await d.query<{ rowid: number; score: number }>(
        'SELECT rowid, bm25(conf_fts) AS score FROM temp.conf_fts WHERE conf_fts MATCH ?',
        [buildFtsQuery('比') as string],
      );
      check(scored.length === 2 && scored.every((r) => typeof r.score === 'number'), `bm25 returned ${JSON.stringify(scored)}`);
      await d.batch([{ sql: 'DELETE FROM temp.conf_fts WHERE rowid = ?', params: [1] }]);
      const after = await match('比喻');
      await dropFts(d);
      check(after.length === 0, `deleted row still matches: ${after.join()}`);
    },
  },
  {
    name: 'Chinese 1- and 2-character queries match adjacent characters only',
    async run(d) {
      const match = await createFts(d);
      const results = {
        '比喻': await match('比喻'),
        '喻': await match('喻'),
        '比喻 春天': await match('比喻 春天'),
        writ: await match('writ'),
        CAFE: await match('CAFE'),
      };
      await dropFts(d);
      check(same(results['比喻'], [1]), `"比喻" matched ${results['比喻'].join()}`);
      check(same(results['喻'], [1, 3]), `"喻" matched ${results['喻'].join()}`);
      check(same(results['比喻 春天'], [1]), `"比喻 春天" matched ${results['比喻 春天'].join()}`);
      check(same(results.writ, [2]), `"writ" matched ${results.writ.join()}`);
      check(same(results.CAFE, [2]), `"CAFE" matched ${results.CAFE.join()}`);
    },
  },
  {
    name: 'recursive CTEs terminate on cycles',
    async run(d) {
      const rows = await d.query<{ id: string }>(
        `WITH RECURSIVE e(p, c) AS (VALUES ('a', 'b'), ('b', 'c'), ('c', 'a')),
         d(id) AS (SELECT 'a' UNION SELECT e.c FROM e JOIN d ON e.p = d.id)
         SELECT id FROM d ORDER BY id`,
      );
      check(rows.map((r) => r.id).join() === 'a,b,c', `got ${rows.map((r) => r.id).join()}`);
    },
  },
];
