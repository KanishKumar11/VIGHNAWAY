'use client';

import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { motion as motionTokens } from '@vighnaway/tokens';
import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';

export interface Toast {
  id: number;
  tone: 'error' | 'success' | 'info';
  text: string;
}

interface ToastStore {
  toasts: Toast[];
  push(tone: Toast['tone'], text: string): void;
  dismiss(id: number): void;
}

let nextId = 1;
const TOAST_MS = 6000;

export const useToasts = create<ToastStore>()((set, get) => ({
  toasts: [],
  push(tone, text) {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, tone, text }] });
    if (typeof window !== 'undefined') window.setTimeout(() => get().dismiss(id), TOAST_MS);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
}));

export const toast = {
  error: (text: string) => useToasts.getState().push('error', text),
  success: (text: string) => useToasts.getState().push('success', text),
  info: (text: string) => useToasts.getState().push('info', text),
};

/** Toasts render plain text only, in an aria-live region. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 md:inset-x-auto md:right-6 md:bottom-40 md:items-end">
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            layout
            role={item.tone === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', ...motionTokens.springSnappy }}
            className={cn(
              'surface pointer-events-auto flex w-full max-w-[calc(var(--spacing)*120)] items-start gap-3 rounded-card p-4 text-body text-ink-on-shell shadow-lg',
              item.tone === 'error' && 'border-danger',
            )}
          >
            {item.tone === 'error' ? (
              <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
            ) : (
              <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-positive" />
            )}
            <p className="flex-1">{item.text}</p>
            <button type="button" onClick={() => dismiss(item.id)} aria-label={t.toast.dismiss} className="-m-2 inline-flex size-9 shrink-0 items-center justify-center rounded-button text-ink-on-shell-muted">
              <X aria-hidden className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
