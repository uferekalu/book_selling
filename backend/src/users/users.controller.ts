import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.module.js';
import { CurrentUser, Roles } from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { SessionService } from '../auth/session.service.js';
import { Client, type ClientInfo } from '../common/http/client-info.js';
import {
  AddressDto,
  toPublicAddresses,
  toPublicUser,
  UpdateProfileDto,
  UpdateRoleDto,
  type PublicAddress,
  type PublicUser,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  @Patch('me')
  async updateProfile(
    @CurrentUser() me: AccessTokenPayload,
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return toPublicUser(await this.users.updateProfile(me.sub, dto));
  }

  @Get('me/addresses')
  async addresses(
    @CurrentUser() me: AccessTokenPayload,
  ): Promise<PublicAddress[]> {
    return toPublicAddresses(await this.users.getById(me.sub));
  }

  @Post('me/addresses')
  async addAddress(
    @CurrentUser() me: AccessTokenPayload,
    @Body() dto: AddressDto,
  ): Promise<PublicAddress[]> {
    return toPublicAddresses(await this.users.addAddress(me.sub, dto));
  }

  @Put('me/addresses/:addressId')
  async updateAddress(
    @CurrentUser() me: AccessTokenPayload,
    @Param('addressId') addressId: string,
    @Body() dto: AddressDto,
  ): Promise<PublicAddress[]> {
    return toPublicAddresses(
      await this.users.updateAddress(me.sub, addressId, dto),
    );
  }

  @Delete('me/addresses/:addressId')
  async removeAddress(
    @CurrentUser() me: AccessTokenPayload,
    @Param('addressId') addressId: string,
  ): Promise<PublicAddress[]> {
    return toPublicAddresses(await this.users.removeAddress(me.sub, addressId));
  }

  /**
   * Owner grants or removes the admin role. The target's sessions end so the new role applies
   * immediately rather than when their access token expires.
   */
  @Roles('owner')
  @Patch(':id/role')
  @HttpCode(HttpStatus.OK)
  async changeRole(
    @CurrentUser() me: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Client() client: ClientInfo,
  ): Promise<PublicUser> {
    const { user, previous } = await this.users.changeRole(id, dto.role);
    await this.sessions.revokeAllForUser(id, 'revoked_by_user');
    await this.audit.record({
      actor: { id: me.sub, role: me.role },
      action: 'user.role_changed',
      entityType: 'user',
      entityId: id,
      changes: { from: previous, to: dto.role },
      ip: client.ip,
    });
    return toPublicUser(user);
  }
}
