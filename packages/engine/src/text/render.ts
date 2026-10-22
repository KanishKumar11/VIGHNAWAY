import type { Text, TextParam } from '@vighnaway/contracts';
import { TEXT_CATALOGS } from './catalogs';
import type { TextLang } from './catalogs';
import { en } from './en';
import type { TextKey } from './en';

export type { TextLang };

export const TEXT_LANGS: readonly TextLang[] = ['en', 'hi', 'mr'];

const PLACEHOLDER = /\{(\w+)(?:\|(\w+))?\}/g;

/** Placeholder names a template uses, in order of appearance. For tests and tooling. */
export function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1]!);
}

export function isTextKey(key: string): key is TextKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

/** Case modifiers apply to Latin text only; Devanagari has no case and road names must keep theirs. */
function modify(s: string, modifier: string | undefined, lang: TextLang): string {
  if (!modifier || lang !== 'en' || !s) return s;
  if (modifier === 'cap') return s[0]!.toUpperCase() + s.slice(1);
  if (modifier === 'lower') return s[0]!.toLowerCase() + s.slice(1);
  if (modifier === 'lowerall') return s.toLowerCase();
  return s;
}

function renderParam(p: TextParam, lang: TextLang): string {
  if (typeof p === 'string') return p;
  if (typeof p === 'number') return String(p);
  return renderText(p, lang);
}

/**
 * Renders structured engine text in a language. String parameters are proper nouns (road and
 * place names) and are inserted unchanged. A placeholder with no parameter is left as written so
 * tests can find it; an unknown key renders as the key itself.
 */
export function renderText(text: Text, lang: TextLang): string {
  const template = isTextKey(text.key) ? TEXT_CATALOGS[lang][text.key] : text.key;
  const params = text.params ?? {};
  return template.replace(PLACEHOLDER, (whole, name: string, modifier: string | undefined) => {
    const p = params[name];
    return p === undefined ? whole : modify(renderParam(p, lang), modifier, lang);
  });
}
