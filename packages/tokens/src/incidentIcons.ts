/**
 * Incident pictograms: one bold, two-tone set drawn on a 24-unit grid, shared by the phone and the
 * console so a flood looks the same everywhere (docs/DESIGN.md section 4). They are filled shapes,
 * not outlines: they hold their shape at 14 px on a map marker and look deliberate at 64 px.
 *
 * Each icon is a short list of layers drawn in one colour, back to front:
 *  - `solid` layers use the full colour, `soft` layers use SOFT_OPACITY of it (the second tone);
 *  - `fill` layers are filled with the even-odd rule, so a sub-path inside another is a knock-out
 *    (the bar in the no-entry disc, the exclamation mark in the triangle, the windscreen of the car);
 *  - `stroke` layers are round-capped lines of STROKE_WIDTH (the waves);
 *  - `round` softens the corners of a filled polygon with a stroke of ROUND_STROKE_WIDTH.
 * Paths carry no colour: the surface passes its own ink, so every theme and the colour-vision
 * tests keep working. Drawn for VIGHNAWAY; not copies of any third-party icon set.
 */
export type IncidentIconKey = 'flood' | 'closure' | 'congestion' | 'debris' | 'accident' | 'road_clear';

export interface IncidentIconLayer {
  paint: 'fill' | 'stroke';
  tone: 'solid' | 'soft';
  /** Fill layers only: round the polygon's corners. */
  round?: boolean;
  d: string;
}

export const incidentIconStyle = { softOpacity: 0.38, strokeWidth: 2.2, roundStrokeWidth: 1.4, viewBox: 24 } as const;

export const incidentIcons: Record<IncidentIconKey, readonly IncidentIconLayer[]> = {
  // A droplet over two waves.
  flood: [
    { paint: 'fill', tone: 'solid', d: 'M12 1.8c-3.1 3.7-5.6 6.5-5.6 9.4a5.6 5.6 0 0 0 11.2 0c0-2.9-2.5-5.7-5.6-9.4z' },
    { paint: 'stroke', tone: 'solid', d: 'M2.2 19.2c1.7-1.5 3.3-1.5 5 0s3.3 1.5 5 0 3.3-1.5 5 0 3.3 1.5 4.6 0' },
    { paint: 'stroke', tone: 'soft', d: 'M2.2 22.4c1.7-1.5 3.3-1.5 5 0s3.3 1.5 5 0 3.3-1.5 5 0 3.3 1.5 4.6 0' },
  ],
  // A no-entry disc: the bar is a knock-out.
  closure: [{ paint: 'fill', tone: 'solid', d: 'M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21zM5.6 10.2h12.8v3.6H5.6z' }],
  // A car in the queue, with the next car's roof behind it.
  congestion: [
    { paint: 'fill', tone: 'soft', d: 'M7.4 6.4 8.3 4.1A2 2 0 0 1 10.2 2.8h3.6a2 2 0 0 1 1.9 1.3l.9 2.3z' },
    {
      paint: 'fill',
      tone: 'solid',
      d: 'M3.2 13.6 4.8 9.1A2.4 2.4 0 0 1 7.1 7.5h9.8a2.4 2.4 0 0 1 2.3 1.6l1.6 4.5v6.1a1 1 0 0 1-1 1h-2.2a1 1 0 0 1-1-1v-1.2H7.4v1.2a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1zM6.4 9.4 5.5 12h13l-.9-2.6zM5.6 14.9a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0zM15.6 14.9a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0z',
    },
  ],
  // A pile of boulders.
  debris: [
    { paint: 'fill', tone: 'solid', round: true, d: 'M3.4 20.6 2.6 15.4 6.8 12.2 10.8 14.4 11.8 20.6z' },
    { paint: 'fill', tone: 'soft', round: true, d: 'M12.2 20.6l.9-5.9 4.6-2.4 4.4 3.3-.5 5z' },
    { paint: 'fill', tone: 'solid', round: true, d: 'M8.2 11.2 9.4 7l4.2-1.4 2.6 3.2-1 3.2-3.9 1.3z' },
  ],
  // A warning triangle: the exclamation mark is a knock-out.
  accident: [
    {
      paint: 'fill',
      tone: 'solid',
      d: 'M12 2.6c.7 0 1.3.4 1.7 1l8 13.9c.8 1.4-.2 3.1-1.7 3.1H4c-1.5 0-2.5-1.7-1.7-3.1l8-13.9c.4-.6 1-1 1.7-1zM11 8.8h2v5.6h-2zM12 15.7a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z',
    },
  ],
  // A disc with a tick, for "road clear" reports.
  road_clear: [
    { paint: 'fill', tone: 'solid', d: 'M12 1.8a10.2 10.2 0 1 0 0 20.4 10.2 10.2 0 0 0 0-20.4zM10.4 16.6 6.9 13.1l1.4-1.4 2.1 2.1 5.3-5.3 1.4 1.4z' },
  ],
};
