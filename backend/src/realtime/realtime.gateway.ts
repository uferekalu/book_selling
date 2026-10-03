import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { STAFF_ROLES } from '../users/schemas/user.schema.js';
import { RealtimeService, STAFF_ROOM, userRoom } from './realtime.service.js';

type VerifiedToken = AccessTokenPayload & { exp?: number };

interface SocketData {
  user?: VerifiedToken;
  expiry?: NodeJS.Timeout;
}

/**
 * The one Socket.IO endpoint (ARCHITECTURE §12). A socket is accepted only with a valid access
 * token in the handshake (`auth.token`), and joins its rooms server-side: `user:<id>` always, and
 * `staff` for an owner/admin session that passed two-step verification. Clients send nothing
 * else, so there is nothing to subscribe to and nothing to authorise per event. The socket is
 * dropped when its token expires; the client renews the token and connects again, which is also
 * how it rejoins its rooms after any reconnect.
 */
@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const data = client.data as SocketData;
    const user = await this.verify(client);
    if (!user) {
      client.emit('auth:invalid');
      client.disconnect(true);
      return;
    }
    data.user = user;
    await client.join(userRoom(user.sub));
    if (STAFF_ROLES.includes(user.role) && user.mfa) {
      await client.join(STAFF_ROOM);
    }
    if (user.exp) {
      const msLeft = user.exp * 1000 - Date.now();
      data.expiry = setTimeout(
        () => {
          client.emit('auth:expired');
          client.disconnect(true);
        },
        Math.max(msLeft, 0),
      );
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData;
    if (data.expiry) clearTimeout(data.expiry);
  }

  private async verify(client: Socket): Promise<VerifiedToken | null> {
    const token: unknown = (client.handshake.auth as Record<string, unknown>)
      ?.token;
    if (typeof token !== 'string' || !token || token.length > 4096) return null;
    try {
      const payload = await this.jwt.verifyAsync<VerifiedToken>(token);
      // Two-step challenge tokens share the signing key; only access tokens may connect.
      return payload.typ === 'access' ? payload : null;
    } catch (error) {
      this.logger.debug(`Socket rejected: ${(error as Error).message}`);
      return null;
    }
  }
}
