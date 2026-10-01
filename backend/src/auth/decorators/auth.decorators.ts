import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../../users/schemas/user.schema.js';
import type { AccessTokenPayload } from '../interfaces/auth.types.js';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to these roles (on top of the global sign-in requirement). A staff role
 * (admin/owner) also requires a session that passed two-step verification.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export type AuthenticatedRequest = Request & { user?: AccessTokenPayload };

/** The signed-in user's token claims. Only on routes that aren't `@Public()`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user)
      throw new Error('CurrentUser used on a route without authentication');
    return user;
  },
);

/** Claims when present, `null` for a guest. For `@Public()` routes that personalise (e.g. the cart). */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload | null =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user ?? null,
);
