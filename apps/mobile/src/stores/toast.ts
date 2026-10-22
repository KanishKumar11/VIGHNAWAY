import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  tone: 'neutral' | 'warn' | 'positive';
  /** What raised it, so a later state can withdraw it (e.g. 'unchanged' when the route changes). */
  tag?: string;
}

interface ToastState {
  toast: Toast | null;
  show: (message: string, tone?: Toast['tone'], tag?: string) => void;
  hide: (id: number) => void;
  /** Withdraw the visible toast if it carries this tag. */
  clearTag: (tag: string) => void;
}

let nextId = 1;

export const useToast = create<ToastState>()((set, get) => ({
  toast: null,
  show: (message, tone = 'neutral', tag) => {
    const id = nextId++;
    set({ toast: { id, message, tone, tag } });
    setTimeout(() => get().hide(id), 3500);
  },
  hide: (id) => {
    if (get().toast?.id === id) set({ toast: null });
  },
  clearTag: (tag) => {
    if (get().toast?.tag === tag) set({ toast: null });
  },
}));
