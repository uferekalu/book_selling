import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without authentication. The global default-deny guard (BS-4) reads
 * this. Anything called by an external system (health checks, provider webhooks) needs it.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
