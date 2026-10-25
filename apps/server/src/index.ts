import { fileURLToPath } from 'node:url';
import { database, type Database } from './db/database';
import { migrateDatabase } from './db/migrations';
import { createApp } from './app';
import { reportStartupError } from './startup-error';

let db: Database | undefined;
let app: ReturnType<typeof createApp> | undefined;
try {
  db = database(process.env.DATABASE_URL);
  await migrateDatabase(db, fileURLToPath(new URL('../drizzle', import.meta.url)));
  const runningDb = db;
  const runningApp = (app = createApp(db, {
    origin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
    secret: process.env.JWT_SECRET ?? '',
    production: process.env.NODE_ENV === 'production',
  }));
  await runningApp.server.listen(Number(process.env.PORT ?? 2567), '0.0.0.0');
  console.log(`Open Boards server listening on ${process.env.PORT ?? 2567}`);
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.once(signal, () => {
      void runningApp
        .close()
        .then(() => runningDb.pool.end())
        .then(() => process.exit(0));
    });
} catch (error) {
  reportStartupError('Server startup failed', error);
  try {
    await app?.close();
  } finally {
    await db?.pool.end();
    process.exitCode = 1;
  }
}
