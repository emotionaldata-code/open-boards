import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { database, type Database } from './database';
import { migrateDatabase } from './migrations';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const bundled = process.env.TEST_SERVER_BUNDLE === '1';
const entrypoint = fileURLToPath(
  new URL(bundled ? '../../dist/index.js' : '../index.ts', import.meta.url),
);
const tsx = createRequire(import.meta.url).resolve('tsx/esm');
const adminUrl = process.env.DATABASE_URL ?? 'postgres://boards:boards@localhost:5432/boards';
let admin: pg.Client;
let db: Database;
let name: string;
let url: string;
let folder: string;
const children: ChildProcess[] = [];

async function waitFor(check: () => Promise<boolean>) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for migration/startup');
}

function startServer(databaseUrl = url) {
  const child = spawn(process.execPath, bundled ? [entrypoint] : ['--import', tsx, entrypoint], {
    cwd: tmpdir(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'migration-test-secret-at-least-32-characters',
      PORT: '0',
      NODE_ENV: bundled ? 'production' : 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (data) => (output += String(data)));
  child.stderr.on('data', (data) => (output += String(data)));
  return { child, output: () => output };
}

async function history() {
  return (
    await db.pool.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id')
  ).rows;
}

async function addMigration(sql: string) {
  const journalPath = join(folder, 'meta/_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  journal.entries.push({
    idx: 1,
    version: '7',
    when: journal.entries[0].when + 1,
    tag: '0001_test_upgrade',
    breakpoints: true,
  });
  await writeFile(journalPath, JSON.stringify(journal));
  await writeFile(join(folder, '0001_test_upgrade.sql'), sql);
}

beforeEach(async () => {
  name = `boards_migrations_${crypto.randomUUID().replaceAll('-', '')}`;
  admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const connection = new URL(adminUrl);
  connection.pathname = `/${name}`;
  url = connection.href;
  db = database(url);
  folder = await mkdtemp(join(tmpdir(), 'boards-migrations-'));
  await cp(migrationsFolder, folder, { recursive: true });
});

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child.once('close', resolve));
      child.kill('SIGTERM');
      await closed;
    }
  }
  await db?.pool.end();
  try {
    if (name) {
      // pg-pool resolves end() before PostgreSQL has necessarily observed socket closure.
      await waitFor(async () => {
        const result = await admin.query(
          'SELECT count(*) FROM pg_stat_activity WHERE datname = $1',
          [name],
        );
        return result.rows[0].count === '0';
      });
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    }
  } finally {
    await admin.end();
    if (folder) await rm(folder, { recursive: true, force: true });
  }
});

describe(`Postgres migration lifecycle (${bundled ? 'bundle' : 'source'})`, () => {
  it('startup migrates a fresh database and preserves accounts/history on restart', async () => {
    const first = startServer();
    await waitFor(async () => first.output().includes('Open Boards server listening'));
    const user = await db.createUser('persisted', 'existing-password-hash');
    const applied = await history();
    expect(applied).toEqual([
      {
        hash: createHash('sha256')
          .update(await readFile(join(migrationsFolder, '0000_users.sql')))
          .digest('hex'),
        created_at: '1780000000000',
      },
    ]);
    const stopped = new Promise((resolve) => first.child.once('close', resolve));
    first.child.kill('SIGTERM');
    await stopped;
    const second = startServer();
    await waitFor(async () => second.output().includes('Open Boards server listening'));
    expect(await db.findUser('persisted')).toEqual(user);
    expect(await history()).toEqual(applied);
  });

  it('upgrades an already migrated database without replacing accounts', async () => {
    await migrateDatabase(db, migrationsFolder);
    const user = await db.createUser('upgrade', 'unchanged-hash');
    await addMigration(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory'
            AND classid = 1329745729 AND objid = 5391443 AND granted
        ) THEN RAISE EXCEPTION 'Migrator is not using the locked connection'; END IF;
      END $$;
      --> statement-breakpoint
      ALTER TABLE users ADD COLUMN migration_probe text;
    `);
    await migrateDatabase(db, folder);
    await migrateDatabase(db, folder);
    expect(await db.findUser('upgrade')).toEqual(user);
    expect(await history()).toHaveLength(2);
    expect((await db.pool.query('SELECT migration_probe FROM users')).rows).toEqual([
      { migration_probe: null },
    ]);
  });

  it('rolls back failed migrations, releases the connection/lock, and permits retry', async () => {
    await migrateDatabase(db, migrationsFolder);
    const user = await db.createUser('survivor', 'unchanged-hash');
    await addMigration(
      'CREATE TABLE migration_probe (id int);\n--> statement-breakpoint\nSELECT * FROM missing_migration_table;',
    );
    await expect(migrateDatabase(db, folder)).rejects.toThrow();
    expect(
      (await db.pool.query("SELECT to_regclass('public.migration_probe') AS name")).rows,
    ).toEqual([{ name: null }]);
    expect(await history()).toHaveLength(1);
    expect(await db.findUser('survivor')).toEqual(user);
    await writeFile(
      join(folder, '0001_test_upgrade.sql'),
      'CREATE TABLE migration_probe (id int);',
    );
    await migrateDatabase(db, folder);
    expect(await history()).toHaveLength(2);
  });

  it('serializes concurrent startups before migration metadata/schema creation', async () => {
    const blocker = await db.pool.connect();
    try {
      await blocker.query('SELECT pg_advisory_lock($1, $2)', [0x4f424f41, 0x524453]);
      const first = startServer();
      const second = startServer();
      await waitFor(async () => {
        const result = await admin.query(
          "SELECT count(*) FROM pg_stat_activity WHERE datname = $1 AND wait_event = 'advisory'",
          [name],
        );
        return result.rows[0].count === '2';
      });
      expect(first.output()).not.toContain('Open Boards server listening');
      expect(second.output()).not.toContain('Open Boards server listening');
      expect(
        (await blocker.query("SELECT to_regclass('public.users') AS name")).rows[0].name,
      ).toBeNull();
      await blocker.query('SELECT pg_advisory_unlock($1, $2)', [0x4f424f41, 0x524453]);
      await waitFor(
        async () =>
          first.output().includes('Open Boards server listening') &&
          second.output().includes('Open Boards server listening'),
      );
      expect(await history()).toHaveLength(1);
    } finally {
      try {
        await blocker.query('SELECT pg_advisory_unlock_all()');
      } finally {
        blocker.release();
      }
    }
  });

  it('exits before listening when migrations fail and omits database credentials', async () => {
    await db.pool.query('CREATE TABLE users (id int)');
    const failed = startServer();
    await waitFor(async () => failed.child.exitCode !== null);
    expect(failed.child.exitCode).toBe(1);
    expect(failed.output()).toContain('Server startup failed');
    expect(failed.output()).toContain('42P07');
    expect(failed.output()).not.toContain('Open Boards server listening');
    expect(failed.output()).not.toContain(url);
    const connections = await admin.query(
      'SELECT count(*) FROM pg_stat_activity WHERE datname = $1',
      [name],
    );
    expect(connections.rows[0].count).toBe('1'); // Only this test's pool remains.
  });

  it('requires an explicit DATABASE_URL before creating a pool or listener', async () => {
    const failed = startServer('');
    await waitFor(async () => failed.child.exitCode !== null);
    expect(failed.child.exitCode).toBe(1);
    expect(failed.output()).toContain('DATABASE_URL is required');
    expect(failed.output()).not.toContain('Open Boards server listening');
  });
});
