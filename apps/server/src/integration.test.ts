import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Client, type Room } from '@colyseus/sdk';
import { SignJWT } from 'jose';
import type { Snapshot } from '@open-boards/protocol';
import { basic, deckDefinitions } from '@open-boards/content';
import { database } from './db/database';
import { migrateDatabase } from './db/migrations';
import { createApp } from './app';
import { activeSeats } from './rooms/match';
const origin = 'http://localhost:5173';
const secret = 'integration-secret-that-is-at-least-32-characters';
const db = database(process.env.DATABASE_URL ?? 'postgres://boards:boards@localhost:5432/boards');
let app: ReturnType<typeof createApp>;
let endpoint = '';
const connected: Room[] = [];
const prefix = `test_${Date.now().toString(36)}`;
const accounts: string[] = [];
async function request(path: string, body?: unknown, cookie?: string, requestOrigin = origin) {
  return fetch(`${endpoint}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: requestOrigin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function account(suffix: string) {
  const name = `${prefix}_${suffix}`;
  accounts.push(name);
  const response = await request('/auth/register', {
    username: name,
    password: 'correct-password',
  });
  expect(response.status).toBe(201);
  return {
    user: (await response.json()) as { id: string; name: string },
    cookie: response.headers.get('set-cookie')!.split(';')[0],
  };
}
function sdk(cookie?: string, requestOrigin = origin) {
  return new Client(endpoint, {
    headers: { Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}) },
  });
}
async function connect(client: Client, capacity?: 2 | 4, id?: string) {
  const room = capacity ? await client.create('arena', { capacity }) : await client.joinById(id!);
  connected.push(room);
  room.onMessage('error', () => {});
  room.onMessage('snapshot', () => {});
  return room;
}
function snapshot(room: Room, condition: (s: Snapshot) => boolean = () => true): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      off();
      reject(new Error('Snapshot timeout'));
    }, 5000);
    const off = room.onMessage('snapshot', (s: Snapshot) => {
      if (condition(s)) {
        clearTimeout(timeout);
        off();
        resolve(s);
      }
    });
    room.send('sync');
  });
}
async function deployAndSkip(rooms: Room[]) {
  // Deployment adds commands to this transport scenario; respect the room message limit.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  let view = await snapshot(rooms[0], (s) => !!s.room.game);
  while (
    view.room.game!.phase.type === 'placing-allies' ||
    view.room.game!.phase.type === 'ability-choice'
  ) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const game = view.room.game!;
    const player = 'player' in game.phase ? game.phase.player : '';
    const room = rooms[game.players.findIndex((p) => p.id === player)];
    const own = game.phase.type === 'ability-choice' ? await snapshot(room) : null;
    const fighter = game.fighters.find((f) => f.player === player && f.position === null);
    const hero = game.fighters.find((f) => f.player === player && f.role === 'main')!;
    const position = basic.map.nodes.find(
      (node) =>
        !game.fighters.some((f) => f.position === node) &&
        basic.map.zones[node].some((z) => basic.map.zones[hero.position!].includes(z)),
    )!;
    room.send('command', {
      id: crypto.randomUUID(),
      revision: game.revision,
      command:
        game.phase.type === 'placing-allies'
          ? { type: 'place-ally', fighter: fighter!.id, position }
          : { type: 'choose', choice: own!.room.game!.choice!.id, options: ['skip'] },
    });
    view = await snapshot(rooms[0], (s) => s.room.game!.revision > game.revision);
  }
  return view;
}
function errorMessage(room: Room): Promise<{ code: string; message: string }> {
  return new Promise((resolve) => {
    const off = room.onMessage('error', (error: { code: string; message: string }) => {
      off();
      resolve(error);
    });
  });
}
beforeAll(async () => {
  await migrateDatabase(db, fileURLToPath(new URL('../drizzle', import.meta.url)));
  app = createApp(db, { origin, secret, reconnectSeconds: 0.25 });
  await app.server.listen(0, '127.0.0.1');
  const address = app.http.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await Promise.allSettled(connected.filter((r) => r.connection.isOpen).map((r) => r.leave()));
  if (app) await app.close();
  await db.pool.query('DELETE FROM users WHERE username = ANY($1)', [accounts]);
  await db.pool.end();
});
describe('Postgres accounts and real Colyseus transport', () => {
  it('registers Argon2id hashes, persists across database connections, logs in and rejects bad JWTs', async () => {
    const a = await account('auth');
    const stored = await db.findUser(a.user.name);
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain('correct-password');
    const second = database(
      process.env.DATABASE_URL ?? 'postgres://boards:boards@localhost:5432/boards',
    );
    try {
      expect((await second.findUser(a.user.name))?.id).toBe(a.user.id);
    } finally {
      await second.pool.end();
    }
    expect(
      (
        await request('/auth/register', {
          username: a.user.name.toUpperCase(),
          password: 'another-password',
        })
      ).status,
    ).toBe(409);
    expect(
      (await request('/auth/login', { username: a.user.name, password: 'wrong-password' })).status,
    ).toBe(401);
    const login = await request('/auth/login', {
      username: a.user.name,
      password: 'correct-password',
    });
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('HttpOnly');
    expect(login.headers.get('set-cookie')).toContain('SameSite=Strict');
    expect(login.headers.get('set-cookie')).toContain('Max-Age=86400');
    expect((await request('/auth/me', undefined, a.cookie)).status).toBe(200);
    expect((await request('/auth/me', undefined, 'boards_session=bogus')).status).toBe(401);
    expect(
      (
        await request(
          '/auth/login',
          { username: a.user.name, password: 'correct-password' },
          undefined,
          'https://evil.example',
        )
      ).status,
    ).toBe(403);
    const expired = await new SignJWT({ name: a.user.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(a.user.id)
      .setIssuer('open-boards')
      .setAudience('open-boards')
      .setExpirationTime(1)
      .sign(new TextEncoder().encode(secret));
    expect((await request('/auth/me', undefined, `boards_session=${expired}`)).status).toBe(401);
    await expect(sdk().create('arena', { capacity: 2 })).rejects.toThrow();
    await expect(sdk('boards_session=invalid').create('arena', { capacity: 2 })).rejects.toThrow();
    await expect(
      sdk(a.cookie, 'https://evil.example').create('arena', { capacity: 2 }),
    ).rejects.toThrow();
    const logout = await request('/auth/logout', {}, a.cookie);
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('enforces room capacity/readiness, private snapshots, stale commands and duplicate seats over sockets', async () => {
    const a = await account('host');
    const b = await account('guest');
    const r1 = await connect(sdk(a.cookie), 2);
    const r2 = await connect(sdk(b.cookie), undefined, r1.roomId);
    await expect(sdk(a.cookie).joinById(r1.roomId)).rejects.toThrow();
    await expect(sdk(b.cookie).create('arena', { capacity: 2 })).rejects.toThrow();
    const err = errorMessage(r1);
    r1.send('start');
    expect((await err).code).toBe('LOBBY');
    const invalidCharacter = errorMessage(r1);
    r1.send('character', { character: '__proto__' });
    expect((await invalidCharacter).code).toBe('LOBBY');
    const malformedCharacter = errorMessage(r1);
    r1.send('character', { character: 123 });
    expect((await malformedCharacter).code).toBe('INVALID');
    r1.send('ready');
    await snapshot(r1, (s) => s.room.seats[0].ready);
    r1.send('character', { character: 'medusa' });
    await snapshot(r2, (s) => s.room.seats[0].character === 'medusa' && s.room.seats[0].ready);
    // Re-selecting the only available character preserves readiness.
    r1.send('ready');
    await snapshot(r1, (s) => !s.room.seats[0].ready);
    r1.send('ready');
    r2.send('ready');
    await snapshot(r1, (s) => s.room.seats.every((p) => p.ready));
    r1.send('start');
    const initial = await deployAndSkip([r1, r2]);
    const startRevision = initial.room.game!.revision;
    const other = await snapshot(r2, (s) => !!s.room.game);
    expect(other.room.game!.players.map((p) => p.character)).toEqual(['medusa', 'medusa']);
    const lockedCharacter = errorMessage(r1);
    r1.send('character', { character: 'medusa' });
    expect((await lockedCharacter).code).toBe('LOBBY');
    for (const card of initial.room.game!.hand)
      expect(deckDefinitions('medusa')).toContain(card.definition);
    for (const card of other.room.game!.hand)
      expect(deckDefinitions('medusa')).toContain(card.definition);
    const handIds = new Set(initial.room.game!.hand.map((c) => c.id));
    expect(other.room.game!.hand.every((c) => !handIds.has(c.id))).toBe(true);
    expect(JSON.stringify(other)).not.toContain(initial.room.game!.hand[0].id);
    expect(other.room.game!.players.every((p) => !('deck' in p) && !('hand' in p))).toBe(true);
    const command = {
      id: crypto.randomUUID(),
      revision: startRevision,
      command: { type: 'maneuver' },
    };
    r1.send('command', command);
    const moved = await snapshot(r1, (s) => s.room.game?.revision === startRevision + 1);
    const otherMoved = await snapshot(r2, (s) => s.room.game?.revision === startRevision + 1);
    expect(moved.room.game!.hand.length).toBe(6);
    expect(otherMoved.room.game!.hand.length).toBe(5);
    const duplicate = errorMessage(r1);
    r1.send('command', command);
    expect((await duplicate).code).toBe('DUPLICATE');
    const stale = errorMessage(r1);
    r1.send('command', { ...command, id: crypto.randomUUID() });
    expect((await stale).code).toBe('STALE');
    const invalid = errorMessage(r1);
    r1.send('command', {
      id: 'bad',
      revision: startRevision + 1,
      command: { type: 'move', fighter: 'p0:main', path: [] },
    });
    expect((await invalid).code).toBe('INVALID');
    const rooms = await request('/rooms', undefined, a.cookie);
    expect(((await rooms.json()) as { id: string }[]).some((r) => r.id === r1.roomId)).toBe(false);
    await r1.leave();
    await r2.leave();
  });
  it('reconnects a pending choice and forfeits on actual transport timeout', async () => {
    const a = await account('reconnect');
    const b = await account('survivor');
    const c1 = sdk(a.cookie);
    const r1 = await connect(c1, 2);
    const r2 = await connect(sdk(b.cookie), undefined, r1.roomId);
    r1.send('ready');
    r2.send('ready');
    await snapshot(r1, (s) => s.room.seats.every((p) => p.ready));
    r1.send('start');
    const initial = await deployAndSkip([r1, r2]);
    r1.send('command', {
      id: crypto.randomUUID(),
      revision: initial.room.game!.revision,
      command: { type: 'maneuver' },
    });
    await snapshot(r1, (s) => s.room.game?.phase.type === 'choosing-movement');
    const token = r1.reconnectionToken;
    r1.reconnection.enabled = false;
    r1.connection.close(4001);
    await snapshot(r2, (s) => s.room.game?.paused === true);
    const restored = await c1.reconnect(token);
    connected.push(restored);
    restored.onMessage('snapshot', () => {});
    restored.onMessage('error', () => {});
    const s = await snapshot(restored, (p) => p.room.game?.paused === false);
    expect(s.room.game!.phase.type).toBe('choosing-movement');
    expect(s.room.game!.revision).toBe(initial.room.game!.revision + 1);
    expect(s.room.game!.hand).toHaveLength(6);
    restored.reconnection.enabled = false;
    restored.connection.close(4001);
    const finished = await snapshot(r2, (s) => s.room.game?.phase.type === 'finished');
    expect(finished.room.game!.phase).toEqual({ type: 'finished', winner: b.user.id });
    expect(activeSeats.has(a.user.id)).toBe(false);
    await r2.leave();
  });
  it('rejects duplicate admission without removing the original seat in a partially filled room', async () => {
    const a = await account('duplicate');
    const b = await account('witness');
    const r1 = await connect(sdk(a.cookie), 4);
    const r2 = await connect(sdk(b.cookie), undefined, r1.roomId);
    await expect(sdk(a.cookie).joinById(r1.roomId)).rejects.toThrow();
    const state = await snapshot(r1);
    expect(state.room.seats.map((s) => s.id)).toEqual([a.user.id, b.user.id]);
    expect(activeSeats.get(a.user.id)?.room).toBe(r1.roomId);
    await r1.leave();
    await r2.leave();
  });
  it('can explicitly forfeit a disconnected reserved seat over HTTP', async () => {
    const a = await account('leave_drop');
    const b = await account('leave_win');
    const r1 = await connect(sdk(a.cookie), 2);
    const r2 = await connect(sdk(b.cookie), undefined, r1.roomId);
    r1.send('ready');
    r2.send('ready');
    await snapshot(r1, (s) => s.room.seats.every((p) => p.ready));
    r1.send('start');
    await snapshot(r1, (s) => !!s.room.game);
    r1.reconnection.enabled = false;
    r1.connection.close(4001);
    await snapshot(r2, (s) => s.room.game?.paused === true);
    const response = await request('/rooms/leave', {}, a.cookie);
    expect(response.status).toBe(204);
    const end = await snapshot(r2, (s) => s.room.game?.phase.type === 'finished');
    expect(end.room.game?.phase).toEqual({ type: 'finished', winner: b.user.id });
    expect(activeSeats.has(a.user.id)).toBe(false);
    await r2.leave();
  });
  it('logout closes an active connection and transfers lobby ownership', async () => {
    const a = await account('logout');
    const b = await account('newhost');
    const r1 = await connect(sdk(a.cookie), 2);
    const r2 = await connect(sdk(b.cookie), undefined, r1.roomId);
    expect((await request('/auth/logout', {}, a.cookie)).status).toBe(204);
    const updated = await snapshot(r2, (s) => s.room.host === b.user.id);
    expect(updated.room.seats).toHaveLength(1);
    expect(activeSeats.has(a.user.id)).toBe(false);
    await r2.leave();
  });
});
