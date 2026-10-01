// Database migrations (docs/ENGINEERING_RULES.md §4 "Schema changes", docs/DEPLOYMENT.md §7).
// Run against an environment with that environment's MONGODB_URI:
//   npm run migrate:status · npm run migrate:up · npm run migrate:down · npm run migrate:create -- <name>
import { existsSync } from 'node:fs';

if (!process.env.MONGODB_URI && existsSync('.env')) process.loadEnvFile('.env');
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is not set');

const config = {
  mongodb: {
    url: uri,
    // The database name comes from the URI path (…/book_selling?…).
    databaseName: new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://')).pathname.slice(1) || undefined,
    options: {},
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  lockCollectionName: 'changelog_lock',
  // Two deploys can't run migrations at once; a crashed run releases the lock after 10 minutes.
  lockTtl: 600,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm',
};

export default config;
