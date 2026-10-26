import { z } from 'zod';
import type {
  Fighter,
  Card,
  CombatReveal,
  BonusAttack,
  GameState,
  Outcome,
  ChoiceOption,
  ChoiceSource,
} from '@open-boards/game';
const cardId = z.string().min(1).max(100);
export const commandSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  command: z.discriminatedUnion('type', [
    z.object({ type: z.literal('maneuver') }),
    z.object({ type: z.literal('boost-maneuver'), card: cardId }),
    z.object({
      type: z.literal('place-ally'),
      fighter: cardId,
      position: z.string().min(1).max(30),
    }),
    z.object({ type: z.literal('finish-maneuver') }),
    z.object({
      type: z.literal('move'),
      fighter: cardId,
      path: z.array(z.string().max(30)).max(64),
    }),
    z.object({
      type: z.literal('attack'),
      fighter: cardId,
      card: cardId,
      target: z.string().max(100),
    }),
    z.object({ type: z.literal('defend'), card: cardId.nullable() }),
    z.object({ type: z.literal('play-action'), fighter: cardId, card: cardId }),
    z.object({ type: z.literal('discard'), cards: z.array(cardId).max(100) }),
    z.object({ type: z.literal('choose'), choice: cardId, options: z.array(cardId).max(100) }),
  ]),
});
export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,24}$/, 'Use 3–24 letters, numbers or underscores.'),
  password: z.string().min(8).max(128),
});
export const createRoomSchema = z.object({ capacity: z.union([z.literal(2), z.literal(4)]) });
export const characterSelectionSchema = z.object({ character: z.string().min(1).max(64) });
export interface User {
  id: string;
  name: string;
}
export interface Seat extends User {
  character: string;
  ready: boolean;
  connected: boolean;
  expiresAt: number | null;
}
export type PublicPhase =
  | Exclude<GameState['phase'], { type: 'awaiting-defense' }>
  | {
      type: 'awaiting-defense';
      attacker: string;
      defender: string;
      committedCard?: Card;
      bonus?: BonusAttack;
    };
export interface PublicPlayer extends User {
  character: string;
  handCount: number;
  deckCount: number;
  discard: Card[];
  ongoing?: Card[];
  eliminated: boolean;
}
export interface ChoiceView {
  id: string;
  player: string;
  prompt: string;
  source?: ChoiceSource;
  options: ChoiceOption[];
  min: number;
  max: number;
}
export interface GameView {
  movementLocks?: string[];
  revision: number;
  sequence: number;
  players: PublicPlayer[];
  fighters: Fighter[];
  boardTokens?: GameState['boardTokens'];
  maneuver: GameState['maneuver'];
  turn: number;
  actions: number;
  phase: PublicPhase;
  revealed: CombatReveal | null;
  hand: Card[];
  paused: boolean;
  choice: ChoiceView | null;
  observation?: { prompt: string; cards: Card[] };
}
export interface RoomView {
  id: string;
  host: string;
  capacity: 2 | 4;
  seats: Seat[];
  game: GameView | null;
}
export interface RoomListing {
  id: string;
  host: string;
  seats: number;
  capacity: 2 | 4;
}
export interface Snapshot {
  room: RoomView;
  outcomes: Outcome[];
  reset: boolean;
}
export interface CommandError {
  code: string;
  message: string;
  revision?: number;
}
