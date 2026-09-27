import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { zhCN } from './zh-CN';

export type Language = 'zh-CN' | 'en';
export const LANGUAGES: readonly Language[] = ['zh-CN', 'en'];
const STORAGE_KEY = 'jot.lang';

/** A stored choice wins; otherwise the first Chinese or English browser language; otherwise English. */
export function pickLanguage(stored: string | null, preferred: readonly string[]): Language {
  if (stored === 'zh-CN' || stored === 'en') return stored;
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    if (lower.startsWith('zh')) return 'zh-CN';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function initI18n(): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources: { 'zh-CN': { translation: zhCN }, en: { translation: en } },
    lng: pickLanguage(readStored(), navigator.languages ?? [navigator.language]),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = i18next.language;
}

export async function setLanguage(lang: Language): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage blocked (private mode): the choice lasts for this session only.
  }
  await i18next.changeLanguage(lang);
  document.documentElement.lang = lang;
}
