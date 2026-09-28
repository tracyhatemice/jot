import { detectLang } from '@jot/core';
import { mergeAttributes, Node } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import type { LinkTargetType } from '@jot/db';
import { apostropheParts } from '../reading/apostrophes';

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

  // The label quotes its article, so it is drawn in its own language whatever the memo's: that language's
  // punctuation, and in Chinese its apostrophes in English words keep the English face (spec §6.11).
  renderHTML({ node, HTMLAttributes }) {
    const label = String(node.attrs.label ?? '');
    const chinese = detectLang(label) === 'zh';
    const attrs = mergeAttributes(HTMLAttributes, { 'data-anchor-link': '', class: 'anchor-chip', lang: chinese ? 'zh-CN' : 'en' });
    return ['span', attrs, ...(chinese ? apostropheParts(label) : [label])] as DOMOutputSpec;
  },

  renderText({ node }) {
    return String(node.attrs.label ?? '');
  },
});
