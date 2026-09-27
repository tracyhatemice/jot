import { mergeAttributes, Node } from '@tiptap/core';
import type { LinkTargetType } from '@jot/db';

export interface AnchorLinkAttrs {
  linkId: string;
  targetType: LinkTargetType;
  targetId: string;
  articleId: string;
  label: string;
}

const dataAttr = (name: keyof AnchorLinkAttrs, html: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute(html),
  renderHTML: (attrs: Record<string, unknown>) => ({ [html]: attrs[name] }),
});

/** An inline, atomic link chip in a memo that points at a passage (spec §6.5). */
export const AnchorLink = Node.create({
  name: 'anchorLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      linkId: dataAttr('linkId', 'data-link-id'),
      targetType: dataAttr('targetType', 'data-target-type'),
      targetId: dataAttr('targetId', 'data-target-id'),
      articleId: dataAttr('articleId', 'data-article-id'),
      label: dataAttr('label', 'data-label'),
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-anchor-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-anchor-link': '', class: 'anchor-chip' }), String(node.attrs.label ?? '')];
  },

  renderText({ node }) {
    return String(node.attrs.label ?? '');
  },
});
