import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module.js';
import { UsersController } from '../users/users.controller.js';
import { UsersModule } from '../users/users.module.js';
import { AuthTokenService } from './auth-token.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard, RolesGuard } from './guards/auth.guards.js';
import { AuthToken, AuthTokenSchema } from './schemas/auth-token.schema.js';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema.js';
import { SessionService } from './session.service.js';
import { TwoFactorService } from './two-factor.service.js';

@Module({
  imports: [
    UsersModule,
    MailModule,
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: AuthToken.name, schema: AuthTokenSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          issuer: 'book-selling-api',
          audience: 'book-selling-web',
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: 'book-selling-api',
          audience: 'book-selling-web',
        },
      }),
    }),
  ],
  // UsersController lives here because its role endpoint ends sessions (SessionService).
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    SessionService,
    AuthTokenService,
    TwoFactorService,
    AccessTokenGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    SessionService,
    AccessTokenGuard,
    RolesGuard,
    JwtModule,
  ],
})
export class AuthModule {}
