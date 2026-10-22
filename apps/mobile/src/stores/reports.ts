import { create } from 'zustand';
import type { ReportInput } from '@vighnaway/contracts';
import { KEYS, storage } from '@/lib/storage';

export interface PendingReport {
  localId: string;
  /** Scenario the report was made in; it is only ever sent there (simulated and live never mix). */
  scenarioId: string;
  input: ReportInput;
  createdAtWallMs: number;
  activityId: string | null;
  /** A photo to send once the report is accepted (JPEG, base64). */
  photo?: { data: string } | null;
}

interface ReportsState {
  pending: PendingReport[];
  enqueue: (r: PendingReport) => void;
  remove: (localId: string) => void;
  /** Reports queued before offline codes existed get a client id now, so they can be shown as a code too. */
  stampMissingIds: (newId: () => string) => void;
}

export const usePendingReports = create<ReportsState>()((set, get) => ({
  pending: storage.getJSON<PendingReport[]>(KEYS.pendingReports) ?? [],
  enqueue: (r) => {
    const pending = [...get().pending, r];
    set({ pending });
    storage.setJSON(KEYS.pendingReports, pending);
  },
  stampMissingIds: (newId) => {
    if (get().pending.every((p) => p.input.clientReportId)) return;
    const pending = get().pending.map((p) => (p.input.clientReportId ? p : { ...p, input: { ...p.input, clientReportId: newId() } }));
    set({ pending });
    storage.setJSON(KEYS.pendingReports, pending);
  },
  remove: (localId) => {
    const pending = get().pending.filter((p) => p.localId !== localId);
    set({ pending });
    storage.setJSON(KEYS.pendingReports, pending);
  },
}));
