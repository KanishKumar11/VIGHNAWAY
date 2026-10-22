import { HospitalStatesResponseSchema } from '@vighnaway/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTH, resetScenario, SID, startApp, type TestApp } from './helpers';

/** P2-4.a operator-set hospital states. Needs the seeded database (the Andheri hospitals). */

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t?.close();
});
beforeEach(async () => {
  await resetScenario(t);
});

const list = async () => HospitalStatesResponseSchema.parse((await t.http().get(`/scenarios/${SID}/hospitals`)).body);
const put = (placeId: string, body: unknown, headers: Record<string, string> = AUTH) =>
  t.http().put(`/scenarios/${SID}/hospitals/${placeId}`).set(headers).send(body as object);

describe('hospital states', () => {
  it('lists every hospital as accepting, set by nobody, and labels the scenario simulated', async () => {
    const r = await list();
    expect(r.simulated).toBe(true);
    expect(r.hospitals.length).toBeGreaterThanOrEqual(3);
    for (const h of r.hospitals) expect(h).toMatchObject({ state: 'accepting', setAtS: null, setBy: null });
    expect(r.hospitals.map((h) => h.placeId)).toEqual([...r.hospitals.map((h) => h.placeId)].sort());
  });

  it('needs the operator credential', async () => {
    expect((await put('hosp-holy-spirit', { state: 'busy' }, {})).status).toBe(401);
  });

  it('sets busy and diverting, records the operator and time, and setting accepting clears it', async () => {
    const busy = HospitalStatesResponseSchema.parse((await put('hosp-holy-spirit', { state: 'busy' })).body);
    expect(busy.hospitals.find((h) => h.placeId === 'hosp-holy-spirit')).toMatchObject({ state: 'busy', setBy: 'operator' });
    expect(busy.hospitals.find((h) => h.placeId === 'hosp-hbt')?.state).toBe('accepting');
    await put('hosp-hbt', { state: 'diverting' });
    expect((await list()).hospitals.filter((h) => h.state !== 'accepting').map((h) => h.placeId)).toEqual(['hosp-hbt', 'hosp-holy-spirit']);
    await put('hosp-holy-spirit', { state: 'accepting' });
    expect((await list()).hospitals.find((h) => h.placeId === 'hosp-holy-spirit')).toMatchObject({ state: 'accepting', setAtS: null, setBy: null });
  });

  it('a simulation reset clears the states', async () => {
    await put('hosp-holy-spirit', { state: 'diverting' });
    await resetScenario(t);
    expect((await list()).hospitals.every((h) => h.state === 'accepting')).toBe(true);
  });

  it('refuses an unknown state (400), an unknown hospital (404) and a place that is not a hospital (404)', async () => {
    expect((await put('hosp-holy-spirit', { state: 'closed' })).status).toBe(400);
    expect((await put('hosp-holy-spirit', { state: 'busy', extra: 1 })).status).toBe(400);
    expect((await put('hosp-nowhere', { state: 'busy' })).status).toBe(404);
    expect((await put('origin-ramesh-nagar', { state: 'busy' })).status).toBe(404);
  });
});
