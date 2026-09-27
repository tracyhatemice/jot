// @vitest-environment happy-dom
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { AnchorLink } from './anchorLink';
import { MemoBridge, type LinkTarget } from './bridge';

const link: LinkTarget = { targetType: 'markup', targetId: 'm1', articleId: 'a1', label: '比喻' };
const editors: Editor[] = [];
const newEditor = () => {
  const editor = new Editor({ extensions: [StarterKit, AnchorLink], content: '<p>札记</p>' });
  editors.push(editor);
  return editor;
};
const chips = (editor: Editor): JSONContent[] =>
  ((editor.getJSON() as JSONContent).content ?? []).flatMap((b) => b.content ?? []).filter((n) => n.type === 'anchorLink');

afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

describe('MemoBridge', () => {
  it('inserts a chip with a fresh link id into the attached editor', () => {
    const bridge = new MemoBridge();
    const editor = newEditor();
    bridge.attachEditor(editor);
    bridge.insertLink(link);
    bridge.insertLink(link);
    const found = chips(editor);
    expect(found).toHaveLength(2);
    expect(found[0].attrs).toMatchObject(link);
    expect(found[0].attrs?.linkId).not.toBe(found[1].attrs?.linkId);
  });

  it('asks for a new memo when none is open, then inserts once an editor attaches', () => {
    const bridge = new MemoBridge();
    let requests = 0;
    bridge.onCreateMemo(() => requests++);
    bridge.insertLink(link);
    expect(requests).toBe(1);
    const editor = newEditor();
    bridge.attachEditor(editor);
    expect(chips(editor)).toHaveLength(1);
  });

  it('adds a link at the end of a memo the writer has not clicked into yet', () => {
    const bridge = new MemoBridge();
    const editor = newEditor();
    bridge.attachEditor(editor);
    bridge.insertLink(link);
    const first = ((editor.getJSON() as JSONContent).content ?? [])[0]?.content ?? [];
    expect(first.map((n) => n.type)).toEqual(['text', 'anchorLink', 'text']);
    expect(first[0].text).toBe('札记');
  });

  it('forwards requests to show a memo', () => {
    const bridge = new MemoBridge();
    const shown: string[] = [];
    bridge.onOpenMemo((id) => shown.push(id));
    bridge.showMemo('memo-1');
    expect(shown).toEqual(['memo-1']);
  });
});
