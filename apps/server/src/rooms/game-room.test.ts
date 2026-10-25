import { expect, it, vi } from 'vitest';
import type { Client } from '@colyseus/core';
import type { Sessions } from '../auth/session';
import { gameRoom } from './game-room';

it('releases a socket that drops during the join handshake without an unhandled rejection', async () => {
  const owners = new Map([['socket-a', 'a']]);
  const Room = gameRoom({} as Sessions, 'http://localhost:5173', new Map(), owners);
  const room = new Room();
  room.onCreate({ capacity: 2 });
  room.match.join({ id: 'a', name: 'Arden' }, () => {});
  room.match.join({ id: 'b', name: 'Briar' }, () => {});
  room.match.ready('a');
  room.match.ready('b');
  room.match.start('a');
  const rejection = Promise.reject(new Error('not joined'));
  vi.spyOn(room, 'allowReconnection').mockReturnValue(
    rejection as unknown as ReturnType<typeof room.allowReconnection>,
  );
  const client = { sessionId: 'socket-a', auth: { id: 'a', name: 'Arden' } } as Client<{
    auth: { id: string; name: string };
  }>;
  room.onDrop(client);
  await Promise.resolve();
  expect(room.match.seats.find((seat) => seat.id === 'a')?.connected).toBe(false);
  room.onLeave(client);
  expect(owners.has('socket-a')).toBe(false);
  room.onDispose();
});
