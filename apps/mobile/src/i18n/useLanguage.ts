import { useSettings } from '@/stores/settings';
import type { Language } from '@/i18n/lang';

/**
 * Subscribes a component to the UI language so it draws again when it changes. `t()` reads module state, so a component
 * that is memoised, or that sits on a screen behind the one in front, needs this to pick up a new language without the
 * whole navigator being rebuilt.
 */
export function useLanguage(): Language {
  return useSettings((s) => s.language);
}
