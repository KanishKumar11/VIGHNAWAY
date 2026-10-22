import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlertFeedError, fetchCapText, readAlertFeed } from '../../src/alerts/alert-feed';

/** P2-5.b: reading a CAP feed over HTTP. A local server stands in for the feed (the real one was unreachable). */

const fixture = readFileSync(path.join(__dirname, '../fixtures/cap-mumbai.xml'), 'utf8');
const CLOCK_START = '2026-01-01T00:00:00+05:30';
const NOW = new Date('2026-07-14T10:00:00+05:30');

let server: Server;
let base = '';
let mode: 'ok' | 'error' | 'slow' | 'huge' | 'html' | 'empty' = 'ok';

beforeAll(async () => {
  server = createServer((req, res) => {
    if (mode === 'error') {
      res.statusCode = 503;
      res.end('down');
    } else if (mode === 'slow') {
      setTimeout(() => res.end(fixture), 2000).unref();
    } else if (mode === 'huge') {
      res.setHeader('content-length', '5000000');
      res.end('x'.repeat(100));
    } else if (mode === 'html') {
      res.setHeader('content-type', 'text/html');
      res.end('<html><body>maintenance</body></html>');
    } else if (mode === 'empty') {
      res.end('<?xml version="1.0"?><feed></feed>');
    } else {
      res.setHeader('content-type', 'application/xml');
      res.end(fixture);
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cap.xml`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('readAlertFeed', () => {
  it('reads the feed and returns the active Mumbai rain alerts with their sender as provenance', async () => {
    mode = 'ok';
    const r = await readAlertFeed(base, CLOCK_START, NOW);
    expect(r.alerts.length).toBeGreaterThan(0);
    for (const a of r.alerts) {
      expect(a.kind).toBe('rain');
      expect(a.simulated).toBe(false);
      expect(a.source).toMatch(/CAP alert/);
    }
    expect(r.stats.read).toBeGreaterThan(r.stats.kept);
  });

  it('says why when the feed is down, too slow, too large, not CAP, or not a web address', async () => {
    mode = 'error';
    await expect(readAlertFeed(base, CLOCK_START, NOW)).rejects.toThrow('answered 503');
    mode = 'slow';
    await expect(readAlertFeed(base, CLOCK_START, NOW, { timeoutMs: 200 })).rejects.toThrow('did not answer in time');
    mode = 'huge';
    await expect(readAlertFeed(base, CLOCK_START, NOW)).rejects.toThrow('too large');
    mode = 'html';
    await expect(readAlertFeed(base, CLOCK_START, NOW)).rejects.toThrow('did not contain CAP alerts');
    mode = 'empty';
    await expect(readAlertFeed(base, CLOCK_START, NOW)).rejects.toThrow('did not contain CAP alerts');
    await expect(fetchCapText('file:///etc/passwd')).rejects.toThrow('http or https');
    await expect(fetchCapText('not a url')).rejects.toThrow('not a valid URL');
    await expect(fetchCapText('http://127.0.0.1:1/nothing', { timeoutMs: 500 })).rejects.toBeInstanceOf(AlertFeedError);
  });

  it('never puts the feed address or a stack trace in its error messages', async () => {
    try {
      await fetchCapText('http://user:secret@127.0.0.1:1/cap.xml', { timeoutMs: 500 });
    } catch (e) {
      expect(String((e as Error).message)).not.toMatch(/secret|127\.0\.0\.1/);
    }
  });
});
