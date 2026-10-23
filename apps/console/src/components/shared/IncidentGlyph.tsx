import type { IncidentIconKey } from '@vighnaway/tokens';
import { cn } from '@/lib/cn';

/**
 * The incident pictures: the same illustrations as the phone's report screen (apps/console/public/report is a copy of
 * apps/mobile/assets/report), used everywhere an incident or report type is shown, so a flood looks the same on every
 * screen of both apps. They are coloured pictures, so they sit on a white disc the caller draws.
 */
export function IncidentGlyph({ type, className, title }: { type: IncidentIconKey; className?: string; title?: string }) {
  return (
    <img
      src={`/report/${type}.png`}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      width={192}
      height={192}
      draggable={false}
      className={cn('object-contain', className)}
    />
  );
}
