import { create } from 'zustand';
import { isLang, LANG_TAG, setCurrentLang, type Lang } from '@/i18n';
import { readStorage, writeStorage } from '@/lib/storage';

export const LANG_KEY = 'vighnaway.lang';

interface LangStore {
  lang: Lang;
  hydrate(): void;
  setLang(lang: Lang): void;
}

function apply(lang: Lang) {
  setCurrentLang(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = LANG_TAG[lang];
}

/** Interface language (English, Hindi, Marathi), remembered on this device. */
export const useLang = create<LangStore>()((set) => ({
  lang: 'en',
  hydrate() {
    const stored = readStorage('local', LANG_KEY);
    const lang = isLang(stored) ? stored : 'en';
    apply(lang);
    set({ lang });
  },
  setLang(lang) {
    writeStorage('local', LANG_KEY, lang);
    apply(lang);
    set({ lang });
  },
}));
