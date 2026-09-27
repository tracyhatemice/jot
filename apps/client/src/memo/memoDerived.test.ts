// @vitest-environment happy-dom
import { getSchema, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AnchorLink } from './anchorLink';
import { memoDerived } from './memoDerived';

const chip = (linkId: string, label: string): JSONContent => ({
  type: 'anchorLink',
  attrs: { linkId, targetType: 'markup', targetId: 'm1', articleId: 'a1', label },
});

const doc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '结构' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '开头用' }, chip('l1', '比喻'), { type: 'text', text: '点题。' }] },
    { type: 'paragraph' },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [chip('l1', '比喻')] }] }] },
  ],
};

describe('memoDerived', () => {
  it('extracts searchable text (chips contribute their labels) and every link', () => {
    const derived = memoDerived(doc);
    expect(derived.text).toBe('结构\n开头用比喻点题。\n比喻');
    expect(derived.links).toEqual([
      { nodeId: 'l1', targetType: 'markup', targetId: 'm1', articleId: 'a1' },
      { nodeId: 'l1', targetType: 'markup', targetId: 'm1', articleId: 'a1' },
    ]);
  });

  it('ignores chips with unknown target types', () => {
    const bad: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'anchorLink', attrs: { linkId: 'x', targetType: 'url', targetId: 't', articleId: 'a', label: 'L' } }] }] };
    expect(memoDerived(bad).links).toEqual([]);
  });

  it('survives the Yjs round trip that the editor uses to store memos', () => {
    const schema = getSchema([StarterKit, AnchorLink]);
    const ydoc = new Y.Doc();
    prosemirrorJSONToYXmlFragment(schema, doc, ydoc.getXmlFragment('default'));
    expect(memoDerived(yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment('default')))).toEqual(memoDerived(doc));
  });
});
