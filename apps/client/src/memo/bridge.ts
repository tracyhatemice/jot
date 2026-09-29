import { newId } from '@jot/core';
import type { Editor } from '@tiptap/core';
import type { AnchorLinkAttrs } from './anchorLink';

export type LinkTarget = Omit<AnchorLinkAttrs, 'linkId'>;

/** Inserts a link chip (and a space after it) at the memo's cursor, or at the end of the memo. */
export function insertLink(editor: Editor, link: LinkTarget, at: 'cursor' | 'end' = 'cursor'): void {
  editor
    .chain()
    .focus(at === 'end' ? 'end' : undefined)
    .insertContent([
      { type: 'anchorLink', attrs: { ...link, linkId: newId() } },
      { type: 'text', text: ' ' },
    ])
    .run();
}

/**
 * Connects the article column, which creates links, with the memo column, which owns the editor.
 * With no memo open, a link is queued and the memo column is asked to create one.
 */
export class MemoBridge {
  private editor: Editor | null = null;
  /** Whether the attached editor has a cursor the writer placed; until then links go at the end. */
  private placed = false;
  private unwatch: (() => void) | null = null;
  private pending: LinkTarget[] = [];
  private createMemo: (() => void) | null = null;
  private openMemo: ((memoId: string) => void) | null = null;
  private keepOpenMemo: ((memoId: string) => void) | null = null;
  private reveal: (() => void) | null = null;

  attachEditor(editor: Editor | null): void {
    this.unwatch?.();
    this.unwatch = null;
    this.editor = editor;
    this.placed = false;
    if (!editor) return;
    const onFocus = () => {
      this.placed = true;
    };
    editor.on('focus', onFocus);
    this.unwatch = () => editor.off('focus', onFocus);
    for (const link of this.pending.splice(0)) this.insert(editor, link);
  }

  onCreateMemo(handler: (() => void) | null): void {
    this.createMemo = handler;
  }

  onOpenMemo(handler: ((memoId: string) => void) | null): void {
    this.openMemo = handler;
  }

  onKeepMemo(handler: ((memoId: string) => void) | null): void {
    this.keepOpenMemo = handler;
  }

  /** Slides the floating memo column in (spec §6.13): on quoting a passage and on opening a memo. */
  onReveal(handler: (() => void) | null): void {
    this.reveal = handler;
  }

  insertLink(link: LinkTarget): void {
    this.reveal?.();
    if (this.editor && !this.editor.isDestroyed) {
      this.insert(this.editor, link);
      return;
    }
    this.pending.push(link);
    this.createMemo?.();
  }

  showMemo(memoId: string): void {
    this.reveal?.();
    this.openMemo?.(memoId);
  }

  /** Keeps a memo's tab: a double click on its row or its preview tab (spec §6.13). */
  keepMemo(memoId: string): void {
    this.keepOpenMemo?.(memoId);
  }

  private insert(editor: Editor, link: LinkTarget): void {
    insertLink(editor, link, this.placed ? 'cursor' : 'end');
    this.placed = true;
  }
}
