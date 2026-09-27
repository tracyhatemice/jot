import { v7 as uuidv7 } from 'uuid';
import type { EntityType } from './entities';

/** Time-ordered UUIDv7 for every synced row. */
export function newId(): string {
  return uuidv7();
}

/** 16 lowercase hex chars; identifies this device inside HLC strings. */
export function newDeviceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Deterministic ids: the same relationship created on two devices converges on one row. */
export function tagEdgeId(parentId: string, childId: string): string {
  return `e:${parentId}:${childId}`;
}

export function taggingId(tagId: string, entityType: EntityType, entityId: string): string {
  return `t:${tagId}:${entityType}:${entityId}`;
}
