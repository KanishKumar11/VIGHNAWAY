'use client';

import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useTheme } from '@/stores/theme';

/** Sun / moon switch for light and dark. */
export function ThemeToggle({ className, bare = false }: { className?: string; bare?: boolean }) {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  useEffect(() => useTheme.getState().hydrate(), []);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={t.theme.toggle}
      title={dark ? t.theme.toLight : t.theme.toDark}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={cn('vw-press relative overflow-hidden', bare ? 'ctl-quiet h-full w-9 justify-center' : 'ctl size-10', className)}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={theme}
          initial={{ y: 14, rotate: -40, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          exit={{ y: -14, rotate: 40, opacity: 0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 320 }}
          className="flex"
        >
          {dark ? <Moon aria-hidden className="size-4.5" /> : <Sun aria-hidden className="size-4.5" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
