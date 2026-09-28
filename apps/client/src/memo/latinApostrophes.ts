import { Extension } from '@tiptap/core';
import { latinApostrophes } from '../reading/apostrophes';
import { memoLang } from './memoLang';

/** Marks the memo's apostrophes in English words while its text is Chinese (spec §6.11). */
export const LatinApostrophes = Extension.create({
  name: 'latinApostrophes',

  addProseMirrorPlugins() {
    return [latinApostrophes((doc) => memoLang(doc) === 'zh')];
  },
});
