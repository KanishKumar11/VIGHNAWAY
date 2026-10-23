import { create } from 'zustand';
import type { Scenario } from '@vighnaway/contracts';
import { SCENARIO_ID, scenarioFor, SCENARIOS } from '@/lib/scenarios';

/**
 * The scenario the console is showing: the simulated demo or live mode. It comes from the
 * page URL (?scenario=andheri-live), so a link or a reload keeps it.
 */
interface ScenarioStore {
  id: string;
  /** False until the URL has been read in the browser (avoids flashing the wrong mode). */
  ready: boolean;
  /** Scenario ids the API serves; null until known. The switcher hides what is missing. */
  available: string[] | null;
  hydrate(search?: string): void;
  setId(id: string): void;
  setAvailable(ids: string[] | null): void;
}

export const scenarioIdFromSearch = (search: string): string => {
  const id = new URLSearchParams(search).get('scenario');
  return id && SCENARIOS[id] ? id : SCENARIO_ID;
};

export const useScenarioStore = create<ScenarioStore>()((set) => ({
  id: SCENARIO_ID,
  ready: false,
  available: null,
  hydrate(search) {
    const s = search ?? (typeof window !== 'undefined' ? window.location.search : '');
    set({ id: scenarioIdFromSearch(s), ready: true });
  },
  setId(id) {
    if (!SCENARIOS[id]) return;
    set({ id });
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id === SCENARIO_ID) url.searchParams.delete('scenario');
      else url.searchParams.set('scenario', id);
      window.history.replaceState(null, '', url);
    }
  },
  setAvailable(available) {
    set({ available });
  },
}));

export const activeScenario = (): Scenario => scenarioFor(useScenarioStore.getState().id);
export const useActiveScenario = (): Scenario => scenarioFor(useScenarioStore((s) => s.id));
