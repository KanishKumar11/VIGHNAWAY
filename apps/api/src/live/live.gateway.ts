import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  type ErrorCode,
  IdSchema,
  JoinPayloadSchema,
  LIVE_NAMESPACE,
  SOCKET_EVENTS,
  TripPositionSchema,
} from '@vighnaway/contracts';
import type { Namespace, Socket } from 'socket.io';
import { ScenariosService } from '../scenarios/scenarios.service';
import { LiveService, roomFor } from './live.service';

/** Minimum real time between accepted trip.position messages from one socket (~1/s). */
export const TRIP_MIN_INTERVAL_MS = 900;

type Ack =
  | { ok: true; seq: number; runId: string }
  | { ok: true }
  | { ok: false; error: { code: ErrorCode; message: string } };

const fail = (code: ErrorCode, message: string): Ack => ({ ok: false, error: { code, message } });

interface SocketData {
  scenarioId?: string;
  lastTripAt?: number;
}

@WebSocketGateway({ namespace: LIVE_NAMESPACE })
export class LiveGateway implements OnGatewayInit {
  private readonly logger = new Logger('LiveGateway');

  constructor(
    @Inject(LiveService) private readonly live: LiveService,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
  ) {}

  afterInit(ns: Namespace): void {
    this.live.attach(ns);
  }

  /** `join { scenarioId }` → ack `{ ok, seq, runId }`; one scenario room per socket. */
  @SubscribeMessage(SOCKET_EVENTS.join)
  async join(@MessageBody() body: unknown, @ConnectedSocket() socket: Socket): Promise<Ack> {
    const parsed = JoinPayloadSchema.safeParse(body);
    if (!parsed.success) return fail('VALIDATION_FAILED', 'join needs { scenarioId }');
    const { scenarioId } = parsed.data;
    const row = await this.scenarios.getRow(scenarioId);
    if (!row) return fail('NOT_FOUND', `Unknown scenario ${scenarioId}`);
    const data = socket.data as SocketData;
    if (data.scenarioId && data.scenarioId !== scenarioId) await socket.leave(roomFor(data.scenarioId));
    data.scenarioId = scenarioId;
    await socket.join(roomFor(scenarioId));
    const latest = this.live.latestTrip(scenarioId);
    if (latest) setImmediate(() => socket.emit(SOCKET_EVENTS.tripPosition, latest));
    return { ok: true, seq: row.seq, runId: row.runId };
  }

  /** Phone → room relay of the demo vehicle. Display only; kept in memory, latest per scenario. */
  @SubscribeMessage(SOCKET_EVENTS.tripPosition)
  trip(@MessageBody() body: unknown, @ConnectedSocket() socket: Socket): Ack {
    const data = socket.data as SocketData;
    const now = Date.now();
    if (data.lastTripAt !== undefined && now - data.lastTripAt < TRIP_MIN_INTERVAL_MS) {
      return fail('RATE_LIMITED', 'trip.position is accepted at most once per second');
    }
    const parsed = TripPositionSchema.safeParse(body);
    if (!parsed.success) return fail('VALIDATION_FAILED', 'Invalid trip.position');
    const pos = parsed.data;
    if (!IdSchema.safeParse(pos.scenarioId).success || data.scenarioId !== pos.scenarioId) {
      return fail('UNAUTHORIZED', 'join the scenario before sending trip.position');
    }
    data.lastTripAt = now;
    this.live.setTrip(pos);
    socket.to(roomFor(pos.scenarioId)).emit(SOCKET_EVENTS.tripPosition, pos);
    return { ok: true };
  }
}
