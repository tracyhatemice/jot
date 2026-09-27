import { blockText, plainTextToBlocks, type Block } from '@jot/core';
import type { ImportKind } from '@jot/db';
import { htmlToBlocks } from './htmlToBlocks';
import { markdownToBlocks } from './markdown';

export type ImportSource = { kind: 'paste'; text: string; html?: string } | { kind: 'file'; name: string; text: string };

export interface ImportDraft {
  title: string;
  blocks: Block[];
  importKind: ImportKind;
}

export class UnsupportedFileError extends Error {
  constructor(name: string) {
    super(`Unsupported file: ${name}`);
    this.name = 'UnsupportedFileError';
  }
}

const withoutBom = (text: string) => text.replace(/^\u{FEFF}/u, '');

function headingTitle(blocks: Block[]): string | null {
  const heading = blocks.find((b) => b.k === 'h1');
  return heading ? blockText(heading) : null;
}

/** What an import would create, before anything is saved (the dialog previews it). */
export function draftFromSource(source: ImportSource): ImportDraft {
  const text = withoutBom(source.text);
  if (source.kind === 'paste') {
    const fromHtml = source.html ? htmlToBlocks(source.html) : [];
    const blocks = fromHtml.length > 0 ? fromHtml : plainTextToBlocks(text);
    return { title: headingTitle(blocks) ?? '', blocks, importKind: 'paste' };
  }
  const dot = source.name.lastIndexOf('.');
  const ext = dot >= 0 ? source.name.slice(dot + 1).toLowerCase() : '';
  const stem = dot > 0 ? source.name.slice(0, dot) : source.name;
  if (ext === 'md' || ext === 'markdown') {
    const blocks = markdownToBlocks(text);
    return { title: headingTitle(blocks) ?? stem, blocks, importKind: 'md' };
  }
  if (ext === 'txt' || ext === 'text' || ext === '') {
    return { title: stem, blocks: plainTextToBlocks(text), importKind: 'txt' };
  }
  throw new UnsupportedFileError(source.name);
}
