import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ReportInputSchema } from '@vighnaway/contracts';
import { AskForm } from '@/components/report/AskForm';
import { setCurrentLang, t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { askUrl, parseAsk, reportForAskAnswer } from '@/lib/ask';

/** P1-4.d: the web question page. An answer is an ordinary Unverified report with origin "prompt". */

const link = { point: { lat: 19.1163, lng: 72.8471 }, road: 'Andheri Subway' };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setCurrentLang('en');
});

describe('ask link', () => {
  it('parses lat,lng and a plain-text road name', () => {
    expect(parseAsk({ ask: '19.11630,72.84710', road: 'Andheri  Subway' })).toEqual({ point: { lat: 19.1163, lng: 72.8471 }, road: 'Andheri Subway' });
    expect(parseAsk({ ask: '19.1163,72.8471' })).toEqual({ point: { lat: 19.1163, lng: 72.8471 }, road: null });
  });

  it('rejects a missing, malformed or far-away point and caps the road name', () => {
    expect(parseAsk({})).toBeNull();
    expect(parseAsk({ ask: 'x,y' })).toBeNull();
    expect(parseAsk({ ask: '19.1,72.8,5' })).toBeNull();
    expect(parseAsk({ ask: '0,0' })).toBeNull();
    expect(parseAsk({ ask: ['19.1,72.8'] })).toBeNull();
    expect(parseAsk({ ask: '19.1163,72.8471', road: 'x'.repeat(500) })!.road!.length).toBe(80);
  });

  it('builds a shareable link that parses back', () => {
    const url = new URL(askUrl('https://x.example/report', 'andheri-monsoon', link.point, link.road));
    expect(url.pathname).toBe('/report');
    expect(parseAsk(Object.fromEntries(url.searchParams))).toEqual(link);
    expect(url.searchParams.get('scenario')).toBe('andheri-monsoon');
  });
});

describe('answers become ordinary reports', () => {
  it('Yes is an Unverified flood with no depth, No is Road clear, Not sure sends nothing, origin is prompt', () => {
    const yes = reportForAskAnswer(link, 'yes', 'device-12345678')!;
    expect(yes).toMatchObject({ type: 'flood', depth: null, origin: 'prompt', observedPersonally: false });
    expect(ReportInputSchema.safeParse(yes).success).toBe(true);
    const no = reportForAskAnswer(link, 'no', 'device-12345678')!;
    expect(no).toMatchObject({ type: 'road_clear', origin: 'prompt', observedPersonally: false });
    expect(ReportInputSchema.safeParse(no).success).toBe(true);
    expect(reportForAskAnswer(link, 'not_sure', 'device-12345678')).toBeNull();
    // Nothing in the body can claim a status.
    expect(Object.keys(yes)).not.toContain('status');
  });
});

describe('AskForm', () => {
  let report: MockInstance<typeof api.report>;
  beforeEach(() => {
    report = vi.spyOn(api, 'report').mockResolvedValue(undefined as never);
  });

  it('asks about the named road as plain text and files a flood report on Yes', async () => {
    render(<AskForm scenarioId="andheri-monsoon" link={{ ...link, road: '<b>Subway</b>' }} />);
    expect(screen.getByRole('heading', { name: t.report.ask.question('<b>Subway</b>') })).toBeTruthy();
    expect(document.querySelector('h2 b')).toBeNull();
    await waitFor(() => expect((screen.getByText(t.report.ask.yes) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText(t.report.ask.yes));
    expect(await screen.findByText(t.report.ask.thanksYes)).toBeTruthy();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toBe('andheri-monsoon');
    expect(report.mock.calls[0]![1]).toMatchObject({ type: 'flood', origin: 'prompt' });
  });

  it('Not sure sends nothing', async () => {
    render(<AskForm scenarioId="andheri-monsoon" link={link} />);
    fireEvent.click(screen.getByText(t.report.ask.notSure));
    expect(await screen.findByText(t.report.ask.thanksNotSure)).toBeTruthy();
    expect(report).not.toHaveBeenCalled();
  });

  it('a second answer for the same road (409) is thanked, not shown as an error', async () => {
    report.mockRejectedValueOnce(new ApiError('CONFLICT', 'already answered', 409));
    render(<AskForm scenarioId="andheri-monsoon" link={link} />);
    await waitFor(() => expect((screen.getByText(t.report.ask.no) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText(t.report.ask.no));
    expect(await screen.findByText(t.report.ask.alreadyAnswered)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the question and shows an error when the network fails', async () => {
    report.mockRejectedValueOnce(new ApiError('NETWORK', 'down'));
    render(<AskForm scenarioId="andheri-monsoon" link={link} />);
    await waitFor(() => expect((screen.getByText(t.report.ask.yes) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText(t.report.ask.yes));
    expect((await screen.findByRole('alert')).textContent).toContain(t.report.errors.network);
    expect(screen.getByText(t.report.ask.yes)).toBeTruthy();
  });

  it('reads in Hindi', () => {
    setCurrentLang('hi');
    render(<AskForm scenarioId="andheri-monsoon" link={link} />);
    expect(screen.getByRole('heading', { name: t.report.ask.question('Andheri Subway') }).textContent).toMatch(/क्या/);
  });
});
