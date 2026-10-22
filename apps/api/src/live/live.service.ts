import { Injectable } from '@nestjs/common';
import {
  type IncidentUpserted,
  SOCKET_EVENTS,
  type SimReset,
  type SimState,
  type SimTick,
  type TripPosition,
} from '@vighnaway/contracts';
import type { Namespace } from 'socket.io';

export const roomFor = (scenarioId: string): string => `scenario:${scenarioId}`;

/**
 * Emits live events to scenario rooms and keeps the latest demo-vehicle position per scenario
 * in memory (display only; it never affects anything else).
 */
@Injectable()
export class LiveService {
  private ns: Namespace | null = null;
  private readonly trips = new Map<string, TripPosition>();

  attach(ns: Namespace): void {
    this.ns = ns;
  }

  private emit(scenarioId: string, event: string, payload: unknown): void {
    this.ns?.to(roomFor(scenarioId)).emit(event, payload);
  }

  incidentUpserted(payload: IncidentUpserted): void {
    this.emit(payload.scenarioId, SOCKET_EVENTS.incidentUpserted, payload);
  }

  simState(state: SimState): void {
    this.emit(state.scenarioId, SOCKET_EVENTS.simState, state);
  }

  simTick(tick: SimTick): void {
    this.emit(tick.scenarioId, SOCKET_EVENTS.simTick, tick);
  }

  simReset(reset: SimReset): void {
    this.emit(reset.scenarioId, SOCKET_EVENTS.simReset, reset);
  }

  latestTrip(scenarioId: string): TripPosition | undefined {
    return this.trips.get(scenarioId);
  }

  setTrip(position: TripPosition): void {
    this.trips.set(position.scenarioId, position);
  }

  clearTrip(scenarioId: string): void {
    this.trips.delete(scenarioId);
  }
}
