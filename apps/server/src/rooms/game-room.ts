import { Room, ServerError, type Client, type AuthContext } from '@colyseus/core';
import {
  commandSchema,
  createRoomSchema,
  characterSelectionSchema,
  type User,
  type Snapshot,
} from '@open-boards/protocol';
import type { Outcome } from '@open-boards/game';
import type { Sessions } from '../auth/session';
import { Match } from './match';
import { projectOutcomes } from '../transport/projection';

type GameClient = Client<{ auth: User }>;
export function gameRoom(
  sessions: Sessions,
  origin: string,
  registry: Map<string, Match>,
  owners: Map<string, string>,
  reconnectSeconds = 120,
) {
  return class GameRoom extends Room<{ client: GameClient }> {
    match!: Match;
    private reservations = new Map<string, { reject: () => void }>();
    static async onAuth(_token: string, _options: unknown, context: AuthContext): Promise<User> {
      if (context.headers.get('origin') !== origin) throw new ServerError(403, 'Untrusted origin.');
      try {
        return await sessions.verify(context.headers.get('cookie') ?? undefined);
      } catch {
        throw new ServerError(401, 'Sign in to join a room.');
      }
    }
    onCreate(options: unknown): void {
      const parsed = createRoomSchema.safeParse(options);
      if (!parsed.success) throw new ServerError(400, 'Choose 2 or 4 seats.');
      this.maxClients = parsed.data.capacity;
      this.maxMessagesPerSecond = 20;
      this.match = new Match(this.roomId, parsed.data.capacity);
      registry.set(this.roomId, this.match);
      this.onMessage('sync', (client) => this.sendSnapshot(client, [], true));
      this.onMessage('ready', (client) =>
        this.control(client, () => this.match.ready(client.auth!.id)),
      );
      this.onMessage('character', (client, input: unknown) => {
        const parsed = characterSelectionSchema.safeParse(input);
        if (!parsed.success) {
          client.send('error', { code: 'INVALID', message: 'Choose a supported character.' });
          return;
        }
        this.control(client, () =>
          this.match.selectCharacter(client.auth!.id, parsed.data.character),
        );
      });
      this.onMessage('start', (client) =>
        this.control(client, () => {
          this.match.start(client.auth!.id);
          void this.lock();
        }),
      );
      // Handlers are synchronous: no I/O can interleave a game transition.
      this.onMessage('command', (client, input: unknown) => {
        const parsed = commandSchema.safeParse(input);
        if (!parsed.success) {
          client.send('error', { code: 'INVALID', message: 'Invalid command.' });
          return;
        }
        const result = this.match.command(client.auth!.id, parsed.data);
        if (result.error) {
          client.send('error', result.error);
          this.sendSnapshot(client, [], false);
        } else this.publish(result.outcomes);
      });
    }
    onJoin(client: GameClient): void {
      try {
        this.match.join(client.auth!, () => {
          const outcomes = this.match.leave(client.auth!.id);
          this.reservations.get(client.auth!.id)?.reject();
          client.leave(4000);
          this.publish(outcomes);
        });
        owners.set(client.sessionId, client.auth!.id);
      } catch (error) {
        throw new ServerError(409, (error as Error).message);
      }
      this.publish();
    }
    onDrop(client: GameClient): void {
      if (!owners.has(client.sessionId)) return;
      if (!this.match.needsConnection(client.auth!.id)) {
        client.leave(4000);
        return;
      }
      this.match.disconnect(client.auth!.id, Date.now(), reconnectSeconds * 1000);
      const reservation = this.allowReconnection(client, reconnectSeconds);
      this.reservations.set(client.auth!.id, { reject: () => reservation.reject() });
      this.publish();
    }
    onReconnect(client: GameClient): void {
      this.reservations.delete(client.auth!.id);
      this.match.reconnect(client.auth!.id);
      this.publish([], true);
    }
    onLeave(client: GameClient): void {
      if (!owners.has(client.sessionId)) return;
      owners.delete(client.sessionId);
      this.reservations.delete(client.auth!.id);
      this.publish(this.match.leave(client.auth!.id));
    }
    onDispose(): void {
      for (const client of this.clients) owners.delete(client.sessionId);
      this.reservations.clear();
      this.match?.dispose();
      registry.delete(this.roomId);
    }
    private control(client: GameClient, action: () => void): void {
      try {
        action();
        this.publish();
      } catch (error) {
        client.send('error', { code: 'LOBBY', message: (error as Error).message });
      }
    }
    private sendSnapshot(client: GameClient, outcomes: Outcome[], reset: boolean): void {
      const payload: Snapshot = {
        room: this.match.view(client.auth!.id),
        outcomes: projectOutcomes(outcomes, client.auth!.id),
        reset,
      };
      client.send('snapshot', payload);
    }
    private publish(outcomes: Outcome[] = [], reset = false): void {
      for (const client of this.clients)
        if (this.match.seats.find((p) => p.id === client.auth!.id)?.connected)
          this.sendSnapshot(client, outcomes, reset);
    }
  };
}
