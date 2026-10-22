import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { andheriScenario } from '@vighnaway/scenario-data';
import type { Incident } from '@vighnaway/contracts';
import { DENSE_MARKERS, markerDensity } from '@/lib/incidents';
import { IncidentMarker } from '@/components/shared/IncidentMarker';

const incident = (over: Partial<Incident> = {}): Incident =>
  ({
    id: 'i1',
    scenarioId: andheriScenario.id,
    type: 'congestion',
    point: { lat: 19.12, lng: 72.85 },
    status: 'unverified',
    source: 'live_feed',
    depth: null,
    congestion: 'heavy',
    severity: null,
    impassable: false,
    conflicting: false,
    edgeIds: [],
    roadName: 'Andheri-Kurla Road',
    reportCount: 1,
    deviceCount: 0,
    createdAtS: 0,
    lastReportAtS: 0,
    updatedAtS: 0,
    verifiedAtS: null,
    verifiedBy: null,
    closedAtS: null,
    linkedIncidentId: null,
    note: null,
    seq: 1,
    ...over,
  }) as Incident;

describe('marker density', () => {
  afterEach(cleanup);

  it('keeps full markers for a handful of incidents and goes compact for a busy feed', () => {
    expect(markerDensity(3)).toBe('full');
    expect(markerDensity(DENSE_MARKERS)).toBe('full');
    expect(markerDensity(DENSE_MARKERS + 1)).toBe('compact');
  });

  it('compact markers drop the age pill but keep the full description for screen readers', () => {
    const { container, getByRole } = render(<IncidentMarker incident={incident()} nowS={3600} pulseKey={0} density="compact" />);
    expect(container.textContent).toBe('');
    expect(getByRole('button').getAttribute('aria-label')).toContain('Andheri-Kurla Road');
  });

  it('the selected incident always shows in full, with its age', () => {
    const { container } = render(<IncidentMarker incident={incident()} nowS={3600} pulseKey={0} density="compact" selected />);
    expect(container.textContent).not.toBe('');
  });
});
