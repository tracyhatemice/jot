import { fontFaces } from './fontFaces';

/** Registers the bundled English typefaces (spec §6.11). A face downloads only when text uses it. */
for (const f of fontFaces()) {
  document.fonts.add(
    new FontFace(f.family, `url(${f.url}) format('woff2')`, { weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, display: 'swap' }),
  );
}
