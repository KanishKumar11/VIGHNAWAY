import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { BrandMark } from './BrandMark';
import { Spinner } from '@/components/ui/spinner';

/**
 * The one loading screen: the brand tile breathing over a turning ring, with a single line. The sign-in check, the page
 * and the control room's code all show this same screen, so waiting after sign-in looks like one continuous step.
 * `full` fills the window (the gate); otherwise it sits inside a page's own frame.
 */
export function ScreenLoading({ full = false }: { full?: boolean }) {
  return (
    <div className={cn('flex items-center justify-center bg-shell p-6 text-ink-on-shell', full ? 'min-h-dvh' : 'min-h-[50dvh]')}>
      <div role="status" className="vw-rise flex flex-col items-center gap-5">
        <span className="relative grid size-24 place-items-center">
          <span aria-hidden className="vw-breathe absolute inset-0 rounded-full bg-accent/20" />
          <Spinner thin className="absolute inset-0 size-24 text-accent" />
          <BrandMark className="relative size-12 rounded-card" />
        </span>
        <p className="text-base font-medium text-ink-on-shell-muted">{t.gate.loading}</p>
      </div>
    </div>
  );
}
