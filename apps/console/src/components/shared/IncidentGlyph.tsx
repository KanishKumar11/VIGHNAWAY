import type { IncidentType } from '@vighnaway/contracts';

/**
 * Original incident glyphs on Lucide's 24-unit grid with a 2-unit stroke (DESIGN.md section 4):
 * flood (droplet over waves), closure (barrier), congestion (stacked cars), debris, accident.
 */
const PATHS: Record<IncidentType, string[]> = {
  flood: [
    'M12 2.5c0 0-4.5 5.2-4.5 8.2a4.5 4.5 0 0 0 9 0c0-3-4.5-8.2-4.5-8.2z',
    'M2.5 19.5c1.6-1.4 3.2-1.4 4.8 0s3.2 1.4 4.8 0 3.2-1.4 4.8 0 3.2 1.4 4.6 0',
  ],
  closure: ['M3 8h18v6H3z', 'M7.5 8l-3 6', 'M13 8l-3 6', 'M18.5 8l-3 6', 'M6 14v6', 'M18 14v6', 'M6 8V5', 'M18 8V5'],
  congestion: [
    'M8 9.5 9.2 6h5.6L16 9.5',
    'M6.5 9.5h11',
    'M6.5 17 8 13h8l1.5 4',
    'M4.5 17h15v3h-15z',
    'M8 20v1.5',
    'M16 20v1.5',
  ],
  debris: ['M2.5 20h19', 'M4.5 20l2.5-5.5 3.5 2 2-4.5 4 3 3 5', 'M15 9l1.5-2.5 2.5 1.5', 'M7 9.5 9 8'],
  accident: ['M12 3 2.5 20.5h19z', 'M12 9.5v5', 'M12 17.5h.01'],
};

export function IncidentGlyph({ type, className, title }: { type: IncidentType; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {PATHS[type].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
