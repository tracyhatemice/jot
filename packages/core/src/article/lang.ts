const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LETTER = /\p{L}/u;

/** 'zh' when CJK characters are a substantial share of the letters in the first 5000 characters. */
export function detectLang(text: string): 'zh' | 'en' {
  let cjk = 0;
  let latin = 0;
  for (const ch of text.slice(0, 5000)) {
    if (CJK.test(ch)) cjk++;
    else if (LETTER.test(ch)) latin++;
  }
  return cjk > 0 && cjk * 4 >= latin ? 'zh' : 'en';
}
