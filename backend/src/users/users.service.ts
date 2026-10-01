import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { toObjectId } from '../common/utils/object-id.js';
import type { AddressDto, UpdateProfileDto } from './dto/user.dto.js';
import {
  MAX_ADDRESSES,
  User,
  type UserDocument,
  type UserRole,
} from './schemas/user.schema.js';

/** Secret fields excluded by default (`select: false`); auth code opts in explicitly. */
export const SECRET_FIELDS =
  '+passwordHash +failedLoginCount +lockedUntil +twoFactor.secretSealed +twoFactor.pendingSecretSealed +twoFactor.recoveryCodeHashes +twoFactor.lastUsedStep';

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  findById(id: string): Promise<UserDocument | null> {
    return this.users.findById(toObjectId(id, 'User')).exec();
  }

  async getById(id: string): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email: normaliseEmail(email) }).exec();
  }

  /** Includes password hash, lockout counters and 2FA secrets. Auth code only. */
  findByEmailWithSecrets(email: string): Promise<UserDocument | null> {
    return this.users
      .findOne({ email: normaliseEmail(email) })
      .select(SECRET_FIELDS)
      .exec();
  }

  findByIdWithSecrets(id: string): Promise<UserDocument | null> {
    return this.users
      .findById(toObjectId(id, 'User'))
      .select(SECRET_FIELDS)
      .exec();
  }

  create(
    data: Partial<User> & { email: string; name: string },
  ): Promise<UserDocument> {
    return this.users.create({ ...data, email: normaliseEmail(data.email) });
  }

  /**
   * Guest checkout (ARCHITECTURE §8.2): returns the account for this email, creating an
   * `unclaimed` one when none exists. An existing account (claimed or not) is returned unchanged,
   * so an order placed as a guest lands in the right library. Idempotent under concurrency via an
   * upsert.
   */
  async findOrCreateForGuest(
    email: string,
    name: string,
    session?: ClientSession,
  ): Promise<UserDocument> {
    const normalised = normaliseEmail(email);
    return this.users
      .findOneAndUpdate(
        { email: normalised },
        {
          $setOnInsert: {
            email: normalised,
            name: name.trim(),
            accountStatus: 'unclaimed',
            role: 'customer',
          },
        },
        { upsert: true, returnDocument: 'after', session },
      )
      .exec();
  }

  async findByIdAndTouchLogin(id: string): Promise<void> {
    await this.users
      .updateOne(
        { _id: toObjectId(id, 'User') },
        { $set: { lastLoginAt: new Date() } },
      )
      .exec();
  }

  async markEmailVerified(id: string): Promise<UserDocument> {
    const _id = toObjectId(id, 'User');
    // Only the first verification is recorded; later ones keep the original timestamp.
    await this.users
      .updateOne(
        { _id, emailVerifiedAt: null },
        { $set: { emailVerifiedAt: new Date() } },
      )
      .exec();
    return this.getById(id);
  }

  /**
   * Stores a new password hash. With `claim`, the change came through an emailed link, which
   * proves control of the inbox: the email counts as verified and an unclaimed account becomes
   * active. Also clears any lockout.
   */
  async setPassword(
    id: string,
    passwordHash: string,
    { claim }: { claim: boolean },
  ): Promise<UserDocument> {
    const now = new Date();
    const user = await this.getById(id);
    user.set({
      passwordHash,
      passwordChangedAt: now,
      failedLoginCount: 0,
      lockedUntil: null,
    });
    if (claim) {
      if (!user.emailVerifiedAt) user.emailVerifiedAt = now;
      if (user.accountStatus === 'unclaimed') user.accountStatus = 'active';
    }
    return user.save();
  }

  /** Counts a failed sign-in; locks the account for `lockMs` on the `maxFailures`th. Returns true if it locked. */
  async recordFailedLogin(
    id: string,
    maxFailures: number,
    lockMs: number,
  ): Promise<boolean> {
    const updated = await this.users
      .findOneAndUpdate(
        { _id: toObjectId(id, 'User') },
        { $inc: { failedLoginCount: 1 } },
        { returnDocument: 'after', projection: { failedLoginCount: 1 } },
      )
      .select('+failedLoginCount')
      .exec();
    if (!updated || updated.failedLoginCount < maxFailures) return false;
    await this.users
      .updateOne(
        { _id: updated._id },
        {
          $set: {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + lockMs),
          },
        },
      )
      .exec();
    return true;
  }

  async resetFailures(id: string): Promise<void> {
    await this.users
      .updateOne(
        { _id: toObjectId(id, 'User') },
        { $set: { failedLoginCount: 0, lockedUntil: null } },
      )
      .exec();
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<UserDocument> {
    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.preferredCurrency !== undefined)
      set.preferredCurrency = dto.preferredCurrency;
    if (dto.country !== undefined) set.country = dto.country;
    if (dto.marketingOptIn !== undefined) {
      set.marketingOptIn = dto.marketingOptIn;
      set.marketingConsentAt = dto.marketingOptIn ? new Date() : null;
    }
    const user = await this.users
      .findByIdAndUpdate(
        toObjectId(id, 'User'),
        { $set: set },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async addAddress(id: string, dto: AddressDto): Promise<UserDocument> {
    const user = await this.getById(id);
    if (user.addresses.length >= MAX_ADDRESSES) {
      throw new BadRequestException(
        `You can save up to ${MAX_ADDRESSES} addresses`,
      );
    }
    // The first address, or one explicitly marked default, becomes the only default.
    const makeDefault = dto.isDefault === true || user.addresses.length === 0;
    if (makeDefault)
      user.addresses.forEach((address) => (address.isDefault = false));
    user.addresses.push({
      label: dto.label ?? '',
      fullName: dto.fullName,
      phone: dto.phone,
      line1: dto.line1,
      line2: dto.line2 ?? '',
      city: dto.city,
      state: dto.state ?? '',
      postalCode: dto.postalCode ?? '',
      country: dto.country,
      isDefault: makeDefault,
    });
    return user.save();
  }

  async updateAddress(
    id: string,
    addressId: string,
    dto: AddressDto,
  ): Promise<UserDocument> {
    const user = await this.getById(id);
    const address = user.addresses.id(toObjectId(addressId, 'Address'));
    if (!address) throw new NotFoundException('Address not found');
    const { isDefault, ...fields } = dto;
    address.set({ label: '', line2: '', state: '', postalCode: '', ...fields });
    if (isDefault === true) {
      user.addresses.forEach(
        (other) => (other.isDefault = other._id.equals(address._id)),
      );
    }
    return user.save();
  }

  async removeAddress(id: string, addressId: string): Promise<UserDocument> {
    const user = await this.getById(id);
    const address = user.addresses.id(toObjectId(addressId, 'Address'));
    if (!address) throw new NotFoundException('Address not found');
    const wasDefault = address.isDefault;
    address.deleteOne();
    if (wasDefault && user.addresses.length > 0)
      user.addresses[0].isDefault = true;
    return user.save();
  }

  /**
   * Owner-only role change (ARCHITECTURE §5). The owner role itself is never granted or removed
   * through the API (only `npm run seed:owner`), so the store can't lose its owner by accident.
   */
  async changeRole(
    targetId: string,
    role: Exclude<UserRole, 'owner'>,
  ): Promise<{ user: UserDocument; previous: UserRole }> {
    const user = await this.getById(targetId);
    if (user.role === 'owner')
      throw new ForbiddenException("The owner's role can't be changed here");
    if (user.accountStatus !== 'active') {
      throw new BadRequestException(
        'Only an active, claimed account can be given a role',
      );
    }
    const previous = user.role;
    user.role = role;
    await user.save();
    return { user, previous };
  }
}
