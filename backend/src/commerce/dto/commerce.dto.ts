import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CURRENCIES,
  MAX_PRICE_MINOR,
  type Currency,
} from '../../common/money/currency.js';
import {
  FORMAT_TYPES,
  type FormatType,
} from '../../catalog/schemas/book.schema.js';
import { COUPON_KINDS, type CouponKind } from '../schemas/coupon.schema.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CurrencyParam {
  @ApiPropertyOptional({ enum: CURRENCIES, default: 'USD' })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: Currency;
}

export class CartItemDto {
  @ApiProperty() @IsMongoId() bookId: string;
  @ApiProperty({ enum: FORMAT_TYPES }) @IsIn(FORMAT_TYPES) format: FormatType;
  @ApiProperty({ default: 1 }) @IsInt() @Min(0) @Max(50) quantity: number;
}

export class ShippingAddressDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;
  @ApiProperty()
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
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  state?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  postalCode?: string;
  @ApiProperty({ example: 'NG' })
  @Transform(upper)
  @IsISO31661Alpha2()
  country: string;
}

export class QuoteDto {
  @ApiProperty({ enum: CURRENCIES }) @IsIn(CURRENCIES) currency: Currency;
  @ApiPropertyOptional({ example: 'NG' })
  @IsOptional()
  @Transform(upper)
  @IsISO31661Alpha2()
  shippingCountry?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  couponCode?: string;
  @ApiPropertyOptional({
    description: "A guest's email (library and coupon limits)",
  })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class PlaceOrderDto {
  @ApiProperty({ enum: CURRENCIES }) @IsIn(CURRENCIES) currency: Currency;
  @ApiPropertyOptional({ description: 'Required for guests' })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ApiPropertyOptional({ description: 'Required for guests' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional({ type: ShippingAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  couponCode?: string;
  @ApiPropertyOptional({
    description: 'Where to return after paying, e.g. /books/x/read?page=19',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  returnPath?: string;
  @ApiProperty({ description: 'Agrees to the Terms of Sale' })
  @IsBoolean()
  acceptTerms: boolean;
}

export class GuestOrderDto {
  @ApiProperty() @IsString() @Matches(/^BS-\d{4}-\d{6}$/) orderNumber: string;
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22,100}$/)
  checkoutKey: string;
}

// ---------------------------------------------------------------- admin

class RateDto {
  @ApiProperty({ enum: CURRENCIES }) @IsIn(CURRENCIES) currency: Currency;
  @ApiProperty() @IsInt() @Min(0) @Max(MAX_PRICE_MINOR) firstItem: number;
  @ApiProperty() @IsInt() @Min(0) @Max(MAX_PRICE_MINOR) additionalItem: number;
}

class DaysDto {
  @ApiProperty() @IsInt() @Min(0) @Max(120) min: number;
  @ApiProperty() @IsInt() @Min(0) @Max(120) max: number;
}

export class ShippingZoneDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
  @ApiProperty({
    type: [String],
    description: 'ISO codes, or ["*"] for everywhere else',
  })
  @IsArray()
  @ArrayMaxSize(250)
  @Matches(/^([A-Za-z]{2}|\*)$/, { each: true })
  countries: string[];
  @ApiProperty({ type: [RateDto] })
  @IsArray()
  @ArrayMaxSize(CURRENCIES.length)
  @ValidateNested({ each: true })
  @Type(() => RateDto)
  rates: RateDto[];
  @ApiProperty({ type: DaysDto })
  @ValidateNested()
  @Type(() => DaysDto)
  estimatedDays: DaysDto;
  @ApiProperty() @IsBoolean() active: boolean;
}

class CouponAmountDto {
  @ApiProperty({ enum: CURRENCIES }) @IsIn(CURRENCIES) currency: Currency;
  @ApiProperty() @IsInt() @Min(1) @Max(MAX_PRICE_MINOR) amount: number;
}

class AppliesToDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  bookIds?: string[];
  @ApiPropertyOptional({ enum: FORMAT_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(FORMAT_TYPES, { each: true })
  formats?: FormatType[];
}

export class CouponDto {
  @ApiProperty() @Transform(upper) @Matches(/^[A-Z0-9_-]{3,30}$/) code: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;
  @ApiProperty({ enum: COUPON_KINDS }) @IsIn(COUPON_KINDS) kind: CouponKind;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;
  @ApiPropertyOptional({ type: [CouponAmountDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CouponAmountDto)
  amountsOff?: CouponAmountDto[];
  @ApiPropertyOptional({ type: [CouponAmountDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CouponAmountDto)
  minSubtotals?: CouponAmountDto[];
  @ApiPropertyOptional({ type: AppliesToDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppliesToDto)
  appliesTo?: AppliesToDto;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxRedemptions?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  perCustomerLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class AdminOrdersQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}
