import type { TextRange } from '../text-range';

export type BlockKind = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'li';
/** A run of text with inline marks: b = bold, i = italic. */
export interface Run {
  t: string;
  b?: true;
  i?: true;
}
export interface Block {
  k: BlockKind;
  runs: Run[];
}

/** Separator between blocks in an article's canonical text; every anchor offset counts it. */
export const BLOCK_SEPARATOR = '\n\n';

/** Line breaks next to these characters are removed rather than turned into a space. */
const JOIN_WITHOUT_SPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u;

export function blockText(block: Block): string {
  return block.runs.map((r) => r.t).join('');
}

export function canonicalText(blocks: Block[]): string {
  return blocks.map(blockText).join(BLOCK_SEPARATOR);
}

export function blockRanges(blocks: Block[]): TextRange[] {
  const ranges: TextRange[] = [];
  let pos = 0;
  for (const block of blocks) {
    const length = blockText(block).length;
    ranges.push({ start: pos, end: pos + length });
    pos += length + BLOCK_SEPARATOR.length;
  }
  return ranges;
}

function collapseLineBreaks(s: string): string {
  return s.replace(/[ \t]*\r?\n[ \t\u3000]*/g, (match: string, offset: number) => {
    const before = s[offset - 1] ?? '';
    const after = s[offset + match.length] ?? '';
    return JOIN_WITHOUT_SPACE.test(before) || JOIN_WITHOUT_SPACE.test(after) ? '' : ' ';
  });
}

function trimRuns(runs: Run[]): Run[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length > 0) {
    const first = out[0];
    first.t = first.t.trimStart();
    if (first.t) break;
    out.shift();
  }
  while (out.length > 0) {
    const last = out[out.length - 1];
    last.t = last.t.trimEnd();
    if (last.t) break;
    out.pop();
  }
  return out;
}

export function normalizeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    const runs: Run[] = [];
    for (const run of block.runs) {
      const t = collapseLineBreaks(run.t.normalize('NFC'));
      if (!t) continue;
      const last = runs[runs.length - 1];
      if (last && last.b === run.b && last.i === run.i) last.t += t;
      else runs.push({ t, ...(run.b ? { b: true } : {}), ...(run.i ? { i: true } : {}) });
    }
    const trimmed = trimRuns(runs);
    if (trimmed.length > 0) out.push({ k: block.k, runs: trimmed });
  }
  return out;
}

/**
 * Plain text → paragraphs. With blank lines present, they separate paragraphs; without any
 * (common in Chinese text), every line is a paragraph. Full-width indents are stripped.
 */
export function plainTextToBlocks(text: string): Block[] {
  const src = text.replace(/\r\n?/g, '\n');
  const paragraphs = /\n[ \t\u3000]*\n/.test(src) ? src.split(/\n(?:[ \t\u3000]*\n)+/) : src.split('\n');
  return normalizeBlocks(paragraphs.map((p) => ({ k: 'p', runs: [{ t: p }] })));
}
