'use client';

import { Check, SlidersHorizontal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { LANGS, t, type Lang } from '@/i18n';
import { cn } from '@/lib/cn';
import { speechAvailable } from '@/hooks/useSpeech';
import { useLang } from '@/stores/lang';
import { usePrefs } from '@/stores/prefs';

/** Language names in their own script, so each is recognisable to its readers. */
const LANG_NAME: Record<Lang, string> = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' };

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 rounded-button px-3 text-left text-body text-ink hover:bg-panel-sunken disabled:opacity-50"
    >
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-meta text-ink-muted">{hint}</span>}
      </span>
      <span className={cn('relative h-6 w-10 shrink-0 rounded-chip border transition-colors', checked ? 'border-accent bg-accent' : 'border-control-border bg-panel-sunken')}>
        <span className={cn('absolute top-0.5 size-4 rounded-chip shadow-sm transition-transform', checked ? 'translate-x-4.5 bg-on-accent' : 'translate-x-0.5 bg-control-border')} />
      </span>
    </button>
  );
}

/** View settings: language, larger text, spoken changes, list view, presenter mode. */
export function ViewMenu({ console: inConsole = true, compact = false, bare = false }: { console?: boolean; compact?: boolean; bare?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const prefs = usePrefs();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className={cn('relative', bare && 'h-full')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={t.view.menu}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'vw-press text-body',
          bare ? 'ctl-quiet h-full w-9 justify-center' : cn('ctl h-10', compact ? 'w-10' : 'px-3.5'),
        )}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        {!compact && t.view.menu}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="vw-unchrome absolute top-full right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-card border border-panel-line bg-panel-raised p-2 text-ink shadow-lg"
          >
            <p className="px-3 pt-2 pb-1 text-meta font-semibold text-ink-muted">{t.view.language}</p>
            <div role="radiogroup" aria-label={t.view.language} className="grid grid-cols-3 gap-1 px-2 pb-2">
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={lang === l}
                  lang={l}
                  onClick={() => setLang(l)}
                  className={cn(
                    'flex h-10 items-center justify-center gap-1.5 rounded-button border text-body font-medium',
                    lang === l ? 'border-accent bg-recommended-surface text-recommended-ink' : 'border-panel-line text-ink',
                  )}
                >
                  {lang === l && <Check aria-hidden className="size-4" />}
                  {LANG_NAME[l]}
                </button>
              ))}
            </div>
            {lang !== 'en' && <p className="px-3 pb-2 text-meta text-ink-muted">{t.view.translationNote}</p>}
            <div className="border-t border-panel-line pt-1">
              <Toggle label={t.view.largeText} checked={prefs.largeText} onChange={(v) => prefs.set('largeText', v)} />
              {inConsole && (
                <>
                  <Toggle label={t.view.speech} hint={speechAvailable() ? t.view.speechHint : t.view.speechUnavailable} checked={prefs.speech} disabled={!speechAvailable()} onChange={(v) => prefs.set('speech', v)} />
                  <Toggle label={t.view.list} hint={t.view.listHint} checked={prefs.listView} onChange={(v) => prefs.set('listView', v)} />
                  <Toggle label={t.view.coverage} hint={t.view.coverageHint} checked={prefs.coverage} onChange={(v) => prefs.set('coverage', v)} />
                  <Toggle label={t.view.walking} hint={t.view.walkingHint} checked={prefs.walking} onChange={(v) => prefs.set('walking', v)} />
                  <Toggle label={t.view.presenter} hint={t.view.presenterHint} checked={prefs.presenter} onChange={(v) => prefs.set('presenter', v)} />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
