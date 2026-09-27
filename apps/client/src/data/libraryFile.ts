import { decodeExport, encodeExport, exportLibrary, importLibrary, liveMemoIds, refreshMemoDerived, type ImportSummary, type Library } from '@jot/db';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
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
 * the database can't read Yjs documents, so this part lives here.
 */
export async function importLibraryText(lib: Library, text: string): Promise<ImportSummary> {
  const summary = await importLibrary(lib, decodeExport(text));
  for (const id of await liveMemoIds(lib)) {
    const doc = await openMemoDoc(lib, id);
    await refreshMemoDerived(lib, id, memoDerived(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default'))));
  }
  lib.announce();
  return summary;
}
