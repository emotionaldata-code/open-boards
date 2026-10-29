import { isPolicyId, observe } from '@open-boards/agents';
import { randomInt, randomUUID } from 'node:crypto';
import {
  createGame,
  execute,
  forfeit,
  prepareDefinitions,
  type Definitions,
  type Card,
  type CommandEnvelope,
  type GameState,
  type Outcome,
} from '@open-boards/game';
import { basic, deckDefinitions, defaultCharacter } from '@open-boards/content';
import type {
  CommandError,
  RoomListing,
  RoomView,
  Seat,
  User,
  ConnectionRole,
} from '@open-boards/protocol';
import { projectGame } from '../transport/projection';

export const activeSeats = new Map<string, { room: string; disconnect: () => void }>();
export class Match {
  seats: Seat[] = [];
  host = '';
  private spectators = new Map<string, User>();
  game: GameState | null = null;
  private definitions: Definitions = basic;
  constructor(
    readonly id: string,
    readonly capacity: 2 | 4,
    private readonly deck: (character: string) => Card[] = shuffledDeck,
  ) {}
  join(user: User, disconnect: () => void): void {
    if (this.game || this.seats.length >= this.capacity)
      throw new Error('This room is full or has already started.');
    if (activeSeats.has(user.id)) throw new Error('This account already has an active seat.');
    this.seats.push({
      ...user,
      controller: { type: 'human' },
      character: defaultCharacter,
      ready: false,
      connected: true,
      expiresAt: null,
    });
    if (!this.host) this.host = user.id;
    activeSeats.set(user.id, { room: this.id, disconnect });
  }
  watch(connection: string, user: User): void {
    this.spectators.set(connection, { ...user });
    if (!this.host) this.host = user.id;
  }
  unwatch(connection: string): void {
    const user = this.spectators.get(connection);
    this.spectators.delete(connection);
    if (
      user?.id === this.host &&
      !this.seats.some((p) => p.id === this.host) &&
      ![...this.spectators.values()].some((p) => p.id === this.host)
    )
      this.transferHost();
  }
  private transferHost(): void {
    this.host =
      this.seats.find((p) => p.controller.type === 'human')?.id ??
      this.spectators.values().next().value?.id ??
      '';
  }
  addBot(host: string, character: string, policy: string): void {
    if (host !== this.host || this.game || this.seats.length >= this.capacity)
      throw new Error('Only the host can add bots to available seats before starting.');
    if (!Object.hasOwn(basic.characters, character))
      throw new Error('Choose a supported character.');
    if (!isPolicyId(policy)) throw new Error('Choose a supported bot policy.');
    this.seats.push({
      id: `bot:${randomUUID()}`,
      name: `Bot ${this.seats.filter((p) => p.controller.type === 'bot').length + 1}`,
      character,
      controller: { type: 'bot', policy },
      ready: true,
      connected: true,
      expiresAt: null,
    });
  }
  removeBot(host: string, id: string): void {
    if (host !== this.host || this.game)
      throw new Error('Only the host can remove bots before starting.');
    this.seats = this.seats.filter((p) => p.id !== id || p.controller.type !== 'bot');
  }
  ready(id: string): void {
    const seat = this.seats.find((p) => p.id === id);
    if (!seat || this.game) throw new Error('Readiness cannot change now.');
    seat.ready = !seat.ready;
  }
  selectCharacter(id: string, character: string): void {
    const seat = this.seats.find((p) => p.id === id);
    if (!seat || this.game) throw new Error('Characters can only change before the match starts.');
    if (!Object.hasOwn(basic.characters, character))
      throw new Error('Choose a supported character.');
    if (seat.character === character) return;
    seat.character = character;
    seat.ready = false;
  }
  start(id: string): void {
    if (
      id !== this.host ||
      this.game ||
      this.seats.length !== this.capacity ||
      this.seats.some((p) => !p.ready || !p.connected)
    )
      throw new Error('The host can start when every seat is filled and ready.');
    this.definitions = prepareDefinitions(basic);
    this.game = createGame(
      this.seats.map((p) => ({ ...p, deck: this.deck(p.character) })),
      this.definitions,
      randomInt(1, 0x100000000),
    );
  }
  needsConnection(id: string): boolean {
    const game = this.game;
    const player = game?.players.find((p) => p.id === id);
    return (
      !!game &&
      !!player &&
      game.phase.type !== 'finished' &&
      (!player.eliminated || (game.phase.type === 'ability-choice' && game.phase.player === id))
    );
  }
  get paused(): boolean {
    return this.seats.some((p) => !p.connected && this.needsConnection(p.id));
  }
  botObservation(id: string) {
    if (!this.game) throw new Error('The match has not started.');
    return observe(this.game, this.definitions, id);
  }
  command(id: string, command: CommandEnvelope): { outcomes: Outcome[]; error?: CommandError } {
    if (!this.game)
      return {
        outcomes: [],
        error: { code: 'NOT_STARTED', message: 'The match has not started.' },
      };
    if (this.paused)
      return {
        outcomes: [],
        error: {
          code: 'PAUSED',
          message: 'Waiting for disconnected players to return.',
          revision: this.game.revision,
        },
      };
    const result = execute(this.game, id, command, this.definitions);
    if (!result.ok)
      return {
        outcomes: [],
        error: { code: result.error, message: result.message, revision: this.game.revision },
      };
    this.game = result.state;
    return { outcomes: result.outcomes };
  }
  disconnect(id: string, now = Date.now(), grace = 120_000): void {
    const seat = this.seats.find((p) => p.id === id);
    if (seat?.controller.type === 'human') {
      seat.connected = false;
      seat.expiresAt = now + grace;
    }
  }
  reconnect(id: string): void {
    const seat = this.seats.find((p) => p.id === id);
    if (!seat || seat.connected || !activeSeats.has(id))
      throw new Error('This seat cannot reconnect.');
    seat.connected = true;
    seat.expiresAt = null;
  }
  leave(id: string): Outcome[] {
    const seat = this.seats.find((p) => p.id === id);
    if (!seat) return [];
    if (activeSeats.get(id)?.room === this.id) activeSeats.delete(id);
    if (this.game) {
      seat.connected = false;
      seat.expiresAt = null;
      const result = forfeit(this.game, id, this.definitions);
      this.game = result.state;
      return result.outcomes;
    }
    this.seats = this.seats.filter((p) => p.id !== id);
    if (this.host === id) this.transferHost();
    return [];
  }
  listing(): RoomListing {
    return {
      id: this.id,
      host:
        this.seats.find((p) => p.id === this.host)?.name ??
        [...this.spectators.values()].find((p) => p.id === this.host)?.name ??
        '',
      phase: this.game ? (this.game.phase.type === 'finished' ? 'finished' : 'playing') : 'waiting',
      joinable: !this.game && this.seats.length < this.capacity,
      watchable: true,
      seats: this.seats.length,
      capacity: this.capacity,
    };
  }
  view(
    viewer: string | null,
    viewerRole: ConnectionRole = viewer === null ? 'spectator' : 'player',
  ): RoomView {
    return {
      id: this.id,
      host: this.host,
      capacity: this.capacity,
      viewerRole,
      spectators: this.spectators.size,
      seats: structuredClone(this.seats),
      game: this.game
        ? projectGame(this.game, viewerRole === 'spectator' ? null : viewer, this.paused)
        : null,
    };
  }
  dispose(): void {
    this.spectators.clear();
    for (const seat of this.seats)
      if (activeSeats.get(seat.id)?.room === this.id) activeSeats.delete(seat.id);
  }
}
export function shuffledDeck(character = defaultCharacter): Card[] {
  const deck = deckDefinitions(character).map((definition) => ({ id: randomUUID(), definition }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
