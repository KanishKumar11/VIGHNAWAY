import type { ThemeName } from '@vighnaway/tokens';
import { create } from 'zustand';
import { writeStorage } from '@/lib/storage';
import { THEME_KEY } from '@/lib/themeMode';

interface ThemeStore {
  theme: ThemeName;
  hydrate(): void;
  setTheme(theme: ThemeName): void;
}

const current = (): ThemeName =>
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/** The active theme, mirrored on <html data-theme>. The choice is remembered in localStorage. */
export const useTheme = create<ThemeStore>()((set) => ({
  theme: 'light',
  hydrate() {
    set({ theme: current() });
  },
  setTheme(theme) {
    writeStorage('local', THEME_KEY, theme);
    if (typeof document !== 'undefined') {
      const html = document.documentElement;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reduce) html.classList.add('vw-theme-anim');
      html.dataset.theme = theme;
      if (!reduce) window.setTimeout(() => html.classList.remove('vw-theme-anim'), 320);
    }
    set({ theme });
  },
}));

