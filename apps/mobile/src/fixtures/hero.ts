import type { Incident, Scenario } from '@vighnaway/contracts';
import { advanceVehicle, buildIncidentIndex, planTrip, snapToEdge, startVehicle } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { evalContext, getGraph } from '@/lib/engine';
import { useIncidents } from '@/stores/incidents';
import { useSettings, type FixtureMode } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { recommendedRoute, useTrip } from '@/stores/trip';
import { planContextKey, runPlanNow, schedulePlan } from '@/features/trip/planner';

type ReportEvent = Extract<Scenario['events'][number], { kind: 'report' }>;

/**
 * Hero-screen fixtures (BUILD_PROMPT 6.10): static scenario states built from the scenario's own
 * report events, used for design review. The UI labels them as fixture data and the live
 * connection is paused while one is shown.
 */
export function fixtureIncident(
  eventId: string,
  status: Incident['status'],
  deviceCount: number,
  overrides: Partial<Incident> = {},
): Incident {
  const ev = andheriScenario.events.find((e): e is ReportEvent => e.id === eventId && e.kind === 'report');
  if (!ev) throw new Error(`No report event ${eventId}`);
  const graph = getGraph(andheriGraph, 'foot');
  const snap = snapToEdge(graph, ev.report.point);
  const edge = snap ? graph.edges[graph.edgeIndex.get(snap.edgeId)!]! : null;
  const edgeIds = edge ? [edge.baseId, ...(edge.reverseIdx >= 0 ? [graph.edges[edge.reverseIdx]!.baseId] : [])] : ['unknown'];
  const type = ev.report.type === 'road_clear' ? 'flood' : ev.report.type;
  return {
    id: `${andheriScenario.id}:fixture:${eventId}`,
    scenarioId: andheriScenario.id,
    type,
    status,
    source: 'simulated',
    depth: type === 'flood' ? ev.report.depth ?? null : null,
    congestion: type === 'congestion' ? ev.report.congestion ?? null : null,
    severity: ev.report.severity ?? null,
    impassable: type === 'closure' || !!ev.report.impassable,
    conflicting: false,
    edgeIds: [...new Set(edgeIds)].sort(),
    point: ev.report.point,
    roadName: edge?.name ?? null,
    reportCount: deviceCount,
    deviceCount,
    createdAtS: ev.atS,
    lastReportAtS: ev.atS,
    updatedAtS: ev.atS,
    verifiedAtS: status === 'verified' ? ev.atS : null,
    verifiedBy: status === 'verified' ? 'simulated_operator' : null,
    closedAtS: null,
    linkedIncidentId: null,
    note: ev.report.description ?? null,
    seq: 1,
    ...overrides,
  };
}

/** Starts the demo trip at simulation time `atS` with the vehicle advanced along route A. */
function startFixtureTrip(atS: number, incidents: Incident[]): void {
  const graph = getGraph(andheriGraph, 'car');
  const origin = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.originId)!;
  const dest = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.destinationId)!;
  const initial = planTrip({
    graph,
    origin: origin.nodeId,
    destination: dest.nodeId,
    incidents: [],
    nowS: 0,
    alerts: andheriScenario.alerts,
    hasAlertInformation: andheriScenario.hasAlertInformation,
    places: andheriScenario.places,
    destinationPlaceId: dest.id,
  });
  const rec = recommendedRoute(initial);
  if (!rec) return;
  const vehicle = advanceVehicle(graph, startVehicle(rec.edgeIds), atS, buildIncidentIndex(incidents), evalContext(andheriScenario, atS));
  const trip = useTrip.getState();
  trip.resetTrip();
  trip.setDestination(dest.id);
  trip.setPlan(initial, planContextKey());
  trip.startTrip(vehicle, atS);
}

export function enterFixture(mode: Exclude<FixtureMode, null>): void {
  useSettings.getState().setFixtureMode(mode);
  if (useSettings.getState().profile !== 'car') useSettings.getState().setProfile('car');
  if (mode === 'noViable') {
    enterNoViableFixture();
    return;
  }
  const ankle = fixtureIncident('ev01-ankle', 'unverified', 1);
  useSim.getState().setFixtureTime(150);
  useIncidents.getState().loadFixture([ankle]);
  startFixtureTrip(100, [ankle]);
  runPlanNow();
  if (mode === 'change') {
    const knee = fixtureIncident('ev01-ankle', 'corroborated', 2, { depth: 'knee', lastReportAtS: 180, updatedAtS: 180, reportCount: 2, seq: 2 });
    useSim.getState().setFixtureTime(190);
    useIncidents.getState().loadFixture([knee]);
    runPlanNow();
  }
}

/**
 * The scripted end state while planning (no trip): verified knee-deep water at Andheri Subway,
 * corroborated heavy congestion, and the verified closure of the road into the destination
 * hospital, so every route to it is blocked and the nearest reachable hospital is offered.
 */
function enterNoViableFixture(): void {
  const knee = fixtureIncident('ev02-knee', 'verified', 2, { reportCount: 2 });
  const congestion = fixtureIncident('ev04-congestion-a', 'corroborated', 2, { reportCount: 2, lastReportAtS: 370, updatedAtS: 370, seq: 2 });
  const closure = fixtureIncident('ev06-closure', 'verified', 1, { lastReportAtS: 480, updatedAtS: 490, seq: 3 });
  const trip = useTrip.getState();
  trip.resetTrip();
  trip.setDestination(andheriScenario.demoTrip.destinationId);
  useSim.getState().setFixtureTime(500);
  useIncidents.getState().loadFixture([knee, congestion, closure]);
  runPlanNow();
}

export function leaveFixture(): void {
  useSettings.getState().setFixtureMode(null);
  useIncidents.getState().leaveFixture();
  useTrip.getState().resetTrip();
  schedulePlan({ showEvaluating: true, delayMs: 0 });
}
