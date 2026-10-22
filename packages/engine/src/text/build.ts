import type { Crossing, Incident, Text, TextParam } from '@vighnaway/contracts';
import { FEED_PROVIDER_LABEL } from '@vighnaway/contracts';
import { isTextKey } from './render';

/** Builders for structured engine text. Every sentence the engine writes starts here. */

export const tx = (key: string, params?: Record<string, TextParam>): Text => (params ? { key, params } : { key });

const DEPTH_KEY = { ankle: 'depth.ankle', knee: 'depth.knee', waist: 'depth.waist' } as const;

export function hazardLabelText(inc: Incident): Text {
  switch (inc.type) {
    case 'flood':
      return tx('hazard.flood', { depth: tx(inc.depth ? DEPTH_KEY[inc.depth] : 'depth.none') });
    case 'closure':
      return tx('hazard.closure');
    case 'congestion':
      return tx(`hazard.congestion.${inc.congestion ?? 'moderate'}`);
    case 'debris':
      return tx(inc.impassable ? 'hazard.debris.impassable' : 'hazard.debris');
    case 'accident':
      return tx(inc.impassable ? 'hazard.accident.impassable' : 'hazard.accident');
    case 'walking_concern':
      return tx(inc.concern === 'isolated' ? 'hazard.walking.isolated' : 'hazard.walking.poorly_lit');
    default:
      // An incident type this build does not know (a newer API): say so rather than fail.
      return tx('hazards.unknown');
  }
}

/** "Flooding (knee deep) at Andheri Subway". */
export function hazardPhraseText(inc: Incident): Text {
  const hazard = hazardLabelText(inc);
  if (!inc.roadName) return hazard;
  return tx(inc.type === 'congestion' ? 'hazard.on' : 'hazard.at', { hazard, road: inc.roadName });
}

function providerText(inc: Pick<Incident, 'feed'>): TextParam {
  const provider = inc.feed?.provider;
  if (!provider) return tx('provider.unknown');
  const key = `provider.${provider}`;
  return isTextKey(key) ? tx(key) : FEED_PROVIDER_LABEL[provider];
}

export function statusLabelText(
  inc: Pick<Incident, 'status' | 'deviceCount' | 'verifiedBy'> & Partial<Pick<Incident, 'source' | 'feed'>>,
): Text {
  if (inc.status === 'corroborated' && inc.source === 'live_feed') {
    const n = inc.deviceCount;
    const devices: TextParam = n > 0 ? (n === 1 ? tx('status.feed.devices.one') : tx('status.feed.devices', { n })) : '';
    return tx('status.feed', { provider: providerText(inc), devices });
  }
  if (inc.status === 'corroborated') return tx('status.corroborated', { n: inc.deviceCount });
  if (inc.status === 'verified') return tx(inc.verifiedBy === 'simulated_operator' ? 'status.verified.sim' : 'status.verified');
  return tx(`status.${inc.status}`);
}

export function sourceLabelText(inc: Pick<Incident, 'source'> & Partial<Pick<Incident, 'feed'>>): Text {
  if (inc.source === 'live_feed' && inc.feed) return tx('source.feed', { provider: providerText(inc) });
  return tx(`source.${inc.source}`);
}

/** "Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated". */
export function evidenceText(inc: Incident): Text {
  const hazard = hazardPhraseText(inc);
  // A live-feed status label already names its provider ("Reported by TomTom live traffic").
  if (inc.source === 'live_feed' && inc.status === 'corroborated') {
    return tx('evidence.short', { hazard, status: statusLabelText(inc) });
  }
  return tx('evidence.full', { hazard, status: statusLabelText(inc), source: sourceLabelText(inc) });
}

/** Whole minutes rounded up, for ETAs: "14 min", "1 h 5 min". */
export function durationText(seconds: number): Text {
  const min = Math.max(1, Math.ceil(Math.max(0, seconds) / 60));
  if (min < 60) return tx('dur.min', { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? tx('dur.h', { h }) : tx('dur.hmin', { h, m });
}

/** Signed minutes for trade-offs: "+6 min", "−2 min", "about the same time". */
export function deltaText(seconds: number): Text {
  const min = Math.round(seconds / 60);
  if (min === 0) return tx('delta.same');
  return min > 0 ? tx('delta.plus', { n: min }) : tx('delta.minus', { n: Math.abs(min) });
}

/** "adds 3 min", "saves 2 min", "takes about the same time". */
export function etaChangeText(deltaS: number): Text {
  const min = Math.round(deltaS / 60);
  if (min > 0) return tx('eta.adds', { n: min });
  if (min < 0) return tx('eta.saves', { n: Math.abs(min) });
  return tx('eta.same');
}

/** A crossing's name: the engine names an untagged crossing "Unnamed <kind>", which is translated. */
export function crossingNameText(c: Pick<Crossing, 'name' | 'kind'>): TextParam {
  return c.name === `Unnamed ${c.kind}` ? tx(`crossing.unnamed.${c.kind}`) : c.name;
}

/** Route name: "Via Andheri Subway", or "Direct route" when no road or crossing is named. */
export const routeNameText = (road: TextParam | null): Text => (road === null ? tx('route.direct') : tx('route.via', { road }));

/** The road a route goes via, or null for "Direct route". Falls back to the English name for older payloads. */
function routeRoad(name: string, nameText: Text | undefined): TextParam | null {
  if (nameText) return nameText.key === 'route.via' ? (nameText.params?.road ?? null) : null;
  return /^Via /.test(name) ? name.replace(/^Via /, '') : null;
}

/** The road a route goes via, for sentences ("Take Andheri Subway to ..."). "Direct route" stays as the engine wrote it. */
export const viaRoadText = (name: string, nameText: Text | undefined): TextParam => routeRoad(name, nameText) ?? tx('route.direct');

/** "via Andheri Subway" for use inside a sentence; "Direct route" stays as the engine wrote it. */
export function viaLowerText(name: string, nameText: Text | undefined): Text {
  const road = routeRoad(name, nameText);
  return road === null ? tx('route.direct') : tx('route.via.lower', { road });
}
