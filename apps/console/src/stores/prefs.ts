import { create } from 'zustand';
import { readStorage, writeStorage } from '@/lib/storage';

const KEY = 'vighnaway.prefs';

interface Prefs {
  /** Larger text for low vision (DESIGN_VISION section 3). */
  largeText: boolean;
  /** Spoken route changes (Web Speech). Off by default. */
  speech: boolean;
  /** Presenter mode: operator controls hidden, the decision enlarged for judges. */
  presenter: boolean;
  /** Map stage shows the text list of routes and incidents instead of the map. */
  listView: boolean;
  /** Incident queue column folded away to give the map more room. */
  queueHidden: boolean;
  /** Decision column folded away to give the map more room. */
  tripHidden: boolean;
  /** Map shows flood-prone roads coloured by how recent their latest report is (P1-5). Per session. */
  coverage: boolean;
  /** Map shows walking-concern markers (poorly lit, isolated). The queue lists them either way. Per session. */
  walking: boolean;
}

interface PrefsStore extends Prefs {
  hydrate(): void;
  set<K extends keyof Prefs>(key: K, value: Prefs[K]): void;
  toggle(key: keyof Prefs): void;
}

const DEFAULTS: Prefs = {
  largeText: false,
  speech: false,
  presenter: false,
  listView: false,
  queueHidden: false,
  tripHidden: false,
  coverage: false,
  walking: true,
};
/** Remembered on this device; presenter mode, the list view, folded columns and coverage are per session. */
const PERSISTED: (keyof Prefs)[] = ['largeText', 'speech'];

function persist(p: Prefs) {
  const out: Partial<Prefs> = {};
  for (const k of PERSISTED) out[k] = p[k];
  writeStorage('local', KEY, JSON.stringify(out));
}

function applyDom(p: Prefs) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset.text = p.largeText ? 'large' : 'normal';
  html.dataset.presenter = p.presenter ? 'on' : 'off';
}

export const usePrefs = create<PrefsStore>()((set, get) => ({
  ...DEFAULTS,
  hydrate() {
    let stored: Partial<Prefs> = {};
    try {
      stored = JSON.parse(readStorage('local', KEY) ?? '{}') as Partial<Prefs>;
    } catch {
      stored = {};
    }
    const next: Prefs = { ...DEFAULTS };
    for (const k of PERSISTED) if (typeof stored[k] === 'boolean') next[k] = stored[k] as boolean;
    applyDom(next);
    set(next);
  },
  set(key, value) {
    const next = { ...pick(get()), [key]: value } as Prefs;
    applyDom(next);
    persist(next);
    set({ [key]: value } as Partial<PrefsStore>);
  },
  toggle(key) {
    get().set(key, !get()[key]);
  },
}));

const pick = (s: PrefsStore): Prefs => ({
  largeText: s.largeText,
  speech: s.speech,
  presenter: s.presenter,
  listView: s.listView,
  queueHidden: s.queueHidden,
  tripHidden: s.tripHidden,
  coverage: s.coverage,
});

/** P toggles presenter mode, Escape leaves it; ignored while typing. Pure, for tests. */
export function presenterKey(
  e: { key: string; target?: unknown; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean },
  presenter: boolean,
): boolean | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const el = e.target as { tagName?: string; isContentEditable?: boolean } | undefined;
  const tag = el?.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable)
    return null;
  if (e.key === 'p' || e.key === 'P') return !presenter;
  if (e.key === 'Escape' && presenter) return false;
  return null;
}
