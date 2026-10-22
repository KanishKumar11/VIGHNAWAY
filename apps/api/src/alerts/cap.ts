import type { Alert } from '@vighnaway/contracts';

/**
 * Read-only rain alerts from a CAP 1.2 feed (SACHET publishes CAP), P2-5.a. This is a parser only:
 * it turns CAP XML into the scenario's `Alert` shape for the **live** scenario. The simulated demo
 * keeps its own labelled alert. The text is plain: tags are stripped, length is capped, and nothing
 * from the feed is ever interpreted as markup.
 *
 * Tested against a hand-written fixture (test/fixtures/cap-mumbai.xml), because the real feed was
 * unreachable when this was written; field names follow the CAP 1.2 standard.
 */

const AREA = /mumbai|andheri|konkan/i;
const RAIN = /rain|rainfall|thunder|cloudburst|flood/i;
const LABEL_MAX = 160;

export interface CapOptions {
  /** ISO time of the live scenario's clock start; alert times are seconds after it. */
  clockStartsAt: string;
  /** Now, as a Date (injected so tests are deterministic). */
  now: Date;
}

export interface ParsedCap {
  alerts: Alert[];
  /** Counts for the status line: what was read and what was left out, and why. */
  stats: { read: number; kept: number; skipped: { notActual: number; cancelled: number; expired: number; otherArea: number; notRain: number; invalid: number } };
}

const decode = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const plain = (s: string): string => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** First text of <tag> inside a block, or null. */
function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? plain(m[1]!) : null;
}

function blocks(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi');
  for (let m = re.exec(xml); m; m = re.exec(xml)) out.push(m[1]!);
  return out;
}

const safeId = (s: string): string => s.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80);

export function parseCap(xml: string, opts: CapOptions): ParsedCap {
  const start = Date.parse(opts.clockStartsAt);
  const nowMs = opts.now.getTime();
  const skipped = { notActual: 0, cancelled: 0, expired: 0, otherArea: 0, notRain: 0, invalid: 0 };
  const alerts: Alert[] = [];
  const all = blocks(xml, 'alert');
  for (const a of all) {
    const identifier = tag(a, 'identifier');
    const sender = tag(a, 'sender') ?? 'CAP feed';
    if (!identifier || Number.isNaN(start)) {
      skipped.invalid++;
      continue;
    }
    if ((tag(a, 'status') ?? '').toLowerCase() !== 'actual') {
      skipped.notActual++;
      continue;
    }
    if ((tag(a, 'msgType') ?? '').toLowerCase() === 'cancel') {
      skipped.cancelled++;
      continue;
    }
    // An alert may carry several <info> blocks (one per language): the first usable one is used.
    let kept = false;
    let reason: keyof typeof skipped | null = null;
    for (const info of blocks(a, 'info')) {
      const event = tag(info, 'event') ?? '';
      const headline = tag(info, 'headline') ?? event;
      const description = tag(info, 'description') ?? '';
      const area = blocks(info, 'area').map((x) => tag(x, 'areaDesc') ?? '').join(' ');
      const effective = Date.parse(tag(info, 'effective') ?? tag(a, 'sent') ?? '');
      const expires = Date.parse(tag(info, 'expires') ?? '');
      if (Number.isNaN(effective)) {
        reason = 'invalid';
        continue;
      }
      if (!Number.isNaN(expires) && expires <= nowMs) {
        reason = 'expired';
        continue;
      }
      if (!AREA.test(area)) {
        reason = 'otherArea';
        continue;
      }
      if (!RAIN.test(`${event} ${headline} ${description}`)) {
        reason = 'notRain';
        continue;
      }
      alerts.push({
        id: `cap:${safeId(identifier)}`,
        kind: 'rain',
        label: (headline || event).slice(0, LABEL_MAX),
        source: `${sender.slice(0, 80)} (CAP alert)`,
        simulated: false,
        activeFromS: Math.max(0, Math.floor((effective - start) / 1000)),
        activeUntilS: Number.isNaN(expires) ? null : Math.max(0, Math.floor((expires - start) / 1000)),
      });
      kept = true;
      break;
    }
    if (!kept) skipped[reason ?? 'invalid']++;
  }
  return { alerts: alerts.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)), stats: { read: all.length, kept: alerts.length, skipped } };
}
