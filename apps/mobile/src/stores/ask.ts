import { create } from 'zustand';
import { KEYS, storage } from '@/lib/storage';

/**
 * When each road was last asked about on this phone ("Is <road> flooded right now?"), so a road is
 * asked about at most once per 30 minutes. Wall-clock time; per scenario, so simulated and live
 * never mix. Kept on the device only.
 */
interface AskedState {
  askedAtMs: Record<string, number>;
  mark: (scenarioId: string, roadKey: string, nowMs: number) => void;
}

export const askKey = (scenarioId: string, roadKey: string): string => `${scenarioId}|${roadKey}`;

export const useAsked = create<AskedState>()((set, get) => ({
  askedAtMs: storage.getJSON<Record<string, number>>(KEYS.asked) ?? {},
  mark: (scenarioId, roadKey, nowMs) => {
    const askedAtMs = { ...get().askedAtMs, [askKey(scenarioId, roadKey)]: nowMs };
    set({ askedAtMs });
    storage.setJSON(KEYS.asked, askedAtMs);
  },
}));
