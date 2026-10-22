import { create } from 'zustand';
import type { Profile } from '@vighnaway/contracts';
import { getLocales } from 'expo-localization';
import { DEFAULT_API_URL } from '@/config/env';
import { languageFromLocale, setLanguage, type Language } from '@/i18n/lang';
import { KEYS, storage } from '@/lib/storage';

export type FixtureMode = 'peek' | 'change' | 'report' | 'noViable' | null;
/** 'simulated': the scripted demo (everything labelled Simulated). 'live': real Andheri data. */
export type DataMode = 'simulated' | 'live';
/** Appearance: follow the phone (default, DESIGN.md 12.1) or force a theme. */
export type Appearance = 'system' | 'light' | 'dark';

interface Persisted {
  apiUrl: string;
  firstRunDone: boolean;
  notificationsAsked: boolean;
  debugUnlocked: boolean;
  profile: Profile;
  dataMode: DataMode;
  /** Google traffic layer on the map (display only; never affects routing). */
  googleTraffic: boolean;
  appearance: Appearance;
  language: Language;
  /** In-app text enlargement on top of the system font scale. */
  largerText: boolean;
  /** Speak route changes during a trip (default on). */
  speakChanges: boolean;
  /** "Prefer well-lit roads" (P2-9): a walking preference, ranking only, off by default. */
  preferLit: boolean;
}

interface SettingsState extends Persisted {
  /** Hero-screen fixture mode (debug only, never persisted). */
  fixtureMode: FixtureMode;
  setApiUrl: (url: string) => void;
  completeFirstRun: () => void;
  markNotificationsAsked: () => void;
  unlockDebug: () => void;
  setProfile: (p: Profile) => void;
  setFixtureMode: (m: FixtureMode) => void;
  setDataMode: (m: DataMode) => void;
  setGoogleTraffic: (on: boolean) => void;
  setAppearance: (a: Appearance) => void;
  setLanguage: (l: Language) => void;
  setLargerText: (on: boolean) => void;
  setSpeakChanges: (on: boolean) => void;
  setPreferLit: (on: boolean) => void;
}

const defaults: Persisted = {
  apiUrl: DEFAULT_API_URL,
  firstRunDone: false,
  notificationsAsked: false,
  debugUnlocked: false,
  profile: 'car',
  dataMode: 'simulated',
  googleTraffic: false,
  appearance: 'system',
  language: 'en',
  largerText: false,
  speakChanges: true,
  preferLit: false,
};

function deviceLanguage(): Language {
  try {
    return languageFromLocale(getLocales()[0]?.languageCode);
  } catch {
    return 'en';
  }
}

const saved = storage.getJSON<Partial<Persisted>>(KEYS.settings) ?? {};
// First launch follows the phone's language; afterwards the saved choice wins.
const initialLanguage: Language = saved.language ?? deviceLanguage();
setLanguage(initialLanguage);

export const useSettings = create<SettingsState>()((set, get) => {
  const persist = () => {
    const { apiUrl, firstRunDone, notificationsAsked, debugUnlocked, profile, dataMode, googleTraffic, appearance, language, largerText, speakChanges, preferLit } = get();
    storage.setJSON(KEYS.settings, { apiUrl, firstRunDone, notificationsAsked, debugUnlocked, profile, dataMode, googleTraffic, appearance, language, largerText, speakChanges, preferLit });
  };
  const update = (patch: Partial<SettingsState>) => {
    set(patch);
    persist();
  };
  return {
    ...defaults,
    ...saved,
    language: initialLanguage,
    fixtureMode: null,
    setApiUrl: (apiUrl) => update({ apiUrl: apiUrl.trim().replace(/\/+$/, '') }),
    completeFirstRun: () => update({ firstRunDone: true }),
    markNotificationsAsked: () => update({ notificationsAsked: true }),
    unlockDebug: () => update({ debugUnlocked: true }),
    setProfile: (profile) => update({ profile }),
    setFixtureMode: (fixtureMode) => set({ fixtureMode }),
    setDataMode: (dataMode) => update({ dataMode }),
    setGoogleTraffic: (googleTraffic) => update({ googleTraffic }),
    setAppearance: (appearance) => update({ appearance }),
    setLanguage: (language) => {
      setLanguage(language);
      update({ language });
    },
    setLargerText: (largerText) => update({ largerText }),
    setSpeakChanges: (speakChanges) => update({ speakChanges }),
    setPreferLit: (preferLit) => update({ preferLit }),
  };
});

/** The persisted data mode, readable before the store exists (scenario and trip stores start from it). */
export function savedDataMode(): DataMode {
  return storage.getJSON<Partial<Persisted>>(KEYS.settings)?.dataMode === 'live' ? 'live' : 'simulated';
}
