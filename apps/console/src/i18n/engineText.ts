import type { Text } from '@vighnaway/contracts';
import { renderText, TEXT_LANGS } from '@vighnaway/engine';
import { currentLang } from '.';

/**
 * Engine sentences in the active language. The engine returns each sentence as structured text
 * next to its English string; render the text, and fall back to the string for older payloads.
 */
export const rt = (text: Text | undefined, plain: string): string => (text ? renderText(text, currentLang()) : plain);

/** A route's display name ("Via Andheri Subway" / "Andheri Subway होकर"). */
export const routeLabel = (r: { name: string; nameText?: Text }): string => rt(r.nameText, r.name);

const BANNER_LEAD = new RegExp(
  `^(${['change.changed', 'change.noViable'].flatMap((key) => TEXT_LANGS.map((lang) => renderText({ key }, lang).replace(/[.।]$/, ''))).join('|')})[.।]\s*`,
);

/** The banner title already says "Route changed" or "No viable route"; drop the repeat in any language. */
export const bannerBody = (message: string): string => message.replace(BANNER_LEAD, '');
