import { SCORING_RULES } from '../rules';
import { en } from './en';
import type { TextKey } from './en';
import { hi } from './hi';
import { mr } from './mr';
import { rulesHi, rulesMr } from './rules';
import type { RuleKey } from './rules';

export type TextLang = 'en' | 'hi' | 'mr';

export const TEXT_CATALOGS: Record<TextLang, Record<TextKey, string>> = { en, hi, mr };

export const RULE_KEYS = Object.keys(rulesHi) as RuleKey[];

/** A scoring rule's description in a language. English is SCORING_RULES itself (single source). */
export function ruleDescription(key: RuleKey, lang: TextLang): string {
  if (lang === 'hi') return rulesHi[key];
  if (lang === 'mr') return rulesMr[key];
  const rule = SCORING_RULES[key];
  return typeof rule === 'string' ? rule : rule.description;
}
