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

/**
 * Standing human silhouette for the flood depth selector on the phone and the console: the water
 * rises to the figure's ankle, knee or waist. Supplied by the product owner as an SVG ("standing
 * human body silhouette", SVG Repo); the path is kept as supplied, on a 206.326-unit square with the
 * feet on the bottom edge. Filled shape, no colour: the surface passes its own ink.
 */
export const humanSilhouette = {
  size: 206.326,
  d: 'M104.265,117.959c-0.304,3.58,2.126,22.529,3.38,29.959c0.597,3.52,2.234,9.255,1.645,12.3c-0.841,4.244-1.084,9.736-0.621,12.934c0.292,1.942,1.211,10.899-0.104,14.175c-0.688,1.718-1.949,10.522-1.949,10.522c-3.285,8.294-1.431,7.886-1.431,7.886c1.017,1.248,2.759,0.098,2.759,0.098c1.327,0.846,2.246-0.201,2.246-0.201c1.139,0.943,2.467-0.116,2.467-0.116c1.431,0.743,2.758-0.627,2.758-0.627c0.822,0.414,1.023-0.109,1.023-0.109c2.466-0.158-1.376-8.05-1.376-8.05c-0.92-7.088,0.913-11.033,0.913-11.033c6.004-17.805,6.309-22.53,3.909-29.24c-0.676-1.937-0.847-2.704-0.536-3.545c0.719-1.941,0.195-9.748,1.072-12.848c1.692-5.979,3.361-21.142,4.231-28.217c1.169-9.53-4.141-22.308-4.141-22.308c-1.163-5.2,0.542-23.727,0.542-23.727c2.381,3.705,2.29,10.245,2.29,10.245c-0.378,6.859,5.541,17.342,5.541,17.342c2.844,4.332,3.921,8.442,3.921,8.747c0,1.248-0.273,4.269-0.273,4.269l0.109,2.631c0.049,0.67,0.426,2.977,0.365,4.092c-0.444,6.862,0.646,5.571,0.646,5.571c0.92,0,1.931-5.522,1.931-5.522c0,1.424-0.348,5.687,0.42,7.295c0.919,1.918,1.595-0.329,1.607-0.78c0.243-8.737,0.768-6.448,0.768-6.448c0.511,7.088,1.139,8.689,2.265,8.135c0.853-0.407,0.073-8.506,0.073-8.506c1.461,4.811,2.569,5.577,2.569,5.577c2.411,1.693,0.92-2.983,0.585-3.909c-1.784-4.92-1.839-6.625-1.839-6.625c2.229,4.421,3.909,4.257,3.909,4.257c2.174-0.694-1.9-6.954-4.287-9.953c-1.218-1.528-2.789-3.574-3.245-4.789c-0.743-2.058-1.304-8.674-1.304-8.674c-0.225-7.807-2.155-11.198-2.155-11.198c-3.3-5.282-3.921-15.135-3.921-15.135l-0.146-16.635c-1.157-11.347-9.518-11.429-9.518-11.429c-8.451-1.258-9.627-3.988-9.627-3.988c-1.79-2.576-0.767-7.514-0.767-7.514c1.485-1.208,2.058-4.415,2.058-4.415c2.466-1.891,2.345-4.658,1.206-4.628c-0.914,0.024-0.707-0.733-0.707-0.733C115.068,0.636,104.01,0,104.01,0h-1.688c0,0-11.063,0.636-9.523,13.089c0,0,0.207,0.758-0.715,0.733c-1.136-0.03-1.242,2.737,1.215,4.628c0,0,0.572,3.206,2.058,4.415c0,0,1.023,4.938-0.767,7.514c0,0-1.172,2.73-9.627,3.988c0,0-8.375,0.082-9.514,11.429l-0.158,16.635c0,0-0.609,9.853-3.922,15.135c0,0-1.921,3.392-2.143,11.198c0,0-0.563,6.616-1.303,8.674c-0.451,1.209-2.021,3.255-3.249,4.789c-2.408,2.993-6.455,9.24-4.29,9.953c0,0,1.689,0.164,3.909-4.257c0,0-0.046,1.693-1.827,6.625c-0.35,0.914-1.839,5.59,0.573,3.909c0,0,1.117-0.767,2.569-5.577c0,0-0.779,8.099,0.088,8.506c1.133,0.555,1.751-1.047,2.262-8.135c0,0,0.524-2.289,0.767,6.448c0.012,0.451,0.673,2.698,1.596,0.78c0.779-1.608,0.429-5.864,0.429-7.295c0,0,0.999,5.522,1.933,5.522c0,0,1.099,1.291,0.648-5.571c-0.073-1.121,0.32-3.422,0.369-4.092l0.106-2.631c0,0-0.274-3.014-0.274-4.269c0-0.311,1.078-4.415,3.921-8.747c0,0,5.913-10.488,5.532-17.342c0,0-0.082-6.54,2.299-10.245c0,0,1.69,18.526,0.545,23.727c0,0-5.319,12.778-4.146,22.308c0.864,7.094,2.53,22.237,4.226,28.217c0.886,3.094,0.362,10.899,1.072,12.848c0.32,0.847,0.152,1.627-0.536,3.545c-2.387,6.71-2.083,11.436,3.921,29.24c0,0,1.848,3.945,0.914,11.033c0,0-3.836,7.892-1.379,8.05c0,0,0.192,0.523,1.023,0.109c0,0,1.327,1.37,2.761,0.627c0,0,1.328,1.06,2.463,0.116c0,0,0.91,1.047,2.237,0.201c0,0,1.742,1.175,2.777-0.098c0,0,1.839,0.408-1.435-7.886c0,0-1.254-8.793-1.945-10.522c-1.318-3.275-0.387-12.251-0.106-14.175c0.453-3.216,0.21-8.695-0.618-12.934c-0.606-3.038,1.035-8.774,1.641-12.3c1.245-7.423,3.685-26.373,3.38-29.959l1.008,0.354C103.809,118.312,104.265,117.959,104.265,117.959z',
} as const;
