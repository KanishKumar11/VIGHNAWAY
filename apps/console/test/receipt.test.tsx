import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HistoryEntry, HistoryResponse, Incident } from '@vighnaway/contracts';
import { decodeReceipt, encodeReceipt } from '@vighnaway/engine';
import { andheriScenario } from '@vighnaway/scenario-data';
import { setCurrentLang, t } from '@/i18n';
import { graphFor } from '@/lib/scenario';
import { makeReceipt, parseReceipt, tokenFromText, verifyAgainstHistory } from '@/lib/receipt';
import { verifyUrl } from '@/lib/env';
import { Outcome } from '@/components/verify/VerifyContent';

/** P1-2: a decision receipt made in the console verifies from /history, and a tampered one does not. */

const scenario = andheriScenario;
const dest = scenario.demoTrip.destinationId;
const NOW = 100;

/** A hard closure on the middle of the route the engine picks with no incidents. */
function closureOnRoute(): Incident {
  const graph = graphFor(scenario.demoTrip.profile);
  const first = makeReceipt(scenario, [], 0, NOW, dest).plan;
  const rec = first.routes.find((r) => r.routeId === first.recommendedRouteId)!;
  const edge = graph.edges[graph.edgeIndex.get(rec.edgeIds[Math.floor(rec.edgeIds.length / 2)]!)!]!;
  return {
    id: 'rcpt:closure',
    scenarioId: scenario.id,
    type: 'closure',
    status: 'verified',
    source: 'simulated',
    depth: null,
    congestion: null,
    severity: null,
    impassable: true,
    conflicting: false,
    edgeIds: [edge.baseId],
    point: { lat: 19.1, lng: 72.85 },
    roadName: edge.name,
    reportCount: 1,
    deviceCount: 1,
    createdAtS: 60,
    lastReportAtS: 60,
    updatedAtS: 60,
    verifiedAtS: 60,
    verifiedBy: 'simulated_operator',
    closedAtS: null,
    linkedIncidentId: null,
    note: null,
    seq: 1,
  };
}

const history = (entries: HistoryEntry[]): HistoryResponse => ({ scenarioId: scenario.id, runId: 'run-1', resetSeq: 0, entries });
const entry = (incident: Incident): HistoryEntry => ({ seq: incident.seq, atS: incident.updatedAtS, kind: 'verified', summary: 'Closure verified', incident });

afterEach(() => {
  cleanup();
  setCurrentLang('en');
});

describe('decision receipts in the console', () => {
  it('a receipt made now verifies from the recorded history: same decision', () => {
    const closure = closureOnRoute();
    const made = makeReceipt(scenario, [closure], 1, NOW, dest);
    expect(made.receipt.simulated).toBe(true);
    expect(made.receipt.seq).toBe(1);
    const out = verifyAgainstHistory(made.receipt, history([entry(closure)]));
    expect(out.kind).toBe('checked');
    if (out.kind === 'checked') {
      expect(out.verification.same).toBe(true);
      expect(out.incidentCount).toBe(1);
    }
  });

  it('works from the link a QR code carries', () => {
    const made = makeReceipt(scenario, [], 0, NOW, dest);
    const url = verifyUrl(made.token, 'https://vighnaway.example');
    expect(url).toBe(`https://vighnaway.example/verify?r=${made.token}`);
    expect(tokenFromText(url)).toBe(made.token);
    expect(tokenFromText(`  ${made.token}  `)).toBe(made.token);
    expect(parseReceipt(url)).toEqual(made.receipt);
    const out = verifyAgainstHistory(parseReceipt(url)!, history([]));
    expect(out.kind === 'checked' && out.verification.same).toBe(true);
  });

  it('a tampered receipt shows a mismatch', () => {
    const closure = closureOnRoute();
    const made = makeReceipt(scenario, [closure], 1, NOW, dest);
    const forged = encodeReceipt({ ...made.receipt, planHash: '0000000000000000' });
    const out = verifyAgainstHistory(parseReceipt(forged)!, history([entry(closure)]));
    expect(out.kind === 'checked' && out.verification.same).toBe(false);
    expect(out.kind === 'checked' && out.verification.checks.find((c) => c.name === 'plan')!.ok).toBe(false);
    // A cut-short token is not a receipt at all.
    expect(parseReceipt(made.token.slice(0, 40))).toBeNull();
    expect(parseReceipt('not a receipt')).toBeNull();
  });

  it('a history that lacks the incident does not verify, and says the inputs differ', () => {
    const closure = closureOnRoute();
    const made = makeReceipt(scenario, [closure], 1, NOW, dest);
    const out = verifyAgainstHistory(made.receipt, history([]));
    expect(out.kind === 'checked' && out.verification.checks.find((c) => c.name === 'inputs')!.ok).toBe(false);
  });

  it('an unknown scenario is reported, not guessed', () => {
    const made = makeReceipt(scenario, [], 0, NOW, dest);
    const out = verifyAgainstHistory({ ...decodeReceipt(made.token)!, scenarioId: 'somewhere-else' }, history([]));
    expect(out.kind).toBe('unknown_scenario');
  });

  it('shows "Same decision" with the hash, the Simulated label and what it does not prove', () => {
    const made = makeReceipt(scenario, [], 0, NOW, dest);
    render(<Outcome outcome={verifyAgainstHistory(made.receipt, history([]))} />);
    expect(screen.getByText(t.verify.same(made.receipt.planHash.slice(0, 4)))).toBeTruthy();
    expect(screen.getByText(new RegExp(t.verify.simulated))).toBeTruthy();
    expect(screen.getByText(t.verify.notProvesBody)).toBeTruthy();
  });

  it('shows "Different decision" and the failing check for a tampered receipt, in Hindi too', () => {
    const made = makeReceipt(scenario, [], 0, NOW, dest);
    const out = verifyAgainstHistory({ ...made.receipt, planHash: 'ffffffffffffffff' }, history([]));
    render(<Outcome outcome={out} />);
    expect(screen.getByText(t.verify.differs)).toBeTruthy();
    expect(screen.getAllByText(t.verify.mismatch).length).toBe(1);
    cleanup();
    setCurrentLang('hi');
    render(<Outcome outcome={out} />);
    expect(screen.getByText('अलग निर्णय')).toBeTruthy();
  });
});
