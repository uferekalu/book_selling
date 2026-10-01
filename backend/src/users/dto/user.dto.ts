import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO31661Alpha2,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CURRENCIES,
  USER_ROLES,
  type Currency,
  type UserDocument,
  type UserRole,
} from '../schemas/user.schema.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ada Okafor' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: CURRENCIES })
  @IsOptional()
  @IsIn(CURRENCIES)
  preferredCurrency?: Currency;

  @ApiPropertyOptional({ example: 'NG' })
  @IsOptional()
  @Transform(upper)
  @IsISO31661Alpha2()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;
}

export class AddressDto {
  @ApiPropertyOptional({ example: 'Home' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  label?: string;

  @ApiProperty({ example: 'Ada Okafor' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '+2348012345678' })
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'Enter a valid phone number' })
  phone: string;

  @ApiProperty({ example: '12 Campus Road' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty({ example: 'Lagos' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: '100001' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiProperty({ example: 'NG' })
  @Transform(upper)
  @IsISO31661Alpha2()
  country: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateRoleDto {
  @ApiProperty({ enum: USER_ROLES.filter((role) => role !== 'owner') })
  @IsIn(['customer', 'admin'])
  role: Exclude<UserRole, 'owner'>;
}

/** The only user shape that leaves the API: no hashes, secrets or lockout internals. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  accountStatus: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  preferredCurrency: Currency | null;
  country: string | null;
  marketingOptIn: boolean;
  createdAt: string;
}

export interface PublicAddress {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerifiedAt !== null,
    twoFactorEnabled: user.twoFactor?.enabled === true,
    preferredCurrency: user.preferredCurrency,
    country: user.country,
    marketingOptIn: user.marketingOptIn,
    createdAt: (user as unknown as { createdAt: Date }).createdAt.toISOString(),
  };
}

export function toPublicAddresses(user: UserDocument): PublicAddress[] {
  return user.addresses.map((address) => ({
    id: address._id.toString(),
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: address.isDefault,
  }));
}
