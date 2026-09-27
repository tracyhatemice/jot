/** A value SQLite can store; blobs are Uint8Array. Shared by ops (core) and drivers (db). */
export type SqlValue = null | number | bigint | string | Uint8Array;
