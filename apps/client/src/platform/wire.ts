import { base64ToBytes, bytesToBase64, type SqlValue } from '@jot/core';
import type { Row } from '@jot/db';

/** How SqlValues cross the Tauri IPC bridge (JSON): blobs travel as { $blob: base64 }. */
export type WireValue = null | number | string | { $blob: string };

export function toWire(value: SqlValue): WireValue {
  if (value instanceof Uint8Array) return { $blob: bytesToBase64(value) };
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new RangeError(`integer ${value} is too large for the desktop driver`);
    }
    return Number(value);
  }
  return value;
}

export function fromWireRow(row: Record<string, WireValue>): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value !== null && typeof value === 'object' ? base64ToBytes(value.$blob) : value;
  }
  return out;
}
