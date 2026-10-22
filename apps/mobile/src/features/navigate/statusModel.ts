import { formatSimClock } from '@vighnaway/contracts';
import { t } from '@/i18n/en';
import { fmtAge } from '@/i18n/format';

export type StatusKind = 'live' | 'connecting' | 'offline' | 'unreachable' | 'fixture' | 'localClock' | 'map' | 'liveMissing' | 'feed' | 'feedOff';

export interface StatusNotice {
  key: StatusKind;
  /** Exact UX_FLOWS copy shown when the pill is expanded. */
  text: string;
  /** Secondary line (e.g. "Schematic view of the road graph, not a map"). */
  sub?: string;
  /** 'ok' for a healthy live feed; problems are 'warn'; fixture and a switched-off feed are 'neutral'. */
  tone: 'ok' | 'warn' | 'neutral';
}

/** Live traffic feed, as the status pill needs it (live mode only). */
export interface FeedInput {
  availability: 'unknown' | 'available' | 'unavailable';
  enabled: boolean;
  provider: string;
  /** Seconds since the last successful poll, or null before the first one. */
  updatedAgoS: number | null;
  reason: string | null;
}

export interface StatusPill {
  /** Drives the pill's icon. */
  kind: StatusKind;
  tone: 'ok' | 'warn' | 'neutral';
  /** One or two words for the collapsed pill. */
  short: string;
  /** "+1" when more than one notice is active. */
  more: string;
  notices: StatusNotice[];
  /** Spoken label for the pill button. */
  a11y: string;
}

export interface StatusInput {
  mode: 'live' | 'offline' | 'unreachable' | 'connecting';
  apiUrl: string;
  cachedAtSimS: number | null;
  cachedAtWallMs: number | null;
  clockStartsAt: string;
  localClock: boolean;
  fixture: boolean;
  nowWallMs: number;
  /** The map could not load and the schematic fallback is shown. */
  mapUnavailable: boolean;
  /** Live data mode, with its feed; omitted in simulated mode. */
  live?: { scenarioMissing: boolean; feed: FeedInput };
}

/**
 * Merges connection, local-clock, fixture and map-fallback state into one compact pill
 * (DESIGN.md 11.1: status is quiet until it matters). Priority: fixture, connection problems,
 * local clock, map fallback, connecting, live.
 */
export function statusPill(p: StatusInput): StatusPill {
  const notices: StatusNotice[] = [];
  if (p.fixture) notices.push({ key: 'fixture', text: t('fixtureLabel'), tone: 'neutral' });
  else if (p.mode === 'offline' || p.mode === 'unreachable') {
    const cached = p.cachedAtSimS !== null && p.cachedAtWallMs !== null;
    const params: Record<string, string> = cached
      ? { clock: formatSimClock(p.clockStartsAt, p.cachedAtSimS!), age: fmtAge((p.nowWallMs - p.cachedAtWallMs!) / 1000), url: p.apiUrl }
      : { url: p.apiUrl };
    const text =
      p.mode === 'offline'
        ? cached
          ? t('offlineBar', params)
          : t('offlineBarNoCache')
        : cached
          ? t('unreachableBar', params)
          : t('unreachableBarNoCache', params);
    notices.push({ key: p.mode, text, tone: 'warn' });
  }
  if (p.live?.scenarioMissing && !p.fixture) notices.push({ key: 'liveMissing', text: t('liveScenarioMissing'), tone: 'warn' });
  if (p.localClock && !p.fixture && !p.live) notices.push({ key: 'localClock', text: t('localClock'), tone: 'warn' });
  if (p.live && !p.fixture && !p.live.scenarioMissing && p.live.feed.availability !== 'unknown') {
    const f = p.live.feed;
    if (f.availability === 'available' && f.enabled) {
      const text =
        f.updatedAgoS === null
          ? t('feedWaiting', { provider: f.provider })
          : f.updatedAgoS < 60
            ? t('feedUpdatedNow', { provider: f.provider })
            : t('feedUpdated', { provider: f.provider, age: fmtAge(f.updatedAgoS) });
      notices.push({ key: 'feed', text, tone: 'ok' });
    } else {
      notices.push({ key: 'feedOff', text: t('feedOff'), sub: f.reason ?? t('feedUnavailable'), tone: 'neutral' });
    }
  }
  // After the feed: in live mode the feed is the meaningful state, the schematic map is persistent.
  if (p.mapUnavailable) notices.push({ key: 'map', text: t('mapUnavailable'), sub: t('schematicLabel'), tone: 'neutral' });

  const cached = p.cachedAtSimS !== null;
  const shortFor = (k: StatusKind): string =>
    k === 'fixture'
      ? t('statusFixture')
      : k === 'offline'
        ? t('statusOffline')
        : k === 'unreachable'
          ? cached
            ? t('statusCached')
            : t('statusNoServer')
          : k === 'localClock'
            ? t('statusLocalClock')
            : k === 'liveMissing'
              ? t('statusNoLiveData')
              : k === 'feed'
                ? t('statusLiveTraffic')
                : k === 'feedOff'
                  ? t('statusTrafficOff')
            : k === 'map'
              ? t('statusSchematic')
              : k === 'connecting'
                ? t('statusConnecting')
                : t('statusLive');

  const first = notices[0];
  const kind: StatusKind = first ? first.key : p.mode === 'connecting' ? 'connecting' : 'live';
  const tone: StatusPill['tone'] = first ? first.tone : kind === 'live' ? 'ok' : 'neutral';
  const short = shortFor(kind);
  const more = notices.length > 1 ? t('statusMore', { n: notices.length - 1 }) : '';
  const a11y = notices.length ? `${short}. ${notices.map((n) => n.text).join('. ')}` : short;
  return { kind, tone, short, more, notices, a11y };
}
