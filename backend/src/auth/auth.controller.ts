import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { Client, type ClientInfo } from '../common/http/client-info.js';
import { toPublicUser, type PublicUser } from '../users/dto/user.dto.js';
import { UsersService } from '../users/users.service.js';
import { AuthService, type AuthResult } from './auth.service.js';
import { CurrentUser } from './decorators/auth.decorators.js';
import {
  ChangePasswordDto,
  DisableTwoFactorDto,
  EmailDto,
  LoginDto,
  PasswordConfirmDto,
  RegisterDto,
  SecondFactorDto,
  SetPasswordFromLinkDto,
  TokenDto,
  TotpCodeDto,
} from './dto/auth.dto.js';
import type {
  AccessTokenPayload,
  IssuedSession,
} from './interfaces/auth.types.js';
import { SessionService } from './session.service.js';

export const REFRESH_COOKIE = 'bs_rt';
/**
 * The browser only ever calls the API through the storefront's own `/api/*` proxy
 * (ARCHITECTURE §5), so the cookie is first-party and can be `SameSite=Strict`, the strongest
 * CSRF setting, in every environment. Its path is the browser-visible `/api/auth`, so it is sent
 * to refresh/logout and nowhere else.
 */
export function buildRefreshCookieOptions(
  isProduction: boolean,
  expires?: Date,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/auth',
    ...(expires ? { expires } : {}),
  };
}

type SessionResponse = {
  status: 'authenticated';
  user: PublicUser;
  accessToken: string;
};
type LoginResponse =
  SessionResponse | { status: 'mfa_required'; mfaToken: string };

