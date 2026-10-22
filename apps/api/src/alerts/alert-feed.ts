import { type ParsedCap, parseCap } from './cap';

/**
 * Reading a CAP 1.2 rain-alert feed over HTTP (P2-5.b). Pure of the database so it is tested with a local
 * server. The feed is untrusted: only http(s), a size cap, a timeout, and the parser strips markup.
 */

export const ALERT_FEED_TIMEOUT_MS = 10_000;
export const ALERT_FEED_MAX_BYTES = 2_000_000;

export class AlertFeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlertFeedError';
  }
}

export interface ReadOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

/** The feed's XML text, or an AlertFeedError saying why not (never a stack trace or the URL's credentials). */
export async function fetchCapText(url: string, o: ReadOptions = {}): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AlertFeedError('The alert feed address is not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new AlertFeedError('The alert feed address must be http or https');
  const maxBytes = o.maxBytes ?? ALERT_FEED_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? ALERT_FEED_TIMEOUT_MS);
  try {
    const res = await (o.fetchImpl ?? fetch)(url, { signal: controller.signal, headers: { accept: 'application/xml, text/xml, application/cap+xml' } });
    if (!res.ok) throw new AlertFeedError(`The alert feed answered ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new AlertFeedError('The alert feed is too large');
    const text = await res.text();
    if (text.length > maxBytes) throw new AlertFeedError('The alert feed is too large');
    return text;
  } catch (e) {
    if (e instanceof AlertFeedError) throw e;
    if (controller.signal.aborted) throw new AlertFeedError('The alert feed did not answer in time');
    throw new AlertFeedError('The alert feed could not be reached');
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches and parses the feed for the live scenario's clock. A document with no CAP alert at all is an error, not "no alerts". */
export async function readAlertFeed(url: string, clockStartsAt: string, now: Date, o: ReadOptions = {}): Promise<ParsedCap> {
  const xml = await fetchCapText(url, o);
  if (!/<alert[\s>]/i.test(xml)) throw new AlertFeedError('The alert feed did not contain CAP alerts');
  return parseCap(xml, { clockStartsAt, now });
}
