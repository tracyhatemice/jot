import { Schema, type Node as PMNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { apostropheOffsets, apostropheParts, apostropheRanges } from './apostrophes';

/** Enough of a memo's schema: quotes, lists, line breaks and link chips. */
const schema = new Schema({
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