const perMinute = (limit: number) => ({ default: { limit, ttl: 60_000 } });
const perQuarterHour = (limit: number) => ({
  default: { limit, ttl: 15 * 60_000 },
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Throttle(perMinute(5))
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse | { status: 'claim_email_sent' }> {
    const result = await this.auth.register(dto, client);
    if (result.status === 'claim_email_sent') {
      res.status(HttpStatus.ACCEPTED);
      return result;
    }
    return this.startSession(res, result.user, result.session);
  }

  @Public()
  @Throttle(perMinute(5))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.respond(
      res,
      await this.auth.login(dto.email, dto.password, client),
    );
  }

  @Public()
  @Throttle(perMinute(5))
  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  async loginSecondFactor(
    @Body() dto: SecondFactorDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.respond(
      res,
      await this.auth.loginWithSecondFactor(
        dto.mfaToken,
        { code: dto.code, recoveryCode: dto.recoveryCode },
        client,
      ),
    );
  }

  /** Silent session renewal from the httpOnly cookie. */
  @Public()
  @Throttle(perMinute(30))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse | { status: 'anonymous' }> {
    const raw = (req.cookies as Record<string, string | undefined>)[
      REFRESH_COOKIE
    ];
    // No cookie is a normal visitor, not an error: every page load checks for a session, and a
    // 401 here would put an error in the browser console for every anonymous visit.
    if (!raw) return { status: 'anonymous' };
    try {
      const { user, session } = await this.auth.refresh(raw, client);
      return this.startSession(res, user, session);
    } catch (error) {
      res.clearCookie(
        REFRESH_COOKIE,
        buildRefreshCookieOptions(this.isProduction),
      );
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const raw = (req.cookies as Record<string, string | undefined>)[
      REFRESH_COOKIE
    ];
    if (raw) await this.sessions.revokeByToken(raw);
    res.clearCookie(
      REFRESH_COOKIE,
      buildRefreshCookieOptions(this.isProduction),
    );
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() me: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revokeAllForUser(me.sub, 'logout');
    res.clearCookie(
      REFRESH_COOKIE,
      buildRefreshCookieOptions(this.isProduction),
    );
  }

  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() me: AccessTokenPayload): Promise<PublicUser> {
    return toPublicUser(await this.users.getById(me.sub));
  }

  // ---- sessions ("devices") -------------------------------------------------

  @ApiBearerAuth()
  @Get('sessions')
  sessionsList(@CurrentUser() me: AccessTokenPayload) {
    return this.sessions.list(me.sub, me.sid);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() me: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<void> {
    if (!(await this.sessions.revokeOwn(me.sub, id)))
      throw new NotFoundException('Session not found');
  }

  // ---- email links ------------------------------------------------------------

  @Public()
  @Throttle(perMinute(10))
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: TokenDto): Promise<PublicUser> {
    return this.auth.verifyEmail(dto.token);
  }

  @ApiBearerAuth()
  @Throttle(perQuarterHour(3))
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(
    @CurrentUser() me: AccessTokenPayload,
  ): Promise<void> {
    await this.auth.resendVerification(me.sub);
  }

  @Public()
  @Throttle(perQuarterHour(3))
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: EmailDto): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto.email);
    return {
      message:
        'If an account exists for that email, a reset link is on its way.',
    };
  }

  @Public()
  @Throttle(perQuarterHour(10))
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: SetPasswordFromLinkDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.setPasswordFromLink(
      'reset_password',
      dto.token,
      dto.password,
      client,
    );
    return result.status === 'password_set'
      ? result
      : this.respond(res, result);
  }

  @Public()
  @Throttle(perQuarterHour(10))
  @Post('claim-account')
  @HttpCode(HttpStatus.OK)
  async claimAccount(
    @Body() dto: SetPasswordFromLinkDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.setPasswordFromLink(
      'claim_account',
      dto.token,
      dto.password,
      client,
    );
    return result.status === 'password_set'
      ? result
      : this.respond(res, result);
  }

  @ApiBearerAuth()
  @Throttle(perQuarterHour(5))
  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() me: AccessTokenPayload,
    @Body() dto: ChangePasswordDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.auth.changePassword(
      me.sub,
      me.sid,
      dto.currentPassword,
      dto.newPassword,
      client,
    );
  }

  // ---- two-step verification --------------------------------------------------

  @ApiBearerAuth()
  @Throttle(perQuarterHour(5))
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  twoFactorSetup(
    @CurrentUser() me: AccessTokenPayload,
    @Body() dto: PasswordConfirmDto,
  ) {
    return this.auth.beginTwoFactorSetup(me.sub, dto.password);
  }

  @ApiBearerAuth()
  @Throttle(perQuarterHour(10))
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  twoFactorEnable(
    @CurrentUser() me: AccessTokenPayload,
    @Body() dto: TotpCodeDto,
    @Client() client: ClientInfo,
  ) {
    return this.auth.enableTwoFactor(me.sub, me.sid, dto.code, client);
  }

  @ApiBearerAuth()
  @Throttle(perQuarterHour(5))
  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async twoFactorDisable(
    @CurrentUser() me: AccessTokenPayload,
    @Body() dto: DisableTwoFactorDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.auth.disableTwoFactor(me.sub, dto.password, dto.code, client);
  }

  @ApiBearerAuth()
  @Throttle(perQuarterHour(5))
  @Post('2fa/recovery-codes')
  @HttpCode(HttpStatus.OK)
  async regenerateRecoveryCodes(
    @CurrentUser() me: AccessTokenPayload,
    @Body() dto: TotpCodeDto,
  ): Promise<{ recoveryCodes: string[] }> {
    return {
      recoveryCodes: await this.auth.regenerateRecoveryCodes(me.sub, dto.code),
    };
  }

  // ---- helpers ----------------------------------------------------------------

  private respond(res: Response, result: AuthResult): LoginResponse {
    if (result.status === 'mfa_required') return result;
    return this.startSession(res, result.user, result.session);
  }

  private startSession(
    res: Response,
    user: PublicUser,
    session: IssuedSession,
  ): SessionResponse {
    res.cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      buildRefreshCookieOptions(this.isProduction, session.refreshExpiresAt),
    );
    return { status: 'authenticated', user, accessToken: session.accessToken };
  }
}
