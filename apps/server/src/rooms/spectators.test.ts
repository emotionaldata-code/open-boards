import { afterEach, expect, it, vi } from 'vitest';
import type { Client } from '@colyseus/core';
import type { Snapshot, User } from '@open-boards/protocol';
import { defaultCharacter } from '@open-boards/content';
import type { Sessions } from '../auth/session';
import { gameRoom } from './game-room';
import { Match, activeSeats } from './match';
import { BotDriver } from './bot-driver';

afterEach(() => activeSeats.clear());

it('keeps spectators separate from seats and host ownership, including the same account', () => {
  const room = new Match('spectators', 2);
  room.watch('host-socket', { id: 'host', name: 'Host' });
  room.addBot('host', defaultCharacter, 'random');
  room.addBot('host', defaultCharacter, 'random');
  expect(() => room.addBot('other', defaultCharacter, 'random')).toThrow();
  expect(activeSeats.size).toBe(0);
  room.start('host');
  room.watch('late', { id: 'late', name: 'Late' });
  const before = structuredClone(room.game);
  room.unwatch('host-socket');
  expect(room.host).toBe('late');
  expect(room.game).toEqual(before);
  expect(room.paused).toBe(false);
  const view = room.view(null);
  expect(view.game!.hand).toEqual([]);
  expect(view.game!.choice).toBeNull();
  view.seats[0].ready = false;
  expect(room.seats[0].ready).toBe(true);
  expect(room.listing()).toMatchObject({ phase: 'playing', joinable: false, watchable: true });
  room.dispose();
});

it('rejects unknown policies before creating a bot', () => {
  const match = new Match('registry', 2);
  match.watch('host', { id: 'host', name: 'Host' });
  expect(() => match.addBot('host', defaultCharacter, 'file:///evil.js')).toThrow('supported bot');
  expect(match.seats).toHaveLength(0);
});

it('blocks player messages and private snapshots on a spectator socket sharing a player account', () => {
  const Room = gameRoom({} as Sessions, '', new Map(), new Map());
  const room = new Room();
  const registrations = vi.spyOn(room, 'onMessage');
  room.onCreate({ capacity: 2 });
  const client = (sessionId: string, id: string) =>
    ({ sessionId, auth: { id, name: id }, send: vi.fn(), leave: vi.fn() }) as unknown as Client<{
      auth: User;
    }>;
  const player = client('player', 'a');
  const other = client('other', 'b');
  const viewer = client('viewer', 'a');
  room.clients.push(player, other, viewer);
  room.onJoin(player);
  room.onJoin(other);
  room.onJoin(viewer, { role: 'spectator' });
  const send = (name: string, payload?: unknown) => {
    const registration = registrations.mock.calls.find(([type]) => type === name)!;
    (registration[1] as unknown as (client: typeof viewer, payload?: unknown) => void)(
      viewer,
      payload,
    );
  };
  send('ready');
  expect(room.match.seats[0].ready).toBe(false);
  send('character', { character: defaultCharacter });
  room.match.ready('a');
  room.match.ready('b');
  room.match.start('a');
  expect(room.match.view('a', 'spectator').game!.hand).toEqual([]);
  const before = structuredClone(room.match.game);
  send('command', { id: crypto.randomUUID(), revision: 0, command: { type: 'maneuver' } });
  expect(room.match.game).toEqual(before);
  send('sync');
  const snapshot = vi
    .mocked(viewer.send)
    .mock.calls.filter(([type]) => type === 'snapshot')
    .at(-1)![1] as Snapshot;
  expect(snapshot.room.viewerRole).toBe('spectator');
  expect(snapshot.room.game!.hand).toEqual([]);
  room.onLeave(viewer);
  expect(room.match.game).toEqual(before);
  expect(room.match.seats[0].connected).toBe(true);
  expect(activeSeats.has('a')).toBe(true);
  room.onDispose();
});

it('paces bot-v-bot commands through Match and stops when unwatched or disposed', async () => {
  const match = new Match('bots', 2);
  match.watch('host', { id: 'host', name: 'Host' });
  match.addBot('host', defaultCharacter, 'random');
  match.addBot('host', defaultCharacter, 'random');
  match.start('host');
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const driver = new BotDriver(match, () => driver.update(true), 2);
  driver.update(true);
  expect(match.game!.revision).toBe(0);
  await vi.waitFor(() => expect(match.game!.revision).toBeGreaterThanOrEqual(12), {
    timeout: 3000,
  });
  driver.update(false);
  const stopped = match.game!.revision;
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(match.game!.revision).toBe(stopped);
  driver.update(true);
  driver.dispose();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(match.game!.revision).toBe(stopped);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
  match.dispose();
});

it('waits for a human and cancels a pending bot decision while that human is disconnected', async () => {
  const match = new Match('human-bot', 2);
  match.watch('host', { id: 'host', name: 'Host' });
  match.addBot('host', defaultCharacter, 'random');
  match.join({ id: 'human', name: 'Human' }, () => {});
  match.ready('human');
  match.start('host');
  const driver = new BotDriver(match, () => driver.update(true), 5);
  driver.update(true);
  match.disconnect('human');
  driver.update(true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(match.game!.revision).toBe(0);
  match.reconnect('human');
  driver.update(true);
  await vi.waitFor(() => expect(match.game!.revision).toBeGreaterThan(0));
  driver.dispose();
  match.dispose();
});
