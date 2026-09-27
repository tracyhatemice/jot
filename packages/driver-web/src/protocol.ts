import type { Row, SqlValue, Stmt } from '@jot/db';

export type WorkerRequest =
  | { id: number; method: 'open'; filename: string }
  | { id: number; method: 'query'; sql: string; params?: SqlValue[] }
  | { id: number; method: 'batch'; stmts: Stmt[] };

export type WorkerResponse = { id: number; ok: true; result: Row[] | null } | { id: number; ok: false; error: string };

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
