import { Module } from '@nestjs/common';
import { CommerceModule } from '../commerce/commerce.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** The owner's sales and earnings reports (BS-29). Read-only over orders. */
@Module({
  imports: [CommerceModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
