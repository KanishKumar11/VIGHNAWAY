import { Keyboard } from 'react-native';
import { create } from 'zustand';
import type { LucideIcon } from '@/components/icons';

export interface DialogAction {
  label: string;
  /** Shown in this order, top to bottom. `primary` is the accent, `danger` the soft red, `secondary` the quiet one. */
  kind?: 'primary' | 'danger' | 'secondary';
  onPress?: () => void;
}

export interface DialogSpec {
  title: string;
  message?: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'warn' | 'danger';
  actions: DialogAction[];
}

interface DialogState {
  current: DialogSpec | null;
  queue: DialogSpec[];
  /** Close the visible dialog and show the next one waiting, if any. */
  close: () => void;
}

export const useDialog = create<DialogState>()((set, get) => ({
  current: null,
  queue: [],
  close: () => {
    const [next, ...rest] = get().queue;
    set({ current: next ?? null, queue: rest });
  },
}));

/**
 * The app's themed replacement for `Alert.alert` (BUILD_PROMPT 8.3). One dialog shows at a time;
 * a second one waits for the first to close. The keyboard goes down first so it never covers a button.
 */
export function showDialog(spec: DialogSpec): void {
  Keyboard.dismiss();
  const { current, queue } = useDialog.getState();
  if (current) useDialog.setState({ queue: [...queue, spec] });
  else useDialog.setState({ current: spec });
}
