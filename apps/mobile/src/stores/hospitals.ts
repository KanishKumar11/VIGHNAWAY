import type { HospitalStateValue, HospitalStatesResponse } from '@vighnaway/contracts';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';

/**
 * Hospital states set by the control room (P2-4). They only rank which hospital a "nearest hospital" trip is
 * assigned to; the phone shows them next to the hospital with who set them. Fetched when the search sheet opens:
 * an unreachable server leaves the last answer (or nothing) and never blocks anything.
 */
interface HospitalsState {
  /** Only hospitals that are not accepting are kept. */
  states: Record<string, HospitalStateValue>;
  /** The scenario is simulated: the state is labelled "(simulated)". */
  simulated: boolean;
  loadedAtMs: number | null;
  apply: (r: HospitalStatesResponse) => void;
  load: () => Promise<void>;
}

export const useHospitals = create<HospitalsState>()((set) => ({
  states: {},
  simulated: true,
  loadedAtMs: null,
  apply: (r) =>
    set({
      states: Object.fromEntries(r.hospitals.filter((h) => h.state !== 'accepting').map((h) => [h.placeId, h.state])),
      simulated: r.simulated,
      loadedAtMs: Date.now(),
    }),
  load: async () => {
    try {
      const r = await api.hospitals(useSettings.getState().apiUrl, useScenario.getState().scenario.id);
      useHospitals.getState().apply(r);
    } catch {
      /* offline or an older server without the endpoint: keep what we have */
    }
  },
}));
