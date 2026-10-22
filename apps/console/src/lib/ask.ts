import type { LatLng, ReportInput } from '@vighnaway/contracts';

export type AskAnswer = 'yes' | 'no' | 'not_sure';

export interface AskLink {
  point: LatLng;
  /** Plain text from the link; null for an unnamed road. */
  road: string | null;
}

const ROAD_MAX = 80;
// Andheri sits near 19.1, 72.85; a generous box keeps a mistyped link from posting to the sea.
const LAT_RANGE: [number, number] = [18.8, 19.4];
const LNG_RANGE: [number, number] = [72.6, 73.1];

/** Reads ?ask=<lat>,<lng>&road=<name>. Anything malformed or far from the scenario area is rejected. */
export function parseAsk(params: Record<string, string | string[] | undefined>): AskLink | null {
  const raw = typeof params.ask === 'string' ? params.ask : null;
  if (!raw) return null;
  const [latS, lngS, ...rest] = raw.split(',');
  if (rest.length || latS === undefined || lngS === undefined) return null;
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < LAT_RANGE[0] || lat > LAT_RANGE[1] || lng < LNG_RANGE[0] || lng > LNG_RANGE[1]) return null;
  const roadParam = typeof params.road === 'string' ? params.road.replace(/\s+/g, ' ').trim().slice(0, ROAD_MAX) : '';
  return { point: { lat, lng }, road: roadParam || null };
}

/** The link a phone or the presenter can share to ask one person about one road. */
export function askUrl(reportUrl: string, scenarioId: string, point: LatLng, road: string | null): string {
  const q = new URLSearchParams({ scenario: scenarioId, ask: `${point.lat.toFixed(5)},${point.lng.toFixed(5)}` });
  if (road) q.set('road', road);
  return `${reportUrl}?${q.toString()}`;
}

/**
 * Same mapping as the phone: Yes files a flood report (depth not given, which the engine treats as
 * knee deep, conservatively), No files a Road clear report, Not sure files nothing. Never Verified.
 */
export function reportForAskAnswer(link: AskLink, answer: AskAnswer, deviceId: string): ReportInput | null {
  if (answer === 'not_sure') return null;
  const common = { point: link.point, observedPersonally: false, origin: 'prompt', deviceId } as const;
  return answer === 'yes' ? { type: 'flood', depth: null, ...common } : { type: 'road_clear', ...common };
}
