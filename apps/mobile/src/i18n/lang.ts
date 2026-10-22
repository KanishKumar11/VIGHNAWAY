/**
 * The active UI language. Kept outside React so `t()` works everywhere (stores, planner, share
 * text); the root layout syncs it from Settings and remounts the navigator when it changes.
 */
export type Language = 'en' | 'hi' | 'mr';
export const LANGUAGES: readonly Language[] = ['en', 'hi', 'mr'];

let current: Language = 'en';

export const getLanguage = (): Language => current;
export function setLanguage(lang: Language): void {
  current = lang;
}

/** Device default from expo-localization's language code; anything else falls back to English. */
export function languageFromLocale(code: string | null | undefined): Language {
  return code === 'hi' || code === 'mr' ? code : 'en';
}

/** BCP 47 tag for speech and number formatting. */
export const speechTag: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };
