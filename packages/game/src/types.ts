import type {
  Ability,
  ActiveStatus,
  CounterDefinition,
  Effect,
  FighterCondition,
  DiscardTopCondition,
  StatusDefinition,
} from './abilities/vocabulary';
import type { ResolutionState } from './abilities/state';
export type CardCategory = 'attack' | 'defense' | 'versatile' | 'action';
export interface CardDefinition {
  id: string;
  name: string;
  usableBy: 'MAIN' | 'ALLY' | 'BOTH';
  /** Optional exact fighter identity, independent of its chosen hero/sidekick role. */
  fighter?: string;
  /** Required current form/status; declaration permission is checked before commitment. */
  requiresStatus?: string;
  category: CardCategory;
  value: number;
  boost: number;
  tags?: string[];
  description?: string;
  faceUpDefense?: boolean;
  defenseMode?: { when: Omit<DiscardTopCondition, 'target'> };
  effectsCannotBeCancelled?: boolean;
  boostEffects?: Effect[];
  handInspectionProtection?: boolean;
  combatSurvival?: boolean;
  attackMode?: { when: FighterCondition; range?: 'any'; faceUp?: boolean };
  ongoing?: {
    preventEnemyActionGain?: boolean;
    optionalDiscardProtection?: boolean;
    discardUnlessAttacked?: boolean;
    movementValue?: number;
    discardUnlessEnemyInZone?: boolean;
    boostBonus?: number;
    preventMainAbilityDamage?: boolean;
  };
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
  discardBase?: { name: string; description: string; tags: string[] };
  maneuverBonus?: { name: string; description: string; perDiscardTag: string };
  /** Choose either identity as hero before opening hands; role health stays fixed. */
  heroSelection?: { name: string; description: string; mainName: string };
  conditionalModifiers?: {
    name: string;
    description: string;
    when: FighterCondition;
    attack?: number;
    defense?: number;
    movement?: number;
  }[];
  boardTokens?: {
    id: string;
    name: string;
    count: number;
    exclusive?: boolean;
    linksMovement?: boolean;
  };
  cardEffectProtection?: { name: string; description: string; tags: CardDefinition['usableBy'][] };
  deck: { card: string; count: number }[];
  deckSelection?: {
    name: string;
    description: string;
    groups: { name: string; cards: string[] }[];
  };
  ally?: FighterDefinition & { id: string; count: number; startsOffBoard?: boolean };
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
  ongoing?: Card[];
  eliminated: boolean;
  departed: boolean;
}
export type Phase =
  | { type: 'taking-actions' }
  | { type: 'placing-allies'; player: string }
  | { type: 'choosing-movement'; player: string }
  | { type: 'ability-choice'; player: string }
  | {
      type: 'awaiting-defense';
      attacker: string;
      defender: string;
      card: Card;
      bonus?: BonusAttack;
    }
  | { type: 'discarding'; player: string }
  | { type: 'finished'; winner: string | null };
export interface BonusAttack {
  name: string;
  value: number;
  combatValue?: number;
}
export interface CombatReveal {
  bonus?: BonusAttack;
  attacker: string;
  defender: string;
  attack: Card;
  defense: Card | null;
  boosts: { card: Card; amount: number; cancelled?: boolean; field?: 'attack' | 'defense' }[];
  damage: number;
  prediction?: number;
}
export interface BoardToken {
  id: string;
  owner: string;
  kind: string;
  name: string;
  position: string | null;
  linksMovement?: boolean;
  exclusive?: boolean;
}
export interface GameState {
  boardTokens?: BoardToken[];
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
  | { type: 'attack'; fighter: string; card: string; target: string; faceUp?: boolean }
  | { type: 'defend'; card: string | null }
  | { type: 'play-action'; fighter: string; card: string }
  | { type: 'discard'; cards: string[] }
  | { type: 'choose'; choice: string; options: string[] };
export interface CommandEnvelope {
  id: string;
  revision: number;
  command: Command;
}
export type OutcomeData =
  | { type: 'hand-revealed'; player: string; cards: Card[]; zone?: 'deck' }
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
      purpose: 'maneuver' | 'attack' | 'defense';
      cancelled?: boolean;
    }
  | { type: 'defeated'; fighter: string }
  | { type: 'revived'; fighter: string; position: string }
  | { type: 'placed'; fighter: string; position: string }
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
