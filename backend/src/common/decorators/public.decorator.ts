import { applyDecorators, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without authentication. The global default-deny guard (BS-4) reads
 * this. Anything called by an external system (health checks, provider webhooks) needs it.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OPTIONAL_AUTH_KEY = 'optionalAuth';

/**
 * Open to guests AND personalised for signed-in users (cart, checkout). Unlike plain `@Public()`,
 * a token that is present but expired or invalid gets a 401, so the client renews the session and
 * retries instead of being silently treated as a guest (which would show a signed-in buyer an
 * empty guest cart).
 */
export const OptionalAuth = () =>
  applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, true),
    SetMetadata(OPTIONAL_AUTH_KEY, true),
  );
