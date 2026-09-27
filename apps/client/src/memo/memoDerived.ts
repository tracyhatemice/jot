import type { LinkTargetType, MemoDerived, MemoLinkInput } from '@jot/db';
import type { JSONContent } from '@tiptap/core';

const TARGET_TYPES: readonly string[] = ['anchor', 'markup', 'side_note'];

/** Searchable plain text (chips contribute their labels) and every link chip of a memo document. */
export function memoDerived(doc: JSONContent): MemoDerived {
  const blocks: string[] = [];
  const links: MemoLinkInput[] = [];

  const inline = (node: JSONContent): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'anchorLink') {
      const a = node.attrs ?? {};
      if (a.linkId && a.targetId && a.articleId && TARGET_TYPES.includes(String(a.targetType))) {
        links.push({
          nodeId: String(a.linkId),
          targetType: a.targetType as LinkTargetType,
          targetId: String(a.targetId),
          articleId: String(a.articleId),
        });
      }
      return String(a.label ?? '');
    }
    return (node.content ?? []).map(inline).join('');
  };

  const walk = (node: JSONContent): void => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      blocks.push(inline(node));
      return;
    }
    (node.content ?? []).forEach(walk);
  };

  walk(doc);
  return { text: blocks.filter((b) => b.trim() !== '').join('\n'), links };
}
