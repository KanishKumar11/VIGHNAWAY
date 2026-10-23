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

/**
 * The active theme, mirrored on <html data-theme>. The choice is remembered in localStorage.
 * A switch lands on the click: no wave, cross-fade or view transition, because those hold the page
 * (and its clicks) for a second and a theme change should be seen at once.
 */
export const useTheme = create<ThemeStore>()((set) => ({
  theme: 'light',
  hydrate() {
    set({ theme: current() });
  },
  setTheme(theme) {
    writeStorage('local', THEME_KEY, theme);
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
    set({ theme });
  },
}));
