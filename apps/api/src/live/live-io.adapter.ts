import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { IncomingMessage } from 'node:http';
import type { ServerOptions } from 'socket.io';
import { type AppConfig, isOriginAllowed } from '../config';

/**
 * socket.io with the same origin allowlist as HTTP. `cors` covers browser polling;
 * `allowRequest` also refuses WebSocket upgrades from browser origins not on the list.
 */
export class LiveIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: AppConfig,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): unknown {
    const allowed = (origin: string | undefined) => isOriginAllowed(this.config, origin);
    return super.createIOServer(port, {
      ...options,
      maxHttpBufferSize: 256 * 1024,
      cors: {
        origin: (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) =>
          cb(null, allowed(origin)),
        methods: ['GET', 'POST'],
      },
      allowRequest: (req: IncomingMessage, cb: (err: string | null | undefined, ok: boolean) => void) =>
        cb(null, allowed(req.headers.origin)),
    } satisfies Partial<ServerOptions>);
  }
}
