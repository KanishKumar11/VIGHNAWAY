import type { ThemeName } from '@vighnaway/tokens';
import { create } from 'zustand';
import { writeStorage } from '@/lib/storage';
import { THEME_KEY } from '@/lib/themeMode';

type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => Promise<void> | void) => { ready: Promise<void>; finished: Promise<void> };
};

const WAVE_MS = 1100;
const WAVE_POINTS = 24;

/** Polygon whose leading edge is a travelling sine wave; `p` is progress 0..1 over the viewport. */
function wavePolygon(p: number, fromTop: boolean, phase: number): string {
  const amp = 6 * Math.sin(Math.PI * Math.min(1, p * 1.05));
  const edge = -15 + p * 135;
  const pts: string[] = [];
  for (let i = 0; i <= WAVE_POINTS; i++) {
    const x = (i / WAVE_POINTS) * 100;
    const y = edge + amp * Math.sin((i / WAVE_POINTS) * Math.PI * 4 + phase);
    pts.push(`${x.toFixed(2)}% ${(fromTop ? y : 100 - y).toFixed(2)}%`);
  }
  const [a, b] = fromTop ? ['100% -20%', '0% -20%'] : ['100% 120%', '0% 120%'];
  return `polygon(${a}, ${pts.reverse().join(', ')}, ${b})`;
}

function runWave(html: HTMLElement, fromTop: boolean) {
  const start = performance.now();
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / WAVE_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    html.style.setProperty('--vw-wave', wavePolygon(eased, fromTop, t * 10));
    if (t < 1) requestAnimationFrame(frame);
    else html.style.removeProperty('--vw-wave');
  };
  requestAnimationFrame(frame);
}

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
    if (typeof document === 'undefined') {
      set({ theme });
      return;
    }
    const html = document.documentElement;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const apply = () => {
      html.dataset.theme = theme;
      set({ theme });
    };
    const start = (document as ViewTransitionDocument).startViewTransition?.bind(document);
    if (reduce || !start) {
      if (!reduce) html.classList.add('vw-theme-anim');
      apply();
      if (!reduce) window.setTimeout(() => html.classList.remove('vw-theme-anim'), 320);
      return;
    }
    html.classList.add('vw-theme-wave');
    // Going dark the wave pours in from the top; going light it rises from the bottom.
    const fromTop = theme === 'dark';
    html.style.setProperty('--vw-wave', wavePolygon(0, fromTop, 0));
    const transition = start(async () => {
      apply();
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    });
    transition.ready
      .then(() => runWave(html, fromTop))
      .catch(() => undefined);
    transition.finished.finally(() => html.classList.remove('vw-theme-wave'));
  },
}));

