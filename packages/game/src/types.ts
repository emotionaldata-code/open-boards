import type {
  Ability,
  ActiveStatus,
  CounterDefinition,
  Effect,
  StatusDefinition,
} from './abilities/vocabulary';
import type { ResolutionState } from './abilities/state';
export type CardCategory = 'attack' | 'defense' | 'versatile' | 'action';
export interface CardDefinition {
  id: string;
  name: string;
  usableBy: 'MAIN' | 'ALLY' | 'BOTH';
  category: CardCategory;
  value: number;
  boost: number;
  description?: string;
  effects?: Effect[];
  abilities?: Ability[];
}
export interface FighterDefinition {
  name: string;
  hp: number;
  attackType: 'melee' | 'ranged';
  abilities?: Ability[];
  counters?: Record<string, CounterDefinition>;
}
export interface CharacterDefinition extends FighterDefinition {
  id: string;
  movement: number;
  deck: { card: string; count: number }[];
  ally?: FighterDefinition & { id: string; count: number };
}
export interface Fighter {
  id: string;
  player: string;
  character: string;
  definition: string;
  role: 'main' | 'ally';
  hp: number;
  position: string | null;
  defeated: boolean;
  counters: Record<string, number>;
  statuses: ActiveStatus[];
}
export interface MapDefinition {
  id: string;
  name: string;
  nodes: string[];
  zones: Record<string, string[]>;
  edges: [string, string][];
  /** Any portal can reach another for one movement point; never grants attack adjacency. */
  portals?: string[];
  spawns: { 2: string[]; 4: string[] };
}
export interface Definitions {
  characters: Record<string, CharacterDefinition>;
  cards: Record<string, CardDefinition>;
  map: MapDefinition;
  statuses?: Record<string, StatusDefinition>;
}
export interface Card {
  id: string;
  definition: string;
}
export interface Player {
  id: string;
  name: string;
  character: string;
  hand: Card[];
  deck: Card[];
  discard: Card[];
  eliminated: boolean;
  departed: boolean;
}
export type Phase =
  | { type: 'taking-actions' }
  | { type: 'placing-allies'; player: string }
  | { type: 'choosing-movement'; player: string }
  | { type: 'ability-choice'; player: string }
  | { type: 'awaiting-defense'; attacker: string; defender: string; card: Card }
  | { type: 'discarding'; player: string }
  | { type: 'finished'; winner: string | null };
export interface CombatReveal {
  attacker: string;
  defender: string;
  attack: Card;
  defense: Card | null;
  boosts: { card: Card; amount: number; cancelled?: boolean }[];
  damage: number;
}
export interface GameState {
  revision: number;
  sequence: number;
  players: Player[];
  fighters: Fighter[];
  maneuver: {
    player: string;
    remaining: string[];
    finishing: boolean;
    boost: number;
    boostable: boolean;
  } | null;
  turn: number;
  actions: number;
  phase: Phase;
  revealed: CombatReveal | null;
  processed: string[];
  resolution: ResolutionState;
}
export type Command =
  | { type: 'maneuver' }
  | { type: 'boost-maneuver'; card: string }
  | { type: 'place-ally'; fighter: string; position: string }
  | { type: 'finish-maneuver' }
  | { type: 'move'; fighter: string; path: string[] }
  | { type: 'attack'; fighter: string; card: string; target: string }
  | { type: 'defend'; card: string | null }
  | { type: 'play-action'; fighter: string; card: string }
  | { type: 'discard'; cards: string[] }
  | { type: 'end-turn' }
  | { type: 'choose'; choice: string; options: string[] };
export interface CommandEnvelope {
  id: string;
  revision: number;
  command: Command;
}
export type OutcomeData =
  | { type: 'draw'; player: string; cards: Card[] }
  | { type: 'damage'; fighter: string; amount: number; reason: 'combat' | 'exhaustion' | 'ability' }
  | { type: 'move'; fighter: string; path: string[] }
  | { type: 'combat'; combat: CombatReveal }
  | {
      type: 'boost';
      player: string;
      fighter: string;
      card: Card;
      amount: number;
      purpose: 'maneuver' | 'attack';
      cancelled?: boolean;
    }
  | { type: 'defeated'; fighter: string }
  | { type: 'revived'; fighter: string; position: string }
  | { type: 'eliminated'; player: string }
  | { type: 'turn'; player: string }
  | { type: 'finished'; winner: string | null }
  | { type: 'played'; player: string; fighter: string; card: Card }
  | { type: 'heal'; fighter: string; amount: number }
  | { type: 'ability'; fighter: string; name: string }
  | { type: 'status'; fighter: string; status: string; stacks: number };
export type Outcome = OutcomeData & {
  sequence: number;
  revision: number;
  audience: string | 'all';
};
export type Result =
  | { ok: true; state: GameState; outcomes: Outcome[] }
  | { ok: false; error: 'DUPLICATE' | 'STALE' | 'ILLEGAL'; message: string };
