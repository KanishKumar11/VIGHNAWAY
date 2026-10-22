import { fireEvent, render, screen } from '@testing-library/react-native';
import { emptyDraft, validateReport, type ReportDraft } from '@/features/report/validation';

jest.mock('expo-router', () => ({
  router: { dismiss: jest.fn(), back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
  usePreventRemove: jest.fn(),
}));

const DEVICE = 'vw-test-device-01';
const point = { lat: 19.116357, lng: 72.846569 };
const draft = (p: Partial<ReportDraft>): ReportDraft => ({ ...emptyDraft, point, ...p });

describe('validateReport', () => {
  it('requires a type', () => {
    const r = validateReport(draft({}), DEVICE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.type).toBe('Choose what you saw');
  });

  it('requires a congestion level for congestion', () => {
    const r = validateReport(draft({ type: 'congestion' }), DEVICE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.congestion).toBe('Choose a congestion level');
    const ok = validateReport(draft({ type: 'congestion', congestion: 'heavy' }), DEVICE);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.input.congestion).toBe('heavy');
  });

  it('accepts a 200-character note and rejects 201 characters', () => {
    expect(validateReport(draft({ type: 'flood', note: 'a'.repeat(200) }), DEVICE).ok).toBe(true);
    const r = validateReport(draft({ type: 'flood', note: 'a'.repeat(201) }), DEVICE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.note).toBe('Note is too long');
    // Surrounding whitespace is trimmed before counting, as the API does.
    expect(validateReport(draft({ type: 'flood', note: `  ${'a'.repeat(200)}  ` }), DEVICE).ok).toBe(true);
  });

  it('builds a strict ReportInput: depth only for flood, "Not sure" sends no depth, no timestamps', () => {
    const r = validateReport(draft({ type: 'flood', depth: 'knee', note: ' water ' }), DEVICE);
    expect(r).toEqual({
      ok: true,
      input: { type: 'flood', depth: 'knee', point, observedPersonally: true, deviceId: DEVICE, description: 'water' },
    });
    const unsure = validateReport(draft({ type: 'flood', depth: 'not_sure' }), DEVICE);
    expect(unsure.ok && 'depth' in unsure.input).toBe(false);
    const debris = validateReport(draft({ type: 'debris', severity: 'high', impassable: true }), DEVICE);
    expect(debris.ok && debris.input).toMatchObject({ type: 'debris', severity: 'high', impassable: true });
  });

  it('needs a location', () => {
    const r = validateReport({ ...emptyDraft, type: 'closure' }, DEVICE);
    expect(r.ok).toBe(false);
  });
});

describe('Report screen', () => {
  // Imported lazily so the expo-router mock above applies.
  const { ReportScreen } = require('@/features/report/ReportScreen') as typeof import('@/features/report/ReportScreen');

  it('shows "Choose what you saw" when sending without a type', async () => {
    await render(<ReportScreen />);
    await fireEvent.press(screen.getByTestId('send-report'));
    expect(screen.getByText('Choose what you saw')).toBeTruthy();
  });

  it('asks for a congestion level, and counts the note against 200 characters', async () => {
    await render(<ReportScreen />);
    await fireEvent.press(screen.getByTestId('type-congestion'));
    await fireEvent.changeText(screen.getByTestId('report-note'), 'b'.repeat(201));
    expect(screen.getByTestId('note-counter')).toHaveTextContent('201/200');
    await fireEvent.press(screen.getByTestId('send-report'));
    expect(screen.getByText('Choose a congestion level')).toBeTruthy();
    expect(screen.getByText('Note is too long')).toBeTruthy();
  });
});
