import type { Block, BlockKind, Run } from '@jot/core';
import { Schema, type Mark, type Node as PMNode } from 'prosemirror-model';

/**
 * Flat textblocks only. Each block contributes its text plus an open and a close token (2),
 * exactly like the "\n\n" between blocks in the canonical text, so pos = offset + 1 everywhere.
 */
export const articleSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', marks: '_', toDOM: () => ['p', 0] },
    heading: {
      group: 'block',
      content: 'text*',
      marks: '_',
      attrs: { level: { default: 1 } },
      toDOM: (node) => [`h${node.attrs.level as number}`, 0],
    },
    quote: { group: 'block', content: 'text*', marks: '_', toDOM: () => ['blockquote', 0] },
    list_item: { group: 'block', content: 'text*', marks: '_', toDOM: () => ['div', { class: 'li' }, 0] },
    text: {},
  },
  marks: {
    strong: { toDOM: () => ['strong', 0] },
    em: { toDOM: () => ['em', 0] },
  },
});

function marksOf(run: Run): Mark[] {
  const marks: Mark[] = [];
  if (run.b) marks.push(articleSchema.marks.strong.create());
  if (run.i) marks.push(articleSchema.marks.em.create());
  return marks;
}

export function blocksToDoc(blocks: Block[]): PMNode {
  const { nodes } = articleSchema;
  const children = blocks.map((block) => {
    const content = block.runs.filter((r) => r.t.length > 0).map((r) => articleSchema.text(r.t, marksOf(r)));
    switch (block.k) {
      case 'h1':
      case 'h2':
      case 'h3':
        return nodes.heading.create({ level: Number(block.k[1]) }, content);
      case 'quote':
        return nodes.quote.create(null, content);
      case 'li':
        return nodes.list_item.create(null, content);
      default:
        return nodes.paragraph.create(null, content);
    }
  });
  return nodes.doc.create(null, children.length > 0 ? children : [nodes.paragraph.create()]);
}

export const offsetToPos = (offset: number): number => offset + 1;
export const posToOffset = (pos: number): number => pos - 1;

/** The inverse of `blocksToDoc`: the edited document as blocks (run through `normalizeBlocks` before saving). */
export function docToBlocks(doc: PMNode): Block[] {
  const { nodes, marks } = articleSchema;
  const blocks: Block[] = [];
  doc.forEach((node) => {
    const k: BlockKind =
      node.type === nodes.heading
        ? (`h${Math.min(3, Math.max(1, Number(node.attrs.level)))}` as BlockKind)
        : node.type === nodes.quote
          ? 'quote'
          : node.type === nodes.list_item
            ? 'li'
            : 'p';
    const runs: Run[] = [];
    node.forEach((child) => {
      if (!child.isText || !child.text) return;
      const bold = child.marks.some((m) => m.type === marks.strong);
      const italic = child.marks.some((m) => m.type === marks.em);
      runs.push({ t: child.text, ...(bold ? { b: true } : {}), ...(italic ? { i: true } : {}) });
    });
    blocks.push({ k, runs });
  });
  return blocks;
}
