import { create } from 'zustand';
import { loadOperatorToken, saveOperatorToken } from '@/lib/storage';

/** Operator token: typed at runtime, kept in sessionStorage, sent as Authorization: Bearer. */
interface OperatorStore {
  token: string | null;
  dialogOpen: boolean;
  hydrate(): void;
  setToken(token: string | null): void;
  openDialog(): void;
  closeDialog(): void;
}

export const useOperator = create<OperatorStore>()((set) => ({
  token: null,
  dialogOpen: false,
  hydrate() {
    set({ token: loadOperatorToken() });
  },
  setToken(token) {
    saveOperatorToken(token);
    set({ token });
  },
  openDialog() {
    set({ dialogOpen: true });
  },
  closeDialog() {
    set({ dialogOpen: false });
  },
}));
