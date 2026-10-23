import { t } from '@/i18n';
import { cn } from '@/lib/cn';

/** The app tile (V, route and pin on the deep plum): the same artwork as the phone's launcher icon. */
export function BrandMark({ className }: { className?: string }) {
  return <img src="/brand/vighnaway-tile.png" alt="" aria-hidden width={256} height={256} draggable={false} className={cn('size-8', className)} />;
}

/**
 * The full logo (mark + VIGHNAWAY). Its letters are cream, so it needs a dark surface: `plate` puts it on
 * the brand's deep plum, which reads in the light and dark theme alike. Without `plate`, only use it on
 * a surface that is already dark (the sign-in's brand panel).
 */
export function Wordmark({ className, plate = false }: { className?: string; plate?: boolean }) {
  const img = (
    <img
      src="/brand/vighnaway-wordmark.png"
      alt={t.app.name}
      width={1200}
      height={313}
      draggable={false}
      className={cn('block h-full w-auto', !plate && className)}
    />
  );
  if (!plate) return img;
  return <span className={cn('flex shrink-0 items-center rounded-button bg-chrome-bg px-3 py-1', className)}>{img}</span>;
}
