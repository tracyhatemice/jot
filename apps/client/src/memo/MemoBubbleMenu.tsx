import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/extension-bubble-menu';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface Item {
  key: string;
  label:
    | 'memo.fmtBold' | 'memo.fmtItalic' | 'memo.fmtStrike' | 'memo.fmtH1' | 'memo.fmtH2' | 'memo.fmtH3'
    | 'memo.fmtBullet' | 'memo.fmtOrdered' | 'memo.fmtQuote';
  text: string;
  run(editor: Editor): void;
  active(editor: Editor): boolean;
}

const ITEMS: readonly Item[] = [
  { key: 'bold', label: 'memo.fmtBold', text: 'B', run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
  { key: 'italic', label: 'memo.fmtItalic', text: 'I', run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
  { key: 'strike', label: 'memo.fmtStrike', text: 'S', run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive('strike') },
  { key: 'h1', label: 'memo.fmtH1', text: 'H1', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive('heading', { level: 1 }) },
  { key: 'h2', label: 'memo.fmtH2', text: 'H2', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive('heading', { level: 2 }) },
  { key: 'h3', label: 'memo.fmtH3', text: 'H3', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive('heading', { level: 3 }) },
  { key: 'bullet', label: 'memo.fmtBullet', text: '•', run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
  { key: 'ordered', label: 'memo.fmtOrdered', text: '1.', run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
  { key: 'quote', label: 'memo.fmtQuote', text: '❝', run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive('blockquote') },
];

/**
 * The formatting menu's plugin, for the memo editor's extensions: it shows `element` for a text selection, not
 * for a selected link chip. The memo column scrolls, not the window: the menu follows it, and hides once its text
 * scrolls out of sight.
 */
export function memoBubbleMenu(element: HTMLElement, column: HTMLElement | null) {
  element.className = 'bubble-menu';
  element.dataset.testid = 'memo-bubble';
  element.style.visibility = 'hidden';
  element.style.position = 'absolute';
  return BubbleMenu.configure({
    element,
    shouldShow: ({ state }) => !state.selection.empty && !(state.selection instanceof NodeSelection),
    options: { scrollTarget: column ?? window, hide: true },
  });
}

/** Formatting for a text selection in a memo (spec §6.11): the buttons of the menu `memoBubbleMenu` shows. */
export function MemoBubbleMenu({ editor, element }: { editor: Editor; element: HTMLElement }) {
  const { t } = useTranslation();
  const active = useEditorState({ editor, selector: ({ editor: e }) => ITEMS.map((item) => (e ? item.active(e) : false)) });
  return createPortal(
    ITEMS.map((item, i) => (
      <button
        key={item.key}
        type="button"
        className={active[i] ? 'active' : undefined}
        aria-pressed={active[i]}
        aria-label={t(item.label)}
        title={t(item.label)}
        onClick={() => item.run(editor)}
        data-testid={`fmt-${item.key}`}
      >
        {item.text}
      </button>
    )),
    element,
  );
}
