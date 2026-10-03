import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO with the same allowed origins as the HTTP API. The browser connects to the API's own
 * address, not through the site's `/api` proxy (Vercel rewrites can't carry WebSockets), so CORS
 * applies; authentication is the access token, never a cookie, so credentials stay off.
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      path: options?.path ?? '/socket.io',
      cors: { origin: this.origins, credentials: false },
      serveClient: false,
      // Clients send nothing but the handshake; keep inbound frames tiny.
      maxHttpBufferSize: 16 * 1024,
    } as ServerOptions);
  }
}
