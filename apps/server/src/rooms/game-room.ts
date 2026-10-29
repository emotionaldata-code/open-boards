import { Room, ServerError, type Client, type AuthContext } from '@colyseus/core';
import {
  commandSchema,
  joinRoomSchema,
  addBotSchema,
  removeBotSchema,
  type ConnectionRole,
  createRoomSchema,
  characterSelectionSchema,
  type User,
  type Snapshot,
} from '@open-boards/protocol';
import type { Outcome } from '@open-boards/game';
import type { Sessions } from '../auth/session';
import { Match } from './match';
import { BotDriver } from './bot-driver';
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
    private roles = new Map<string, ConnectionRole>();
    private bots!: BotDriver;
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
      // Connections include viewers; seat capacity is enforced by Match.
      this.maxClients = 100;
      this.maxMessagesPerSecond = 20;
      this.match = new Match(this.roomId, parsed.data.capacity);
      registry.set(this.roomId, this.match);
      this.bots = new BotDriver(this.match, (outcomes) => this.publish(outcomes));
      this.onMessage('sync', (client) => this.sendSnapshot(client, [], true));
      this.onMessage('ready', (client) =>
        this.control(client, () => {
          this.requirePlayer(client);
          this.match.ready(client.auth!.id);
        }),
      );
      this.onMessage('character', (client, input: unknown) => {
        const parsed = characterSelectionSchema.safeParse(input);
        if (!parsed.success) {
          client.send('error', { code: 'INVALID', message: 'Choose a supported character.' });
          return;
        }
        this.control(client, () => {
          this.requirePlayer(client);
          this.match.selectCharacter(client.auth!.id, parsed.data.character);
        });
      });
      this.onMessage('start', (client) =>
        this.control(client, () => {
          this.match.start(client.auth!.id);
        }),
      );
      this.onMessage('add-bot', (client, input: unknown) => {
        this.control(client, () => {
          const parsed = addBotSchema.parse(input);
          this.match.addBot(client.auth!.id, parsed.character, parsed.policy);
        });
      });
      this.onMessage('remove-bot', (client, input: unknown) => {
        this.control(client, () =>
          this.match.removeBot(client.auth!.id, removeBotSchema.parse(input).id),
        );
      });
      // Handlers are synchronous: no I/O can interleave a game transition.
      this.onMessage('command', (client, input: unknown) => {
        if (this.roles.get(client.sessionId) !== 'player') {
          client.send('error', { code: 'SPECTATOR', message: 'Spectators cannot play commands.' });
          return;
        }
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
    onJoin(client: GameClient, options: unknown = {}): void {
      try {
        const role = joinRoomSchema.parse(options).role;
        if (role === 'spectator') this.match.watch(client.sessionId, client.auth!);
        else {
          this.match.join(client.auth!, () => {
            const outcomes = this.match.leave(client.auth!.id);
            this.reservations.get(client.auth!.id)?.reject();
            client.leave(4000);
            this.publish(outcomes);
          });
        }
        this.roles.set(client.sessionId, role);
        owners.set(client.sessionId, client.auth!.id);
      } catch (error) {
        throw new ServerError(409, (error as Error).message);
      }
      this.publish();
    }
    onDrop(client: GameClient): void {
      if (!owners.has(client.sessionId)) return;
      if (this.roles.get(client.sessionId) === 'spectator') {
        client.leave(4000);
        return;
      }
      if (!this.match.needsConnection(client.auth!.id)) {
        client.leave(4000);
        return;
      }
      this.match.disconnect(client.auth!.id, Date.now(), reconnectSeconds * 1000);
      const reservation = this.allowReconnection(client, reconnectSeconds);
      // Core runs onLeave for expired reservations and failed join handshakes.
      // Observe the rejection here too: a pre-join drop returns an already-rejected promise.
      void reservation.catch(() => this.reservations.delete(client.auth!.id));
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
      const role = this.roles.get(client.sessionId);
      if (role !== 'spectator') this.reservations.delete(client.auth!.id);
      this.roles.delete(client.sessionId);
      if (role === 'spectator') {
        this.match.unwatch(client.sessionId);
        this.publish();
      } else this.publish(this.match.leave(client.auth!.id));
    }
    onDispose(): void {
      this.bots?.dispose();
      this.roles.clear();
      for (const client of this.clients) owners.delete(client.sessionId);
      this.reservations.clear();
      this.match?.dispose();
      registry.delete(this.roomId);
    }
    private requirePlayer(client: GameClient): void {
      if (this.roles.get(client.sessionId) !== 'player')
        throw new Error('Spectators cannot control player seats.');
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
      const role = this.roles.get(client.sessionId) ?? 'player';
      const viewer = role === 'player' ? client.auth!.id : null;
      const payload: Snapshot = {
        room: this.match.view(viewer, role),
        outcomes: projectOutcomes(outcomes, viewer),
        reset,
      };
      client.send('snapshot', payload);
    }
    private publish(outcomes: Outcome[] = [], reset = false): void {
      for (const client of this.clients)
        if (this.roles.has(client.sessionId)) this.sendSnapshot(client, outcomes, reset);
      this.bots?.update(this.clients.some((client) => this.roles.has(client.sessionId)));
    }
  };
}
