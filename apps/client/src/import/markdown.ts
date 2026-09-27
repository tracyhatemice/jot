import type { Block } from '@jot/core';
import MarkdownIt from 'markdown-it';
import { htmlToBlocks } from './htmlToBlocks';

// html: false → raw HTML in the source is escaped and shows up as text.
const md = new MarkdownIt({ html: false, linkify: false });

export function markdownToBlocks(source: string): Block[] {
  return htmlToBlocks(md.render(source));
}
