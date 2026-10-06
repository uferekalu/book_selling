import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
import { Roles } from '../auth/decorators/auth.decorators.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

class PageQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @ApiPropertyOptional({ description: 'Search text' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

class CustomersQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ['customer', 'staff'] })
  @IsOptional()
  @IsIn(['customer', 'staff'])
  role?: 'customer' | 'staff';
}

class AuditQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'e.g. order, book, user' })
  @IsOptional()
  @Matches(/^[a-z_]{1,40}$/)
  entityType?: string;
}

/** The store dashboard and customers (staff), and the audit log (owner), BS-12. */
@ApiTags('admin: dashboard')
@ApiBearerAuth()
@Roles('admin', 'owner')
@Controller('admin')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  /** Needs attention, revenue per currency, best sellers, preview → purchase, low stock. */
  @Get('dashboard')
  @Header('Cache-Control', 'no-store')
  overview() {
    return this.dashboard.overview();
  }

  @Get('customers')
  @Header('Cache-Control', 'no-store')
  customers(@Query() query: CustomersQuery) {
    return this.dashboard.customers(
      { q: query.q, role: query.role },
      query.page ?? 1,
    );
  }

  /** Who did what, newest first. The owner only: it records the admins' own actions. */
  @Roles('owner')
  @Get('audit-log')
  @Header('Cache-Control', 'no-store')
  auditLog(@Query() query: AuditQuery) {
    return this.dashboard.auditLog(
      { entityType: query.entityType, q: query.q },
      query.page ?? 1,
    );
  }
}
