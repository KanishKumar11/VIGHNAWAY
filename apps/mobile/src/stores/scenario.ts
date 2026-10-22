import { create } from 'zustand';
import { ScenarioSchema, type GraphFile, type Place, type Scenario } from '@vighnaway/contracts';
import { andheriGraph, andheriLiveScenario, andheriScenario } from '@vighnaway/scenario-data';
import { KEYS, storage } from '@/lib/storage';
import { savedDataMode, type DataMode } from './settings';

/** The bundled scenario for each data mode (same graph, different places, events and clock). */
export const bundledScenario = (mode: DataMode): Scenario => (mode === 'live' ? andheriLiveScenario : andheriScenario);

/**
 * Scenario and graph. Both are bundled with the app so it works offline; a scenario fetched from
 * the API replaces the bundled one only when it uses the same graph version.
 */
interface ScenarioState {
  scenario: Scenario;
  graphFile: GraphFile;
  source: 'bundled' | 'server';
  /** Server scenario rejected because its graph version differs from the bundled graph. */
  graphMismatch: string | null;
  setServerScenario: (s: unknown) => void;
  /** Switch to the bundled (or cached server) scenario of a data mode. */
  selectMode: (mode: DataMode) => void;
}

function initial(mode: DataMode): Pick<ScenarioState, 'scenario' | 'source'> {
  const bundled = bundledScenario(mode);
  const cached = storage.getJSON<unknown>(KEYS.scenario);
  const parsed = cached ? ScenarioSchema.safeParse(cached) : null;
  if (parsed?.success && parsed.data.id === bundled.id && parsed.data.graphVersion === andheriGraph.graphVersion) {
    return { scenario: parsed.data, source: 'server' };
  }
  return { scenario: bundled, source: 'bundled' };
}

export const useScenario = create<ScenarioState>()((set) => ({
  ...initial(savedDataMode()),
  graphFile: andheriGraph,
  graphMismatch: null,
  setServerScenario: (raw) => {
    const parsed = ScenarioSchema.safeParse(raw);
    if (!parsed.success) return;
    // Ignore a late response for the other mode's scenario.
    if (parsed.data.id !== useScenario.getState().scenario.id) return;
    if (parsed.data.graphVersion !== andheriGraph.graphVersion) {
      set({ graphMismatch: parsed.data.graphVersion });
      return;
    }
    storage.setJSON(KEYS.scenario, parsed.data);
    set({ scenario: parsed.data, source: 'server', graphMismatch: null });
  },
  selectMode: (mode) => set({ ...initial(mode), graphMismatch: null }),
}));

/**
 * Places the traveller picked beyond the scenario's own list: a searched road, or the phone's
 * position. They live only for this session; the engine still plans between graph nodes.
 */
const customPlaces = new Map<string, Place>();
const CUSTOM_PREFIXES = ['road:', 'my-location:'] as const;

export const isCustomPlaceId = (id: string): boolean => CUSTOM_PREFIXES.some((p) => id.startsWith(p));

export function registerCustomPlace(place: Place): Place {
  customPlaces.set(place.id, place);
  return place;
}

export const placeById = (scenario: Scenario, id: string | null | undefined): Place | null =>
  (id ? (scenario.places.find((p) => p.id === id) ?? customPlaces.get(id)) : undefined) ?? null;
