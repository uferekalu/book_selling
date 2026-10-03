import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Global so any service can push "something changed" after its write commits. No dependencies,
 * so module tests can import it without the auth stack; until the gateway starts, pushes are
 * no-ops.
 */
@Global()
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}

/** The Socket.IO endpoint itself (needs the access-token verifier). */
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway],
})
export class RealtimeGatewayModule {}
