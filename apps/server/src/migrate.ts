import { fileURLToPath } from 'node:url';
import { database, type Database } from './db/database';
import { migrateDatabase } from './db/migrations';
import { reportStartupError } from './startup-error';

let db: Database | undefined;
try {
  db = database(process.env.DATABASE_URL);
  await migrateDatabase(db, fileURLToPath(new URL('../drizzle', import.meta.url)));
  console.log('Database migrated.');
} catch (error) {
  reportStartupError('Database migration failed', error);
  process.exitCode = 1;
} finally {
  await db?.pool.end();
}
