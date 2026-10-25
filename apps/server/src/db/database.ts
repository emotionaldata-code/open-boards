import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { users } from './schema';
export function database(url: string | undefined) {
  if (!url?.trim()) throw new Error('DATABASE_URL is required.');
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);
  return {
    pool,
    db,
    async findUser(username: string) {
      return (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
    },
    async createUser(username: string, passwordHash: string) {
      return (await db.insert(users).values({ username, passwordHash }).returning())[0];
    },
  };
}
export type Database = ReturnType<typeof database>;
