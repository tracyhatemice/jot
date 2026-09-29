import { Schema, type Node as PMNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { apostropheOffsets, apostropheParts, apostropheRanges, latinApostrophes } from './apostrophes';

/** Enough of a memo's schema: quotes, lists, line breaks, link chips and bold. */
const schema = new Schema({
  marks: { bold: {} },
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    blockquote: { group: 'block', content: 'block+' },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: 'paragraph+' },
    text: { group: 'inline' },
    hardBreak: { group: 'inline', inline: true },
    chip: { group: 'inline', inline: true, atom: true, attrs: { label: { default: '' } } },
  },
});
const { paragraph, blockquote, bulletList, listItem, hardBreak, chip } = schema.nodes;
const text = (t: string) => schema.text(t);
const doc = (...blocks: PMNode[]) => schema.node('doc', null, blocks);

describe('apostrophes in Chinese text', () => {
  it('finds ’ used as an apostrophe in or after an English word', () => {
    expect(apostropheOffsets('Shakespeare’s')).toEqual([11]);
    expect(apostropheOffsets('他说 don’t 了')).toEqual([6]);
    expect(apostropheOffsets('the students’ essays')).toEqual([12]);
    expect(apostropheOffsets('O’Neill')).toEqual([1]);
    expect(apostropheOffsets('the 1990’s')).toEqual([8]);
  });

  it('leaves Chinese single quotation marks to the Chinese face, also around English words', () => {
    expect(apostropheOffsets('“他说：‘我不去。’”')).toEqual([]);
    expect(apostropheOffsets('他说：‘OK’。')).toEqual([]);
    expect(apostropheOffsets('‘I don’t know’')).toEqual([6]);
  });
});

describe('apostrophes in a document', () => {
  it('reads the rule’s edge cases: a closed ‘…’ around an English word, and ’ at the start of a paragraph', () => {
    expect(apostropheOffsets('‘students’')).toEqual([]);
    expect(apostropheOffsets('’s 很重要')).toEqual([]);
  });

  it('finds them in quotes and lists, and right after a link chip to an English word', () => {
    expect(apostropheRanges(doc(paragraph.create(null, text('don’t'))))).toEqual([{ from: 4, to: 5 }]);
    expect(apostropheRanges(doc(blockquote.create(null, paragraph.create(null, text('it’s')))))).toEqual([{ from: 4, to: 5 }]);
    expect(apostropheRanges(doc(bulletList.create(null, listItem.create(null, paragraph.create(null, text('O’Neill'))))))).toEqual([
      { from: 4, to: 5 },
    ]);
    expect(apostropheRanges(doc(paragraph.create(null, [chip.create({ label: 'Shakespeare' }), text('’s')])))).toEqual([{ from: 2, to: 3 }]);
  });

  it('treats a ’ after a Chinese chip or a line break as a quotation mark', () => {
    expect(apostropheRanges(doc(paragraph.create(null, [chip.create({ label: '春风' }), text('’')])))).toEqual([]);
    expect(apostropheRanges(doc(paragraph.create(null, [text('don'), hardBreak.create(), text('’t')])))).toEqual([]);
  });

  it('splits a text around its apostrophes, for a chip’s label', () => {
    expect(apostropheParts('他引用 Shakespeare’s 名句')).toEqual(['他引用 Shakespeare', ['span', { class: 'latin-apostrophe' }, '’'], 's 名句']);
    expect(apostropheParts('春风')).toEqual(['春风']);
    expect(apostropheParts('')).toEqual(['']);
  });
});

/** A small seeded random generator, so every run makes the same edits. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The marks the plugin gives the editor. */
const marked = (state: EditorState) =>
  (state.plugins[0].props.decorations as (this: unknown, s: EditorState) => DecorationSet)
    .call(state.plugins[0], state)
    .find()
    .map((d) => ({ from: d.from, to: d.to }))
    .sort((a, b) => a.from - b.from);

