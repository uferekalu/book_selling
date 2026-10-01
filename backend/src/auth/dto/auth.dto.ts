import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password-policy.js';

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Passwords are length-checked here only loosely; the real policy (with a helpful message) is
// `passwordProblem()` in the service, so the rules live in one place.
const PasswordField = () =>
  applyDecorators(
    IsString(),
    IsNotEmpty({ message: 'Enter a password' }),
    MaxLength(PASSWORD_MAX_LENGTH),
  );

export class RegisterDto {
  @ApiProperty({ example: 'Ada Okafor' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter your name' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'ada@example.com' })
  @Transform(trimLower)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 10 })
  @PasswordField()
  password: string;

  @ApiProperty({
    description:
      'Must be true: acceptance of the Terms of Sale and Privacy Policy',
  })
  @Equals(true, {
    message: 'Please accept the Terms of Sale and Privacy Policy',
  })
  acceptTerms: boolean;

  @ApiPropertyOptional({
    description: 'Explicit opt-in to occasional emails about new books',
  })
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;
}

export class LoginDto {
  @ApiProperty()
  @Transform(trimLower)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @PasswordField()
  password: string;
}

export class SecondFactorDto {
  @ApiProperty({
    description:
      'Token returned by /auth/login when two-step verification is on',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  mfaToken: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code?: string;

  @ApiPropertyOptional({ example: 'ABCD-EFGH-JK' })
  @IsOptional()
  @IsString()
  @Length(8, 20)
  recoveryCode?: string;
}

export class EmailDto {
  @ApiProperty()
  @Transform(trimLower)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;
}

export class TokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}

export class SetPasswordFromLinkDto extends TokenDto {
  @ApiProperty()
  @PasswordField()
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @PasswordField()
  currentPassword: string;

  @ApiProperty()
  @PasswordField()
  newPassword: string;
}

export class PasswordConfirmDto {
  @ApiProperty()
  @PasswordField()
  password: string;
}

export class TotpCodeDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code: string;
}

export class DisableTwoFactorDto extends TotpCodeDto {
  @ApiProperty()
  @PasswordField()
  password: string;
}
