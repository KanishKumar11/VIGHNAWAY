/**
 * Offline replay of a scenario for tuning and tests: applies scenario events with an in-memory
 * approximation of the API's report rules, drives the demo vehicle with the engine, and records
 * every plan. The real rules run in apps/api (PostGIS); apps/api tests replay the scenario through
 * the real service and assert the same outcomes. This file is a development tool, never shipped.
 */
import type { GraphFile, Incident, LatLng, PlanResult, Scenario } from '@vighnaway/contracts';
import { isOpenStatus } from '@vighnaway/contracts';
import {
  advanceVehicle,
  alertContext,
  followPlan,
  haversineM,
  loadGraph,
  planHash,
  planTrip,
  replanFrom,
  snapToEdge,
  startVehicle,
  vehiclePosition,
  type VehicleState,
} from '@vighnaway/engine';

const DEPTH_RANK = { ankle: 1, knee: 2, waist: 3 } as const;
const CONGESTION_RANK = { moderate: 1, heavy: 2, standstill: 3 } as const;
const SEVERITY_RANK = { low: 1, medium: 2, high: 3 } as const;
export const EXTENT_M = { congestion: 600, default: 60 } as const;

interface StoredReport {
  id: string;
  incidentId: string;
  deviceId: string;
  point: LatLng;
  atS: number;
}

export interface ReplayLog {
  atS: number;
  kind: string;
  text: string;
  recommended: string | null;
  etaS: number | null;
  vehicleEdge: string | null;
  vehicleRoadName: string | null;
  hash: string;
}

