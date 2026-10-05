import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/auth.decorators.js';
import { CURRENCIES, type Currency } from '../common/money/currency.js';
import { SHIPMENT_STATUSES } from '../commerce/schemas/order.schema.js';
import { ReportsService } from './reports.service.js';
import type { Grouping } from './sales-report.js';

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RangeQuery {
  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'First day (Lagos time)',
  })
  @Matches(DATE, { message: 'from must be a date like 2026-10-01' })
  from: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Last day, inclusive',
  })
  @Matches(DATE, { message: 'to must be a date like 2026-10-31' })
  to: string;
}

export class SalesQuery extends RangeQuery {
  @ApiPropertyOptional({ enum: CURRENCIES })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: Currency;

  @ApiPropertyOptional({ enum: ['ebook', 'print'] })
  @IsOptional()
  @IsIn(['ebook', 'print'])
  format?: 'ebook' | 'print';

  @ApiPropertyOptional({ example: 'NG' })
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  country?: string;

  @ApiPropertyOptional({ enum: ['instant', ...SHIPMENT_STATUSES] })
  @IsOptional()
  @IsIn(['instant', ...SHIPMENT_STATUSES])
  delivery?: string;

  @ApiPropertyOptional({ description: 'Book title, buyer or order number' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

export class EarningsQuery extends RangeQuery {
  @ApiPropertyOptional({ enum: ['day', 'week', 'month'], default: 'month' })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  grouping?: Grouping;
}

/** Sales and earnings for the store's staff (two-step verified), BS-29. */
@ApiTags('admin: reports')
@ApiBearerAuth()
@Roles('admin', 'owner')
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Every book sold in the range, one row per book per order, newest first. */
  @Get('sales')
  @Header('Cache-Control', 'no-store')
  sales(@Query() query: SalesQuery) {
    const { page, ...filters } = query;
    return this.reports.sales(filters, page ?? 1);
  }

  /** The same rows as a spreadsheet (all pages). */
  @Get('sales.csv')
  async salesCsv(@Query() query: SalesQuery, @Res() res: Response) {
    const { page: _page, ...filters } = query;
    const csv = await this.reports.salesCsv(filters);
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sales-${filters.from}-to-${filters.to}.csv"`,
        'Cache-Control': 'no-store',
      })
      .send(csv);
  }

  /** Totals per currency, by period, book, country and payment provider. */
  @Get('earnings')
  @Header('Cache-Control', 'no-store')
  earnings(@Query() query: EarningsQuery) {
    return this.reports.earnings(
      { from: query.from, to: query.to },
      query.grouping ?? 'month',
    );
  }
}
