import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HistoryEntry, HistoryResponse, Incident } from '@vighnaway/contracts';
import { findForbiddenWords } from '@vighnaway/contracts';
import { andheriScenario } from '@vighnaway/scenario-data';
import { AfterActionView } from '@/components/afterAction/AfterActionContent';
import { setCurrentLang, t } from '@/i18n';
import { buildAfterAction } from '@/lib/afterAction';
import type { TripEnv } from '@/lib/demoTrip';
import { parseReceipt, verifyAgainstHistory } from '@/lib/receipt';
import { graphFor } from '@/lib/scenario';
import { makeIncident, scenarioEvent } from './helpers';

/** P2-1: the after-action report is rebuilt from /history alone and says nothing the history does not. */

const env: TripEnv = { graph: graphFor(andheriScenario.demoTrip.profile), scenario: andheriScenario };
const subway = scenarioEvent(andheriScenario, 'ev01-ankle').report.point;
const hospitalRoad = scenarioEvent(andheriScenario, 'ev06-closure').report.point;

/** The scripted run as the API records it: flood, second device, operator verifies, closure, operator verifies. */
function history(): HistoryResponse {
  const ankle = makeIncident({ id: 'inc-flood', type: 'flood', depth: 'ankle', point: subway, createdAtS: 60, lastReportAtS: 60, updatedAtS: 60, seq: 1 });
  const knee: Incident = { ...ankle, depth: 'knee', status: 'corroborated', deviceCount: 2, reportCount: 2, lastReportAtS: 180, updatedAtS: 180, seq: 2 };
  const verified: Incident = { ...knee, status: 'verified', verifiedAtS: 270, verifiedBy: 'simulated_operator', updatedAtS: 270, seq: 3 };
  const closure = makeIncident({ id: 'inc-closure', type: 'closure', point: hospitalRoad, createdAtS: 480, lastReportAtS: 480, updatedAtS: 480, seq: 4 });
  const closureVerified: Incident = { ...closure, status: 'verified', verifiedAtS: 490, verifiedBy: 'simulated_operator', updatedAtS: 490, seq: 5 };
  const entries: HistoryEntry[] = [
    { seq: 1, atS: 60, kind: 'created_incident', summary: 'Flooding (ankle deep) at Andheri Subway reported: Unverified', incident: ankle },
    { seq: 2, atS: 180, kind: 'corroborated', summary: 'Flooding (knee deep) at Andheri Subway marked Corroborated (2 devices)', incident: knee },
    { seq: 3, atS: 270, kind: 'verified', summary: 'Flooding (knee deep) at Andheri Subway verified by operator', incident: verified },
    { seq: 4, atS: 480, kind: 'created_incident', summary: 'Road closed reported: Unverified', incident: closure },
    { seq: 5, atS: 490, kind: 'verified', summary: 'Road closed verified by operator', incident: closureVerified },
  ];
  return { scenarioId: andheriScenario.id, runId: 'run-test', resetSeq: 0, entries };
}

const placeNames = Object.fromEntries(andheriScenario.places.map((p) => [p.id, p.name]));

afterEach(() => {
  cleanup();
  setCurrentLang('en');
});

describe('after-action report (built from /history)', () => {
  const h = history();
  const report = buildAfterAction(env, h);

  it('has one moment per change, with operator actions, route changes and the destination switch', () => {
    expect(report.moments.map((m) => m.atS)).toEqual([60, 180, 270, 480, 490]);
    expect(report.moments.map((m) => m.operator)).toEqual([false, false, true, false, true]);
    expect(report.moments[0]!.change).toBeNull();
    expect(report.moments[1]!.change?.message).toMatch(/^Route changed\. Flooding \(knee deep\) at Andheri Subway/);
    // Verifying the flood does not change the decision, so no change is claimed there.
    expect(report.moments[2]!.change).toBeNull();
    expect(report.moments[4]!.change?.kind).toBe('destination');
    expect(report.summary).toMatchObject({ incidents: 2, reports: 3, operatorActions: 2, routeChanges: 1, destinationSwitches: 1 });
    expect(report.summary.startDestinationId).toBe('hosp-holy-spirit');
    // Without the congestion events of the scripted demo the nearest reachable hospital is Kokilaben.
    expect(report.summary.endDestinationId).toBe('hosp-kokilaben');
  });

  it('compares the recommendation with the usual fastest route under the same reports', () => {
    const afterFlood = report.moments[2]!;
    expect(afterFlood.usualFastest?.blocks).toBeGreaterThan(0);
    expect(afterFlood.recommended?.name).not.toBe(afterFlood.usualFastest?.name);
    expect(afterFlood.recommended?.blocks).toBe(0);
    expect(report.summary.extraMin).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic and carries the provenance a reader can check', () => {
    expect(buildAfterAction(env, h)).toEqual(report);
    expect(report).toMatchObject({ scenarioId: 'andheri-monsoon', simulated: true, runId: 'run-test', graphVersion: env.graph.version });
    expect(report.rulesHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives each moment a receipt that /verify reproduces from the same history', () => {
    for (const m of report.moments) {
      const receipt = parseReceipt(m.receipt)!;
      expect(receipt).not.toBeNull();
      const outcome = verifyAgainstHistory(receipt, h);
      expect(outcome.kind).toBe('checked');
      if (outcome.kind === 'checked') expect(outcome.verification.same).toBe(true);
    }
  });

  it('an empty history gives an empty report', () => {
    const empty = buildAfterAction(env, { ...h, entries: [] });
    expect(empty.moments).toEqual([]);
    expect(empty.summary).toMatchObject({ incidents: 0, reports: 0, operatorActions: 0, routeChanges: 0 });
  });
});

describe('after-action view', () => {
  const report = buildAfterAction(env, history());

  it('labels the scenario Simulated, shows the timeline and never promises anything', () => {
    for (const lang of ['en', 'hi', 'mr'] as const) {
      setCurrentLang(lang);
      const { container, unmount } = render(<AfterActionView report={report} placeNames={placeNames} />);
      const text = container.textContent ?? '';
      expect(text).toContain(t.afterAction.meta.simulated);
      expect(container.querySelectorAll('ol > li').length).toBe(report.moments.length);
      expect(findForbiddenWords(text)).toEqual([]);
      expect(text).not.toMatch(/saved lives|hazard-free|guarantee/i);
      expect(text).not.toMatch(/सुरक्षित|सुरक्षा|खात्री/);
      unmount();
    }
  });

  it('states the figures in words and links each moment to /verify', () => {
    const { container } = render(<AfterActionView report={report} placeNames={placeNames} />);
    expect(container.textContent).toContain(t.afterAction.hazardsLine(report.summary.recommendedHazardsAtEnd, report.summary.usualHazardsAtEnd));
    expect(container.textContent).toContain(t.afterAction.destinationLine('Holy Spirit Hospital', 'Kokilaben Dhirubhai Ambani Hospital'));
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toHaveLength(report.moments.length);
    expect(links[0]).toBe(`/verify?r=${report.moments[0]!.receipt}`);
  });

  it('shows an empty message for a run with nothing recorded', () => {
    const empty = buildAfterAction(env, { ...history(), entries: [] });
    const { container } = render(<AfterActionView report={empty} placeNames={placeNames} />);
    expect(container.textContent).toContain(t.afterAction.empty);
  });
});
