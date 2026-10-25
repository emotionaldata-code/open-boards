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
import type { CommandError, RoomListing, RoomView, Seat, User } from '@open-boards/protocol';
import { projectGame } from '../transport/projection';

export const activeSeats = new Map<string, { room: string; disconnect: () => void }>();
export class Match {
  seats: Seat[] = [];
  host = '';
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
      character: defaultCharacter,
      ready: false,
      connected: true,
      expiresAt: null,
    });
    if (!this.host) this.host = user.id;
    activeSeats.set(user.id, { room: this.id, disconnect });
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
    if (seat) {
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
    if (this.host === id) this.host = this.seats[0]?.id ?? '';
    return [];
  }
  listing(): RoomListing {
    return {
      id: this.id,
      host: this.seats.find((p) => p.id === this.host)?.name ?? '',
      seats: this.seats.length,
      capacity: this.capacity,
    };
  }
  view(viewer: string): RoomView {
    return {
      id: this.id,
      host: this.host,
      capacity: this.capacity,
      seats: this.seats,
      game: this.game ? projectGame(this.game, viewer, this.paused) : null,
    };
  }
  dispose(): void {
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
