/**
 * Bytes of a text file → string. UTF-16 when a byte-order mark says so; otherwise strict UTF-8
 * (a UTF-8 BOM is dropped), falling back to GB18030 — a superset of GBK, the usual encoding of
 * Chinese text files saved on Windows.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}
