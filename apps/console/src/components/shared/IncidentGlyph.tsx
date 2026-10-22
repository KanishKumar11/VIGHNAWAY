import { incidentIcons, incidentIconStyle, type IncidentIconKey } from '@vighnaway/tokens';

/**
 * The incident pictograms (docs/DESIGN.md section 4): bold, two-tone, filled shapes from the shared
 * set in @vighnaway/tokens, so a flood looks the same here as on the phone. They take the text
 * colour (currentColor) of the surface they sit on.
 */
export function IncidentGlyph({ type, className, title }: { type: IncidentIconKey; className?: string; title?: string }) {
  const { softOpacity, strokeWidth, roundStrokeWidth, viewBox } = incidentIconStyle;
  return (
    <svg
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {incidentIcons[type].map((layer, i) => {
        const opacity = layer.tone === 'soft' ? softOpacity : 1;
        return layer.paint === 'stroke' ? (
          <path key={i} d={layer.d} fill="none" stroke="currentColor" strokeOpacity={opacity} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path
            key={i}
            d={layer.d}
            fill="currentColor"
            fillOpacity={opacity}
            fillRule="evenodd"
            {...(layer.round ? { stroke: 'currentColor', strokeOpacity: opacity, strokeWidth: roundStrokeWidth, strokeLinejoin: 'round' as const } : null)}
          />
        );
      })}
    </svg>
  );
}
