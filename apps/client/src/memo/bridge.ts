import { newId } from '@jot/core';
import type { Editor } from '@tiptap/core';
import type { AnchorLinkAttrs } from './anchorLink';

export type LinkTarget = Omit<AnchorLinkAttrs, 'linkId'>;

/** Inserts a link chip (and a space after it) at the memo's cursor. */
export function insertLink(editor: Editor, link: LinkTarget): void {
  editor
    .chain()
    .focus()
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
  private pending: LinkTarget[] = [];
  private createMemo: (() => void) | null = null;
  private openMemo: ((memoId: string) => void) | null = null;

  attachEditor(editor: Editor | null): void {
    this.editor = editor;
    if (editor && this.pending.length > 0) {
      for (const link of this.pending.splice(0)) insertLink(editor, link);
    }
  }

  onCreateMemo(handler: (() => void) | null): void {
    this.createMemo = handler;
  }

  onOpenMemo(handler: ((memoId: string) => void) | null): void {
    this.openMemo = handler;
  }

  insertLink(link: LinkTarget): void {
    if (this.editor && !this.editor.isDestroyed) {
      insertLink(this.editor, link);
      return;
    }
    this.pending.push(link);
    this.createMemo?.();
  }

  showMemo(memoId: string): void {
    this.openMemo?.(memoId);
  }
}