/** The text blocks of a document with their positions. */
const blocks = (d: PMNode) => {
  const out: { pos: number; node: PMNode }[] = [];
  d.descendants((node, pos) => {
    if (node.isTextblock) out.push({ pos, node });
    return !node.isTextblock;
  });
  return out;
};

describe('the apostrophe marks while editing', () => {
  it('stay what a full rescan finds, through random edits of every kind (guard, review N4)', () => {
    const next = random(7);
    const pick = <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)];
    // Quotes, a list and a chip; a whole-document replace brings them back, so they keep being edited.
    const fixture = () =>
      doc(
        paragraph.create(null, text('他说 don’t 了')),
        blockquote.create(null, paragraph.create(null, [chip.create({ label: 'Shakespeare' }), text('’s 名句')])),
        bulletList.create(null, [
          listItem.create(null, paragraph.create(null, text('‘OK’ 和 O’Neill'))),
          listItem.create(null, paragraph.create(null, text('it’s 春'))),
        ]),
      );
    let state = EditorState.create({ doc: fixture(), plugins: [latinApostrophes(() => true)] });
    /** A random position inside a text block, and that block. */
    const spot = (d: PMNode) => {
      const { pos, node } = pick(blocks(d));
      return { at: pos + 1 + Math.floor(next() * (node.content.size + 1)), pos, node };
    };
    const snippet = () => pick(['’', '‘', 'a', 's', '春', ' ', 'n’t', '’s', 'O’', '’90']);
    const kinds = new Set<string>();
    for (let i = 0; i < 800; i++) {
      const d = state.doc;
      const { at, pos, node } = spot(d);
      const end = pos + 1 + node.content.size;
      const roll = next();
      let kind: string;
      const tr: Transaction = state.tr;
      try {
        if (roll < 0.3) {
          kind = 'type';
          tr.insertText(snippet(), at);
        } else if (roll < 0.36) {
          kind = 'paste a copied range';
          const [a, b] = [spot(d).at, spot(d).at].sort((x, y) => x - y);
          tr.replace(at, at, d.slice(a, b));
        } else if (roll < 0.44) {
          kind = 'delete in a paragraph';
          tr.delete(at, Math.min(at + 1 + Math.floor(next() * 3), end));
        } else if (roll < 0.52) {
          kind = 'delete across paragraphs';
          const other = spot(d).at;
          tr.delete(Math.min(at, other), Math.max(at, other));
        } else if (roll < 0.6) {
          kind = 'split';
          tr.split(at);
        } else if (roll < 0.64) {
          kind = 'wrap in a quote';
          const range = d.resolve(at).blockRange();
          if (range) tr.wrap(range, [{ type: blockquote }]);
        } else if (roll < 0.68) {
          kind = 'wrap in a list';
          const range = d.resolve(at).blockRange();
          if (range) tr.wrap(range, [{ type: bulletList }, { type: listItem }]);
        } else if (roll < 0.72) {
          kind = 'lift';
          const range = d.resolve(at).blockRange();
          if (range && range.depth > 0) tr.lift(range, range.depth - 1);
        } else if (roll < 0.78) {
          kind = 'insert a chip';
          tr.insert(at, chip.create({ label: pick(['Shakespeare', '春风', 'don', '']) }));
        } else if (roll < 0.84) {
          kind = 'change a chip label';
          const chips: number[] = [];
          d.descendants((n, p) => {
            if (n.type === chip) chips.push(p);
          });
          if (chips.length) {
            const label = pick(['Shakespeare', '春风', 'it', '']);
            if (next() < 0.5) tr.setNodeAttribute(pick(chips), 'label', label);
            else tr.setNodeMarkup(pick(chips), undefined, { label });
          }
        } else if (roll < 0.9) {
          kind = 'bold';
          tr.addMark(pos + 1, end, schema.marks.bold.create());
        } else if (roll < 0.97) {
          // A paste first shifts every later step's positions, which the plugin must map through.
          kind = 'several steps at once';
          if (next() < 0.5) {
            const [a, b] = [spot(d).at, spot(d).at].sort((x, y) => x - y);
            tr.replace(at, at, d.slice(a, b));
          }
          tr.insertText(snippet(), tr.mapping.map(at));
          if (next() < 0.5) tr.addMark(tr.mapping.map(pos + 1), tr.mapping.map(end), schema.marks.bold.create());
          const later = spot(tr.doc);
          tr.delete(later.at, Math.min(later.at + 1, later.pos + 1 + later.node.content.size));
        } else {
          kind = 'replace the whole document';
          tr.replaceWith(0, d.content.size, next() < 0.5 ? d.content : fixture().content);
        }
        // Now and then a paste follows in the same transaction, moving everything the edit touched after it.
        if (tr.docChanged && next() < 0.2) {
          const [a, b] = [spot(tr.doc).at, spot(tr.doc).at].sort((x, y) => x - y);
          const dest = spot(tr.doc).at;
          tr.replace(dest, dest, tr.doc.slice(a, b));
        }
      } catch {
        continue; // an edit the document's structure doesn't allow here
      }
      if (!tr.docChanged) continue;
      kinds.add(kind);
      state = state.apply(tr);
      expect(marked(state), `edit ${i} (${kind})`).toEqual(apostropheRanges(state.doc));
    }
    expect(kinds.size).toBe(13);
  });

  it('follow the text’s language: all marked when it becomes Chinese, none when it becomes English', () => {
    let chinese = false;
    let state = EditorState.create({ doc: doc(paragraph.create(null, text('don’t'))), plugins: [latinApostrophes(() => chinese)] });
    expect(marked(state)).toEqual([]);
    chinese = true;
    state = state.apply(state.tr.insertText('了', 7));
    expect(marked(state)).toEqual([{ from: 4, to: 5 }]);
    chinese = false;
    state = state.apply(state.tr.insertText('!', 8));
    expect(marked(state)).toEqual([]);
  });

  it('rescan once, not paragraph by paragraph, when a change replaces the whole document, as a memo’s undo does (review N3)', () => {
    const para = 'don’t ‘OK’ Shakespeare’s 他说 it’s O’Neill 的 students’ 名句，‘好’。'.repeat(2);
    const long = doc(...Array.from({ length: 2000 }, () => paragraph.create(null, text(para))));
    const state = EditorState.create({ doc: long, plugins: [latinApostrophes(() => true)] });
    const time = (run: () => void) => {
      run();
      const start = performance.now();
      for (let i = 0; i < 5; i++) run();
      return (performance.now() - start) / 5;
    };
    const full = time(() => DecorationSet.create(long, apostropheRanges(long).map((r) => Decoration.inline(r.from, r.to, { class: 'latin-apostrophe' }))));
    const replace = time(() => state.apply(state.tr.replaceWith(0, long.content.size, long.content)));
    expect(replace).toBeLessThan(full * 1.3);
  });

  it('rescan only what an edit touched: typing in a long Chinese article costs far less than a full rescan (review)', () => {
    const para = '他引用 Shakespeare’s 名句，说 don’t 这样写，‘OK’ 也常见。'.repeat(3);
    const long = doc(...Array.from({ length: 1500 }, () => paragraph.create(null, text(para))));
    let state = EditorState.create({ doc: long, plugins: [latinApostrophes(() => true)] });
    const fullStart = performance.now();
    for (let i = 0; i < 5; i++) {
      DecorationSet.create(
        long,
        apostropheRanges(long).map((r) => Decoration.inline(r.from, r.to, { class: 'latin-apostrophe' })),
      );
    }
    const full = (performance.now() - fullStart) / 5;
    const editStart = performance.now();
    for (let i = 0; i < 20; i++) state = state.apply(state.tr.insertText('字', 5 + i));
    const edit = (performance.now() - editStart) / 20;
    expect(edit).toBeLessThan(full / 4);
  });
});
