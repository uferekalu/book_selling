import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { toObjectId } from '../common/utils/object-id.js';
import type { PricingZone } from './pricing.js';
import {
  REST_OF_WORLD,
  ShippingZone,
  type ShippingZoneDocument,
} from './schemas/shipping-zone.schema.js';

export interface ShippingZoneInput {
  name: string;
  countries: string[];
  rates: Array<{
    currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
    firstItem: number;
    additionalItem: number;
  }>;
  estimatedDays: { min: number; max: number };
  active: boolean;
}

/** Shipping zones and rates for print copies (ARCHITECTURE §4.3). */
@Injectable()
export class ShippingService {
  constructor(
    @InjectModel(ShippingZone.name)
    private readonly zones: Model<ShippingZone>,
    private readonly audit: AuditService,
  ) {}

  /** The active zone listing this country, else the active "rest of world" zone. */
  async zoneFor(country: string): Promise<PricingZone | null> {
    const code = country.toUpperCase();
    const zone =
      (await this.zones.findOne({ active: true, countries: code }).exec()) ??
      (await this.zones
        .findOne({ active: true, countries: REST_OF_WORLD })
        .exec());
    return zone ? toPricingZone(zone) : null;
  }

  list(): Promise<ShippingZoneDocument[]> {
    return this.zones.find().sort({ name: 1 }).exec();
  }

  async create(
    input: ShippingZoneInput,
    actor: AccessTokenPayload,
  ): Promise<ShippingZoneDocument> {
    const clean = this.validate(input);
    await this.assertCountriesFree(clean.countries, null);
    const zone = await this.zones.create(clean);
    await this.record(actor, 'shipping_zone.created', zone);
    return zone;
  }

  async update(
    id: string,
    input: ShippingZoneInput,
    actor: AccessTokenPayload,
  ): Promise<ShippingZoneDocument> {
    const zone = await this.get(id);
    const clean = this.validate(input);
    await this.assertCountriesFree(clean.countries, zone._id.toString());
    zone.set(clean);
    await zone.save();
    await this.record(actor, 'shipping_zone.updated', zone);
    return zone;
  }

  async remove(id: string, actor: AccessTokenPayload): Promise<void> {
    const zone = await this.get(id);
    await zone.deleteOne();
    await this.record(actor, 'shipping_zone.deleted', zone);
  }

  private async get(id: string): Promise<ShippingZoneDocument> {
    const zone = await this.zones.findById(toObjectId(id, 'Zone')).exec();
    if (!zone) throw new NotFoundException('Shipping zone not found');
    return zone;
  }

  private validate(input: ShippingZoneInput): ShippingZoneInput {
    const countries = [
      ...new Set(input.countries.map((c) => c.trim().toUpperCase())),
    ];
    if (countries.length === 0) {
      throw new BadRequestException(
        'Add at least one country (or "everywhere else")',
      );
    }
    if (countries.includes(REST_OF_WORLD) && countries.length > 1) {
      throw new BadRequestException(
        '"Everywhere else" must be a zone of its own',
      );
    }
    const currencies = input.rates.map((r) => r.currency);
    if (new Set(currencies).size !== currencies.length) {
      throw new BadRequestException('Each currency can have only one rate');
    }
    if (input.estimatedDays.min > input.estimatedDays.max) {
      throw new BadRequestException(
        'The fastest delivery estimate is longer than the slowest',
      );
    }
    return { ...input, name: input.name.trim(), countries };
  }

  /** A country may be in only one zone, and there is one "everywhere else" zone at most. */
  private async assertCountriesFree(
    countries: string[],
    exceptId: string | null,
  ): Promise<void> {
    const clash = await this.zones
      .findOne({
        countries: { $in: countries },
        ...(exceptId ? { _id: { $ne: toObjectId(exceptId) } } : {}),
      })
      .exec();
    if (clash) {
      const shared = countries.filter((c) => clash.countries.includes(c));
      throw new ConflictException(
        shared.includes(REST_OF_WORLD)
          ? `"${clash.name}" is already the "everywhere else" zone`
          : `${shared.join(', ')} ${shared.length === 1 ? 'is' : 'are'} already in "${clash.name}"`,
      );
    }
  }

  private async record(
    actor: AccessTokenPayload,
    action: string,
    zone: ShippingZoneDocument,
  ) {
    await this.audit.record({
      actor: { id: actor.sub, role: actor.role },
      action,
      entityType: 'shipping_zone',
      entityId: zone._id.toString(),
      changes: {
        name: zone.name,
        countries: zone.countries,
        rates: zone.rates,
      },
    });
  }
}

export function toPricingZone(zone: ShippingZoneDocument): PricingZone {
  return {
    id: zone._id.toString(),
    name: zone.name,
    rates: zone.rates.map((r) => ({
      currency: r.currency,
      firstItem: r.firstItem,
      additionalItem: r.additionalItem,
    })),
    estimatedDays: {
      min: zone.estimatedDays.min,
      max: zone.estimatedDays.max,
    },
  };
}
