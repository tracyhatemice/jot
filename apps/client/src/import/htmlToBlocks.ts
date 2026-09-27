import { normalizeBlocks, type Block, type BlockKind, type Run } from '@jot/core';

const BLOCK_KIND: Record<string, BlockKind> = {
  P: 'p', DIV: 'p', SECTION: 'p', ARTICLE: 'p', MAIN: 'p', HEADER: 'p', FOOTER: 'p', ASIDE: 'p', PRE: 'p',
  TABLE: 'p', TR: 'p', UL: 'p', OL: 'p', DL: 'p', DT: 'p', DD: 'p', FIGCAPTION: 'p', CAPTION: 'p',
  H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3',
  BLOCKQUOTE: 'quote', LI: 'li',
};

const SKIPPED = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK', 'IFRAME', 'OBJECT', 'EMBED',
  'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG',
]);

type Marks = Pick<Run, 'b' | 'i'>;

/**
 * Pasted or converted HTML → the article block model (spec §6.1). Only text, block structure and
 * bold/italic survive. The input is parsed with DOMParser (which never runs scripts or loads media)
 * and is never rendered as HTML, so hostile markup stays inert.
 */
export function htmlToBlocks(html: string): Block[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const blocks: Block[] = [];
  let current: Block | null = null;

  const target = (kind: BlockKind): Block => {
    if (!current) {
      current = { k: kind, runs: [] };
      blocks.push(current);
    }
    return current;
  };

  const walk = (node: Node, marks: Marks, kind: BlockKind): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').replace(/[ \t\r\f]+/g, ' ');
      if (t) target(kind).runs.push({ t, ...marks });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toUpperCase();
    if (SKIPPED.has(tag)) return;
    if (tag === 'BR') {
      current = null;
      return;
    }
    const inner: Marks =
      tag === 'B' || tag === 'STRONG' ? { ...marks, b: true } : tag === 'I' || tag === 'EM' ? { ...marks, i: true } : marks;
    const blockKind = BLOCK_KIND[tag];
    if (!blockKind) {
      node.childNodes.forEach((child) => walk(child, inner, kind));
      return;
    }
    // A paragraph inside a quote or list item keeps the outer kind.
    const k: BlockKind = blockKind === 'p' && (kind === 'quote' || kind === 'li') ? kind : blockKind;
    current = null;
    node.childNodes.forEach((child) => walk(child, inner, k));
    current = null;
  };

  body.childNodes.forEach((child) => walk(child, {}, 'p'));
  return normalizeBlocks(blocks);
}
