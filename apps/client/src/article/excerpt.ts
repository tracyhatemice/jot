/** A one-line label for quoted text: whitespace collapsed, cut by code point (never inside an emoji). */
export function excerpt(text: string, max = 24): string {
  const chars = [...text.replace(/\s+/gu, ' ').trim()];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}