export function replayScenario(scenario: Scenario, graphFile: GraphFile, opts: { stepS?: number; untilS?: number } = {}) {
  const stepS = opts.stepS ?? 5;
  const untilS = opts.untilS ?? 1800;
  const raw = loadGraph(graphFile, 'foot'); // every edge, for snapping
  const graph = loadGraph(graphFile, scenario.demoTrip.profile);
  const placeById = new Map(scenario.places.map((p) => [p.id, p]));
  const origin = placeById.get(scenario.demoTrip.originId)!;
  let destination = placeById.get(scenario.demoTrip.destinationId)!;
  const incidents = new Map<string, Incident>();
  const reports: StoredReport[] = [];
  const eventIncident = new Map<string, string>();
  let seq = 0;
  const log: ReplayLog[] = [];

  const edgeName = (id: string | null) => {
    if (!id) return null;
    const i = graph.edgeIndex.get(id);
    return i === undefined ? null : graph.edges[i]!.name;
  };

  function extent(point: LatLng, type: string): { edgeIds: string[]; snapped: string; road: string | null } | null {
    const snap = snapToEdge(raw, point);
    if (!snap || snap.distanceM > 30) return null;
    const e = raw.edges[raw.edgeIndex.get(snap.edgeId)!]!;
    const radius = type === 'congestion' ? EXTENT_M.congestion : EXTENT_M.default;
    const ids = new Set<string>([e.baseId]);
    if (e.reverseIdx >= 0) ids.add(raw.edges[e.reverseIdx]!.baseId);
    if (e.name) {
      for (const other of raw.edges) {
        if (other.virtual || other.name !== e.name) continue;
        const s = snapToEdge(raw, point, [other.id]);
        if (s && s.distanceM <= radius) ids.add(other.baseId);
      }
    }
    return { edgeIds: [...ids].sort(), snapped: e.baseId, road: e.name };
  }

  function applyReport(evId: string, r: Scenario['events'][number] & { kind: 'report' }, nowS: number) {
    const rep = r.report;
    const ext = extent(rep.point, rep.type);
    if (!ext) return `rejected: not on a known road`;
    if (rep.type === 'road_clear') {
      const near = [...incidents.values()].filter(
        (i) => isOpenStatus(i.status) && reports.some((x) => x.incidentId === i.id && haversineM(x.point, rep.point) <= 150),
      );
      for (const i of near) incidents.set(i.id, { ...i, conflicting: true, seq: ++seq, updatedAtS: nowS });
      return `road clear: ${near.length} incident(s) marked conflicting`;
    }
    const open = [...incidents.values()]
      .filter((i) => i.type === rep.type && isOpenStatus(i.status))
      .filter((i) => reports.some((x) => x.incidentId === i.id && haversineM(x.point, rep.point) <= 150))
      .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    let inc: Incident;
    if (!open) {
      inc = {
        id: `${scenario.id}:inc:${evId}`,
        scenarioId: scenario.id,
        type: rep.type,
        status: 'unverified',
        source: 'simulated',
        depth: rep.type === 'flood' ? rep.depth ?? null : null,
        congestion: rep.type === 'congestion' ? rep.congestion ?? null : null,
        severity: rep.type === 'debris' || rep.type === 'accident' ? rep.severity ?? null : null,
        impassable: rep.type === 'closure' ? true : !!rep.impassable,
        conflicting: false,
        edgeIds: ext.edgeIds,
        point: rep.point,
        roadName: ext.road,
        reportCount: 0,
        deviceCount: 0,
        createdAtS: nowS,
        lastReportAtS: nowS,
        updatedAtS: nowS,
        verifiedAtS: null,
        verifiedBy: null,
        closedAtS: null,
        linkedIncidentId: null,
        note: rep.description ?? null,
        seq: 0,
      };
    } else {
      inc = { ...open, edgeIds: [...new Set([...open.edgeIds, ...ext.edgeIds])].sort() };
      if (rep.depth && (!inc.depth || DEPTH_RANK[rep.depth] > DEPTH_RANK[inc.depth])) inc.depth = rep.depth;
      if (rep.congestion && (!inc.congestion || CONGESTION_RANK[rep.congestion] > CONGESTION_RANK[inc.congestion])) inc.congestion = rep.congestion;
      if (rep.severity && (!inc.severity || SEVERITY_RANK[rep.severity] > SEVERITY_RANK[inc.severity])) inc.severity = rep.severity;
      if (rep.impassable) inc.impassable = true;
      if (rep.description) inc.note = rep.description;
    }
    const dup = reports.find(
      (x) => x.deviceId === rep.deviceId && haversineM(x.point, rep.point) <= 150 && nowS - x.atS <= 600,
    );
    if (dup) {
      dup.point = rep.point;
      dup.atS = nowS;
    } else {
      reports.push({ id: `${evId}:r`, incidentId: inc.id, deviceId: rep.deviceId, point: rep.point, atS: nowS });
    }
    const mine = reports.filter((x) => x.incidentId === inc.id);
    const devicesNear = new Set(
      mine.filter((x) => haversineM(x.point, rep.point) <= 150 && nowS - x.atS <= 1800).map((x) => x.deviceId),
    );
    inc.reportCount = mine.length;
    inc.deviceCount = new Set(mine.map((x) => x.deviceId)).size;
    if (inc.status === 'unverified' && devicesNear.size >= 2) inc.status = 'corroborated';
    inc.lastReportAtS = nowS;
    inc.updatedAtS = nowS;
    inc.seq = ++seq;
    incidents.set(inc.id, inc);
    eventIncident.set(evId, inc.id);
    return `${inc.type} ${inc.status} on ${ext.road} (${inc.edgeIds.length} edges)`;
  }

  const conditions = (nowS: number) => ({
    incidents: [...incidents.values()],
    nowS,
    alerts: scenario.alerts,
    hasAlertInformation: scenario.hasAlertInformation,
  });

  // Initial plan and trip start.
  let plan: PlanResult = planTrip({
    graph,
    origin: origin.nodeId,
    destination: destination.nodeId,
    ...conditions(0),
    places: scenario.places,
    destinationPlaceId: destination.id,
  });
  const record = (atS: number, kind: string, text: string, p: PlanResult, v: VehicleState | null) => {
    const rec = p.routes.find((r) => r.routeId === p.recommendedRouteId) ?? null;
    const pos = v ? vehiclePosition(graph, v) : null;
    log.push({
      atS,
      kind,
      text,
      recommended: rec?.name ?? null,
      etaS: rec ? rec.etaS + p.leadInS : null,
      vehicleEdge: pos?.edgeId ?? null,
      vehicleRoadName: edgeName(pos?.edgeId ?? null),
      hash: planHash(p),
    });
  };
  record(0, 'plan', 'initial plan', plan, null);
  const initialPlan = plan;
  let vehicle: VehicleState = startVehicle(plan.routes.find((r) => r.routeId === plan.recommendedRouteId)?.edgeIds ?? []);

  const events = [...scenario.events].sort((a, b) => a.atS - b.atS || (a.id < b.id ? -1 : 1));
  let next = 0;
  for (let t = stepS; t <= untilS && !vehicle.arrived; t += stepS) {
    vehicle = advanceVehicle(graph, vehicle, stepS, [...incidents.values()], alertContext(scenario.alerts, scenario.hasAlertInformation, t), scenario.demoTrip.vehicleSpeedFactor);
    let changed = false;
    const notes: string[] = [];
    while (next < events.length && events[next]!.atS <= t) {
      const ev = events[next++]!;
      if (ev.kind === 'report') notes.push(`${ev.id}: ${applyReport(ev.id, ev, ev.atS)}`);
      else {
        const id = eventIncident.get(ev.targetEventId);
        const inc = id ? incidents.get(id) : undefined;
        if (inc) {
          const status = ev.kind === 'verify' ? 'verified' : ev.kind === 'resolve' ? 'resolved' : 'dismissed';
          incidents.set(inc.id, {
            ...inc,
            status,
            verifiedAtS: ev.kind === 'verify' ? ev.atS : inc.verifiedAtS,
            verifiedBy: ev.kind === 'verify' ? 'simulated_operator' : inc.verifiedBy,
            closedAtS: ev.kind === 'verify' ? null : ev.atS,
            updatedAtS: ev.atS,
            seq: ++seq,
          });
          notes.push(`${ev.id}: ${ev.kind} ${inc.id}`);
        }
      }
      changed = true;
    }
    if (changed && !vehicle.arrived) {
      const pos = vehiclePosition(graph, vehicle)!;
      const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId);
      plan = replanFrom({
        graph,
        destination: destination.nodeId,
        currentRoute: vehicle.edgeIds.slice(vehicle.index),
        vehicle: { edgeId: pos.edgeId, fraction: vehicle.fraction },
        ...conditions(t),
        places: scenario.places,
        destinationPlaceId: destination.id,
      });
      if (plan.recommendedRouteId) vehicle = followPlan(graph, vehicle, plan);
      else if (plan.reachable) {
        destination = placeById.get(plan.reachable.placeId)!;
        notes.push(`switching destination to ${destination.name}`);
        plan = replanFrom({
          graph,
          destination: destination.nodeId,
          currentRoute: vehicle.edgeIds.slice(vehicle.index),
          vehicle: { edgeId: pos.edgeId, fraction: vehicle.fraction },
          ...conditions(t),
          places: scenario.places,
          destinationPlaceId: destination.id,
        });
        if (plan.recommendedRouteId) vehicle = followPlan(graph, vehicle, plan);
      }
      record(t, 'event', `${notes.join('; ')} | change: ${plan.change?.message ?? plan.notices.map((n) => n.message).join(' / ') ?? 'none'}${rec ? '' : ''}`, plan, vehicle);
    }
  }
  record(untilS, 'end', vehicle.arrived ? `arrived at ${destination.name}` : 'stopped', plan, vehicle);
  return { log, initialPlan, finalPlan: plan, incidents: [...incidents.values()], vehicle };
}
