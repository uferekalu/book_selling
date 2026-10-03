import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Events the browser listens for. Payloads carry ids only; the client refetches the data. */
export type RealtimeEvent =
  'message:new' | 'message:read' | 'conversation:updated' | 'notification:new';

export const userRoom = (userId: string) => `user:${userId}`;
export const STAFF_ROOM = 'staff';

/**
 * Pushes "something changed" to connected browsers (ARCHITECTURE §12). Best effort by design:
 * data is always persisted first, and the client also refetches on focus and reconnect, so a lost
 * event only delays an update. Call it after the transaction commits, never inside one.
 */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  toUser(userId: string, event: RealtimeEvent, payload: object = {}): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  toStaff(event: RealtimeEvent, payload: object = {}): void {
    this.server?.to(STAFF_ROOM).emit(event, payload);
  }
}
