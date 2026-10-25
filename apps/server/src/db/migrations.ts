import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './database';
// Stable application-specific key shared by startup and the explicit migration CLI.
const migrationLock = [0x4f424f41, 0x524453];
export async function migrateDatabase(database: Database, migrationsFolder: string): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', migrationLock);
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    let unlocked = false;
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', migrationLock);
      unlocked = true;
    } finally {
      // Never return a session that might still hold the advisory lock to the pool.
      client.release(!unlocked);
    }
  }
}
