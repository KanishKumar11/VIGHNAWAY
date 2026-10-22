import type { Incident, IncidentsResponse, IncidentUpserted } from '@vighnaway/contracts';

export const SCENARIO = 'andheri-monsoon';

export function incident(id: string, seq: number, overrides: Partial<Incident> = {}): Incident {
  return {
    id,
    scenarioId: SCENARIO,
    type: 'flood',
    status: 'unverified',
    source: 'simulated',
    depth: 'ankle',
    congestion: null,
    severity: null,
    impassable: false,
    conflicting: false,
    edgeIds: ['e1'],
    point: { lat: 19.1, lng: 72.8 },
    roadName: 'Andheri Subway',
    reportCount: 1,
    deviceCount: 1,
    createdAtS: 60,
    lastReportAtS: 60,
    updatedAtS: 60,
    verifiedAtS: null,
    verifiedBy: null,
    closedAtS: null,
    linkedIncidentId: null,
    note: null,
    seq,
    ...overrides,
  };
}

export function response(seq: number, incidents: Incident[], full: boolean, runId = 'run-1'): IncidentsResponse {
  return { scenarioId: SCENARIO, seq, full, runId, simTimeS: 100, incidents };
}

export function upsert(inc: Incident): IncidentUpserted {
  return { scenarioId: SCENARIO, seq: inc.seq, incident: inc, summary: 'test' };
}
