import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  IS_PUBLIC_KEY,
  OPTIONAL_AUTH_KEY,
} from '../../common/decorators/public.decorator.js';
import { STAFF_ROLES, type UserRole } from '../../users/schemas/user.schema.js';
import {
  ROLES_KEY,
  type AuthenticatedRequest,
} from '../decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../interfaces/auth.types.js';

function bearerToken(request: AuthenticatedRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Global, default-deny authentication (ARCHITECTURE §5): every route needs a valid access token
 * unless marked `@Public()`. On public routes a valid token is still attached (personalisation),
 * and an invalid one is ignored rather than rejected, except on `@OptionalAuth()` routes, where a
 * stale token gets 401 so the client renews it.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const token = bearerToken(request);

    let payload: AccessTokenPayload | null = null;
    if (token) {
      try {
        const verified = await this.jwt.verifyAsync<AccessTokenPayload>(token);
        // Challenge tokens are signed with the same key; only real access tokens authenticate.
        if (verified.typ === 'access') payload = verified;
      } catch {
        payload = null;
      }
    }
    if (payload) request.user = payload;
    if (isPublic) {
      const optionalAuth = this.reflector.getAllAndOverride<boolean>(
        OPTIONAL_AUTH_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (optionalAuth && token && !payload) {
        throw new UnauthorizedException('Your session expired');
      }
      return true;
    }
    if (!payload) throw new UnauthorizedException('Please sign in to continue');
    return true;
  }
}

/** Enforces `@Roles()`. Staff roles additionally need a two-step-verified session. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException('Please sign in to continue');
    if (!required.includes(user.role)) {
      throw new ForbiddenException("You don't have permission to do that");
    }
    if (
      STAFF_ROLES.includes(user.role) &&
      required.some((role) => STAFF_ROLES.includes(role)) &&
      !user.mfa
    ) {
      throw new ForbiddenException({
        message:
          'Two-step verification is required for staff accounts. Set it up under Account → Security.',
        code: 'two_factor_required',
      });
    }
    return true;
  }
}
