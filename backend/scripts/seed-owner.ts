/**
 * Makes an existing, registered account the store owner. Run once per environment
 * (docs/DEPLOYMENT.md): the owner role is never granted through the API.
 *
 *   npm run seed:owner -- lecturer@example.com
 *
 * Reads MONGODB_URI from the environment (or backend/.env). The account must already be
 * registered and active; the owner must then turn on two-step verification before any admin page
 * opens for them.
 */
import { existsSync } from 'node:fs';
import mongoose from 'mongoose';

if (!process.env.MONGODB_URI && existsSync('.env')) process.loadEnvFile('.env');

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: npm run seed:owner -- <email>');
  process.exit(1);
}
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

await mongoose.connect(uri);
const users = mongoose.connection.collection('users');
const user = await users.findOne({ email });

if (!user) {
  console.error(
    `No account for ${email}. Register it on the site first, then run this again.`,
  );
  process.exitCode = 1;
} else if (user.accountStatus !== 'active') {
  console.error(
    `${email} is ${String(user.accountStatus)}; only an active account can become the owner.`,
  );
  process.exitCode = 1;
} else if (user.role === 'owner') {
  console.log(`${email} is already the owner.`);
} else {
  await users.updateOne({ _id: user._id }, { $set: { role: 'owner' } });
  // Existing sessions still carry the old role; end them so the next sign-in picks up "owner".
  await mongoose.connection
    .collection('refresh_tokens')
    .updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'revoked_by_user' } },
    );
  await mongoose.connection.collection('audit_logs').insertOne({
    actorId: null,
    actorRole: 'system',
    action: 'user.role_changed',
    entityType: 'user',
    entityId: user._id.toString(),
    changes: { from: user.role, to: 'owner', via: 'seed-owner script' },
    ip: null,
    at: new Date(),
  });
  console.log(
    `${email} is now the owner. Sign in again and turn on two-step verification under Account → Security.`,
  );
}
await mongoose.disconnect();
