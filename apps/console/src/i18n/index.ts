import { en } from './en';
import { hi } from './hi';
import { mr } from './mr';
import type { Strings } from './types';

/**
 * The console's strings in the active language. `t` always reads the current table, so code
 * written as `t.queue.title` follows the language switch (the app remounts on a switch).
 * English is the source; Hindi and Marathi need review by a native speaker.
 */
export type Lang = 'en' | 'hi' | 'mr';
export const LANGS: readonly Lang[] = ['en', 'hi', 'mr'];
export const TABLES: Readonly<Record<Lang, Strings>> = { en, hi, mr };
/** BCP 47 tags for <html lang> and speech. */
export const LANG_TAG: Readonly<Record<Lang, string>> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

let current: Lang = 'en';
export const currentLang = (): Lang => current;
export function setCurrentLang(lang: Lang): void {
  current = TABLES[lang] ? lang : 'en';
}
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

export const t: Strings = new Proxy({} as Strings, {
  get: (_target, key) => (TABLES[current] as unknown as Record<string | symbol, unknown>)[key],
});

export type { Strings };
