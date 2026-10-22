import type { ThemeName } from '@vighnaway/tokens';

/** localStorage key for the viewer's chosen theme (a per-viewer convenience). */
export const THEME_KEY = 'vighnaway.theme';

/**
 * Theme for a page before any script state exists (DESIGN.md 12.1): a stored choice wins; else
 * the console and its pages project in light, and /report (strangers' phones) follows the system.
 */
export function resolveTheme(stored: string | null, pathname: string, prefersDark: boolean): ThemeName {
  if (stored === 'light' || stored === 'dark') return stored;
  if (pathname.startsWith('/report')) return prefersDark ? 'dark' : 'light';
  return 'light';
}

/**
 * The same rule as a self-contained script for <head>, run before first paint so the page never
 * flashes the wrong theme. Static (never user text), and written with backtick strings and no
 * quotes, ampersands or angle brackets, so React renders it unchanged as the script's text.
 * test/tokens.test.ts runs it and checks it agrees with resolveTheme.
 */
export const themeBootScript = [
  '(function(){try{',
  'var s=null;try{s=localStorage.getItem(`' + THEME_KEY + '`)}catch(e){}',
  'var d=window.matchMedia?window.matchMedia(`(prefers-color-scheme: dark)`).matches:false;',
  'var t=`light`;',
  'if(s===`light`||s===`dark`){t=s}else if(location.pathname.indexOf(`/report`)===0){t=d?`dark`:`light`}',
  'document.documentElement.dataset.theme=t',
  '}catch(e){}})();',
].join('');
