import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import { startMongo } from '../../test/mongo.js';
import { MAX_ADDRESSES, User } from './schemas/user.schema.js';
import { UsersModule } from './users.module.js';
import { UsersService } from './users.service.js';

const address = (label: string, isDefault?: boolean) => ({
  label,
  fullName: 'Ada Okafor',
  phone: '+2348012345678',
  line1: '12 Campus Road',
  city: 'Lagos',
  country: 'NG',
  ...(isDefault !== undefined ? { isDefault } : {}),
});

describe('UsersService', () => {
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let service: UsersService;
  let users: Model<User>;

  beforeAll(async () => {
    mongod = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongod.getUri()), UsersModule],
    }).compile();
    service = moduleRef.get(UsersService);
    users = moduleRef.get(getModelToken(User.name));
    await users.syncIndexes();
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await users.deleteMany({});
  });

  it('creates exactly one unclaimed account per email, even under concurrent guest checkouts', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.findOrCreateForGuest('Guest@Example.com', 'Guest Buyer'),
      ),
    );
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const stored = await users.find({ email: 'guest@example.com' }).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      accountStatus: 'unclaimed',
      role: 'customer',
    });
  });

  it('returns an existing account unchanged for a guest checkout', async () => {
    const existing = await service.create({
      email: 'ada@example.com',
      name: 'Ada',
      accountStatus: 'active',
    });
    const found = await service.findOrCreateForGuest(
      'ada@example.com',
      'Someone Else',
    );
    expect(found._id.toString()).toBe(existing._id.toString());
    expect(found).toMatchObject({ name: 'Ada', accountStatus: 'active' });
  });

  it('keeps exactly one default address', async () => {
    const user = await service.create({
      email: 'ada@example.com',
      name: 'Ada',
    });
    const id = user._id.toString();
    let saved = await service.addAddress(id, address('Home'));
    expect(saved.addresses[0].isDefault).toBe(true);

    saved = await service.addAddress(id, address('Office', true));
    expect(saved.addresses.map((a) => [a.label, a.isDefault])).toEqual([
      ['Home', false],
      ['Office', true],
    ]);

    saved = await service.removeAddress(id, saved.addresses[1]._id.toString());
    expect(saved.addresses[0]).toMatchObject({
      label: 'Home',
      isDefault: true,
    });
  });

  it(`limits saved addresses to ${MAX_ADDRESSES}`, async () => {
    const user = await service.create({
      email: 'ada@example.com',
      name: 'Ada',
    });
    for (let i = 0; i < MAX_ADDRESSES; i += 1)
      await service.addAddress(user._id.toString(), address(`A${i}`));
    await expect(
      service.addAddress(user._id.toString(), address('extra')),
    ).rejects.toThrow(/up to 10/);
  });

  it('records marketing consent with a timestamp and clears it on opt-out', async () => {
    const user = await service.create({
      email: 'ada@example.com',
      name: 'Ada',
    });
    let updated = await service.updateProfile(user._id.toString(), {
      marketingOptIn: true,
    });
    expect(updated.marketingConsentAt).toBeInstanceOf(Date);
    updated = await service.updateProfile(user._id.toString(), {
      marketingOptIn: false,
    });
    expect(updated.marketingConsentAt).toBeNull();
  });

  it('treats malformed ids as not found', async () => {
    await expect(service.getById('not-an-id')).rejects.toThrow(/not found/);
  });
});
