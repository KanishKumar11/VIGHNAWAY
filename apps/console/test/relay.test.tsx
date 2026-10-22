import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { create as createQr } from 'qrcode/lib/core/qrcode';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeRelay, findForbiddenWords, ReportInputSchema, type ReportResponse } from '@vighnaway/contracts';
import { RelayScanner } from '@/components/console/RelayScanner';
import { setCurrentLang, t } from '@/i18n';
import { api } from '@/lib/api';
import { checkRelay, readQr } from '@/lib/relayScan';
import { useScenarioStore } from '@/stores/scenario';

/** P2-2.c: the console reads a phone's offline-report QR (camera frame or pasted text) and relays it as the phone would have. */

const wrap = (ui: ReactElement) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
const SCENARIO = 'andheri-monsoon';
const report = ReportInputSchema.parse({
  type: 'flood',
  depth: 'knee',
  point: { lat: 19.12379, lng: 72.85037 },
  observedPersonally: true,
  deviceId: 'vw-0a1b2c3d4e5f6a7b8c9d',
  clientReportId: '3f2b8c1e-5d4a-4e7b-9a10-2c6d8e9f0a11',
  observedAtS: 1260,
  description: 'Water over the kerb',
});
const code = encodeRelay(SCENARIO, report);
const response: ReportResponse = {
  receipt: { reportId: 'rep-1', scenarioId: SCENARIO, outcome: 'created_incident', receivedAtS: 1300, snappedEdgeId: 'e1', roadName: 'Andheri Subway', distanceToRoadM: 4 },
  incident: null,
};

/** The phone's QR as pixels: dark modules on white with a four-module margin, like the phone draws it. */
function frameOf(text: string, px = 6) {
  const { size, data } = createQr(text, { errorCorrectionLevel: 'M' }).modules;
  const span = size + 8;
  const width = span * px;
  const rgba = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      for (let dy = 0; dy < px; dy++) {
        for (let dx = 0; dx < px; dx++) {
          const i = (((y + 4) * px + dy) * width + (x + 4) * px + dx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
    }
  }
  return { data: rgba, width, height: width };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useScenarioStore.setState({ id: SCENARIO });
  setCurrentLang('en');
});

describe('reading the code', () => {
  it('decodes the phone-style QR of a relay payload back to the same text', () => {
    expect(readQr(frameOf(code))).toBe(code);
  });

  it('a frame with no code reads as nothing', () => {
    const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
    expect(readQr(blank)).toBeNull();
  });

  it('accepts a code for this scenario and refuses everything else before sending', () => {
    expect(checkRelay(code, SCENARIO)).toMatchObject({ ok: true });
    expect(checkRelay(`  ${code}\n`, SCENARIO)).toMatchObject({ ok: true });
    expect(checkRelay(code, 'andheri-live')).toEqual({ ok: false, reason: 'other_scenario' });
    expect(checkRelay('https://example.com', SCENARIO)).toEqual({ ok: false, reason: 'not_vighnaway' });
    expect(checkRelay('VW1:{broken', SCENARIO)).toEqual({ ok: false, reason: 'bad_json' });
  });
});

describe('Relay an offline report', () => {
  it('without a camera says so and still relays pasted text, sending the report exactly as the phone made it', async () => {
    const send = vi.spyOn(api, 'report').mockResolvedValue(response);
    render(wrap(<RelayScanner />));
    fireEvent.click(screen.getByTestId('relay-open'));
    await waitFor(() => expect(screen.getByTestId('relay-camera-state').textContent).toBe(t.relay.cameraUnavailable));
    fireEvent.change(screen.getByTestId('relay-paste'), { target: { value: code } });
    fireEvent.click(screen.getByTestId('relay-send'));
    await waitFor(() => expect(screen.getByTestId('relay-done').textContent).toContain('Andheri Subway'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toBe(SCENARIO);
    // The same device id, client id and observed claim as on the phone; no operator credential involved.
    expect(send.mock.calls[0]![1]).toEqual(report);
    expect(send.mock.calls[0]!.length).toBe(2);
  });

  it('lists a report once however many times it is relayed', async () => {
    vi.spyOn(api, 'report').mockResolvedValue(response);
    render(wrap(<RelayScanner />));
    fireEvent.click(screen.getByTestId('relay-open'));
    fireEvent.change(screen.getByTestId('relay-paste'), { target: { value: code } });
    fireEvent.click(screen.getByTestId('relay-send'));
    await waitFor(() => expect(screen.getByTestId('relay-done').children).toHaveLength(1));
    fireEvent.click(screen.getByTestId('relay-send'));
    await waitFor(() => expect(api.report).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('relay-done').children).toHaveLength(1);
  });

  it('refuses a code from another scenario without calling the API', async () => {
    const send = vi.spyOn(api, 'report').mockResolvedValue(response);
    render(wrap(<RelayScanner />));
    fireEvent.click(screen.getByTestId('relay-open'));
    fireEvent.change(screen.getByTestId('relay-paste'), { target: { value: encodeRelay('andheri-live', report) } });
    fireEvent.click(screen.getByTestId('relay-send'));
    expect((await screen.findByTestId('relay-problem')).textContent).toBe(t.relay.refused.other_scenario);
    expect(send).not.toHaveBeenCalled();
  });

  it('shows a server refusal in plain words', async () => {
    const { ApiError } = await import('@/lib/api');
    vi.spyOn(api, 'report').mockRejectedValue(new ApiError('NOT_ON_ROAD', 'Not on a known road', 422));
    render(wrap(<RelayScanner />));
    fireEvent.click(screen.getByTestId('relay-open'));
    fireEvent.change(screen.getByTestId('relay-paste'), { target: { value: code } });
    fireEvent.click(screen.getByTestId('relay-send'));
    expect((await screen.findByTestId('relay-problem')).textContent).toBe(t.relay.notOnRoad);
  });

  it('has Hindi and Marathi text without a forbidden word', () => {
    for (const lang of ['en', 'hi', 'mr'] as const) {
      setCurrentLang(lang);
      const r = t.relay;
      const all = [r.open, r.title, r.intro, r.cameraUnavailable, r.pasteLabel, r.send, r.relayed('Flood', 'X', 'Unverified'), ...Object.values(r.refused), r.notOnRoad, r.rateLimited, r.footnote];
      for (const text of all) expect(findForbiddenWords(text)).toEqual([]);
    }
  });
});
