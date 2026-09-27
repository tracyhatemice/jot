import {
  decodeExport, encodeExport, exportLibrary, importLibrary, InvalidExportError, liveMemoIds, refreshMemoDerived, type ImportSummary, type Library,
} from '@jot/db';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { memoDerived } from '../memo/memoDerived';
import { openMemoDoc } from '../memo/openMemoDoc';

const pad = (n: number) => String(n).padStart(2, '0');

/** For example `jot-library-20260927-0905.json`, in local time. */
export function exportFileName(kind: 'library' | 'backup', date = new Date()): string {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return kind === 'library' ? `jot-library-${stamp}.json` : `jot-backup-${stamp}.sqlite`;
}

export async function exportLibraryText(lib: Library): Promise<string> {
  return encodeExport(await exportLibrary(lib));
}

/**
 * Imports an exported library (spec §6.7), then rebuilds every memo's links and text from its document —
 * the database can't read Yjs documents, so this part lives here, as does refusing damaged memo updates
 * before anything is written (a stored update can't be taken back).
 */
export async function importLibraryText(lib: Library, text: string): Promise<ImportSummary> {
  const data = decodeExport(text);
  for (const row of data.rows) {
    if (row.table !== 'memo_update') continue;
    try {
      Y.decodeUpdate(row.fields.data as Uint8Array);
    } catch {
      throw new InvalidExportError(`damaged memo update ${row.id}`);
    }
  }
  const summary = await importLibrary(lib, data);
  for (const id of await liveMemoIds(lib)) {
    const doc = await openMemoDoc(lib, id);
    await refreshMemoDerived(lib, id, memoDerived(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default'))));
  }
  lib.announce();
  return summary;
}
