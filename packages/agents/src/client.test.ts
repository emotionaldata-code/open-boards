import { expect, it, vi } from 'vitest';
import type { Client, Room } from '@colyseus/sdk';
import { RemoteClient, RemoteRoom } from './client';
import { basic } from '@open-boards/content';
import { projectGame, simulate } from './index';

it('uses existing auth sessions and forwards Node cookies to matchmaking', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'a', name: 'Alice' }), {
        headers: { 'set-cookie': 'boards_session=test; HttpOnly; SameSite=Strict' },
      }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'a', name: 'Alice' })))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const room = {
    onMessage: vi.fn(),
    onError: vi.fn(),
    onLeave: vi.fn(),
    onReconnect: vi.fn(),
    send: vi.fn(),
  };
  const join = vi.fn().mockResolvedValue(room);
  const transport = vi.fn(() => ({ joinById: join }) as unknown as Client);
  const client = new RemoteClient({
    endpoint: 'http://localhost:3000',
    fetch: request,
    createTransport: transport,
  });
  expect(await client.login('Alice', 'password')).toEqual({ id: 'a', name: 'Alice' });
  expect(request.mock.calls[0][0].toString()).toBe('http://localhost:3000/api/auth/login');
  await client.session();
  expect(request.mock.calls[1][1]?.headers).toMatchObject({ Cookie: 'boards_session=test' });
  await client.join('room', { snapshot: () => {} }, 'spectator');
  expect(transport).toHaveBeenCalledWith('http://localhost:3000', {
    Cookie: 'boards_session=test',
    Origin: 'http://localhost:3000',
  });
  expect(join).toHaveBeenCalledWith('room', { role: 'spectator' });
  await client.logout();
});

it('preserves revision and command id on remote submission', () => {
  const send = vi.fn();
  const room = new RemoteRoom(
    {
      onMessage: vi.fn(),
      onError: vi.fn(),
      onLeave: vi.fn(),
      onReconnect: vi.fn(),
      send,
    } as unknown as Room,
    { snapshot: () => {} },
  );
  expect(() => room.command({ type: 'maneuver' })).toThrow('Wait for a game snapshot');
  room.command({ type: 'maneuver' }, 7, 'request-id');
  expect(send).toHaveBeenCalledWith('command', {
    id: 'request-id',
    revision: 7,
    command: { type: 'maneuver' },
  });
});

it('fetches current public definitions using the authenticated rules endpoint', async () => {
  const definitions = { cards: {}, characters: {}, map: { id: 'test' } };
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(definitions)));
  const client = new RemoteClient({
    endpoint: 'http://localhost:3000',
    cookie: 'boards_session=test',
    fetch: request,
  });
  expect(await client.rules()).toEqual(definitions);
  expect(request.mock.calls[0][0].toString()).toBe('http://localhost:3000/api/rules');
  expect(request.mock.calls[0][1]?.headers).toMatchObject({ Cookie: 'boards_session=test' });
});

it('does not offer player policy observations from spectator snapshots', async () => {
  const { state } = await simulate({
    definitions: basic,
    players: [
      { id: 'a', name: 'A', character: 'alice' },
      { id: 'b', name: 'B', character: 'bigfoot' },
    ],
    seed: 1,
    maxSteps: 0,
  });
  const room = new RemoteRoom(
    {
      onMessage: vi.fn(),
      onError: vi.fn(),
      onLeave: vi.fn(),
      onReconnect: vi.fn(),
      send: vi.fn(),
    } as unknown as Room,
    { snapshot: () => {} },
  );
  room.snapshot = {
    room: {
      id: 'room',
      host: 'a',
      capacity: 2,
      seats: [],
      spectators: 1,
      viewerRole: 'spectator',
      game: projectGame(state, null),
    },
    outcomes: [],
    reset: true,
  };
  expect(room.observation('a', basic)).toBeNull();
});
