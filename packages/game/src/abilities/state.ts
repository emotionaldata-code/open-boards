import type { BoardToken, BonusAttack, Card, Phase } from '../types';
import type { Ability, Effect, Hook, PlayerRef } from './vocabulary';

export type Operation =
  | { kind: 'draw'; actor: string; amount: number }
  | {
      kind: 'damage';
      actor: string;
      target: string;
      amount: number;
      reason: 'combat' | 'exhaustion' | 'ability';
      defeated?: boolean;
      combat?: number;
      area?: number;
    }
  | { kind: 'heal'; actor: string; target: string; amount: number }
  | {
      kind: 'move';
      actor: string;
      target: string;
      path: string[];
      distance: number;
      mode: 'move' | 'push' | 'pull' | 'teleport';
      origin: string;
      zone?: 'any' | 'shared';
      token?: string;
      starting?: boolean;
      throughEnemies?: boolean;
      anchor?: string;
      range?: 'adjacent';
      allowDefeatedAnchor?: boolean;
      includeOrigin?: boolean;
    }
  | {
      kind: 'combat';
      actor: string;
      target: string;
      attacker: string;
      defender: string;
      card: Card;
      defenseCard: Card | null;
      boosts: {
        card: Card;
        grant: string;
        cancelWithCard: boolean;
        cancelled?: boolean;
        fighter?: string;
        cardEffect?: boolean;
        field?: 'attack' | 'defense';
      }[];
      bonus?: BonusAttack;
      bonusAttack?: BonusAttack;
      protectedFighters?: string[];
      cardValues?: Record<string, number>;
      attack: number;
      defense: number;
      lockedValues?: { attack?: boolean; defense?: boolean };
      amount: number;
      revealed?: boolean;
      defenseCancelled?: boolean;
      faceUpDefense?: boolean;
      suppressedCards?: string[];
      prediction?: number;
      ignoredValues?: ('attack' | 'defense')[];
      cardLockedValues?: ('attack' | 'defense')[];
    }
  | { kind: 'area'; actor: string; defeats: number; amount: number }
  | { kind: 'maneuver-boost'; actor: string; amount: number }
  | {
      kind: 'card';
      actor: string;
      card: Card;
      discarded: boolean;
      suppressAbilities?: boolean;
      returned?: boolean;
    }
  | { kind: 'turn'; actor: string }
  | { kind: 'elimination'; actor: string; target: string; source: string };
export interface CardProvenance {
  kind: 'card';
  card: string;
  combat?: number;
}
export type Frame = Operation & {
  cancelled?: boolean;
  hook?: Hook;
  turnStartRecorded?: boolean;
  combatRoot?: number;
  provenance?: CardProvenance;
};
export interface Binding {
  provenance?: CardProvenance;
  frame: number;
  owner: string;
  chosen?: string;
  selectedCard?: Card;
  chosenToken?: string;
  tokenChooser?: string;
}
export type Task = (
  | { type: 'select-deck'; player: string; group: number; selected?: string }
  | { type: 'begin-play' }
  | ({ type: 'activate-ongoing'; card: Card } & Binding)
  | ({
      type: 'search-selected';
      card: string;
      zone: 'deck' | 'discard';
      recycleOnDeck?: boolean;
    } & Binding)
  | ({
      type: 'token-place';
      token: string;
      position: string;
      setup?: boolean;
      placeSelf?: boolean;
    } & Binding)
  | ({ type: 'token-group'; remaining: string[]; effects: Effect[] } & Binding)
  | ({ type: 'token-setup'; remaining: string[] } & Binding)
  | ({ type: 'return-to-deck'; remaining: number; selected?: string; ordered: string[] } & Binding)
  | ({ type: 'select-attack' } & Binding)
  | ({ type: 'replace-attack'; card: string } & Binding)
  | ({ type: 'damage-result'; damage: number; effects: Effect[]; onDefeat?: Effect[] } & Binding)
  | ({ type: 'swap-apply'; frames: number[]; effects: Effect[] } & Binding)
  | ({ type: 'predict-value'; value: number } & Binding)
  | ({
      type: 'named-value-discard';
      target: string;
      value: number;
      discardAllowed?: boolean;
    } & Binding)
  | { type: 'bonus-combat'; attacker: string; defender: string; card: Card; bonus: BonusAttack }
  | ({
      type: 'recover-card';
      card: string;
      cards?: string[];
      destination?: 'hand' | 'deck';
    } & Binding)
  | ({ type: 'search-card'; card: string; zones: ('deck' | 'discard')[] } & Binding)
  | ({ type: 'inspect-take'; cards: string[]; remaining: number; selected?: string } & Binding)
  | ({ type: 'inspect-order'; cards: string[]; ordered: string[] } & Binding)
  | ({
      type: 'area-adjacent';
      effect: Extract<Effect, { type: 'area-damage' }>;
      space: string;
    } & Binding)
  | ({
      type: 'area-apply';
      effect: Extract<Effect, { type: 'area-damage' }>;
      spaces: string[];
    } & Binding)
  | ({ type: 'area-result'; area: number; effects: Effect[]; onDamage?: Effect[] } & Binding)
  | ({
      type: 'fighter-group';
      effect: Extract<Effect, { type: 'for-each-fighter' }>;
      remaining: string[];
    } & Binding)
  | ({
      type: 'revive-placement';
      fighter: string;
      anchor: PlayerRef;
    } & Binding)
  | ({
      type: 'revive';
      fighter: string;
      anchor: PlayerRef;
      position: string;
    } & Binding)
  | {
      type: 'operation';
      operation: Exclude<
        Operation,
        { kind: 'combat' | 'card' | 'turn' | 'elimination' | 'maneuver-boost' | 'area' }
      >;
    }
  | {
      type: 'discard-card';
      player: string;
      card: string;
      combat?: number;
      continuation?: { binding: Binding; effects: Effect[] };
      bonus?: { field: 'attack' | 'defense'; per: 'card' | 'boost' };
    }
  | {
      type: 'boost-attack';
      frame: number;
      owner: string;
      card: string;
      grant: string;
      cancelWithCard: boolean;
      field?: 'attack' | 'defense';
    }
  | { type: 'event'; frame: number; hook: Hook }
  | ({ type: 'ability'; ability: Ability; key: string; private?: boolean } & Binding)
  | ({ type: 'effect'; effect: Effect; discardAllowed?: boolean } & Binding)
  | { type: 'apply'; frame: number }
  | { type: 'release'; frame: number }
  | {
      type: 'flow';
      action:
        'start-game' | 'settle' | 'end-turn' | 'hand-limit' | 'advance-turn' | 'expire-statuses';
      player?: string;
    }
  | { type: 'wait'; phase: Exclude<Phase, { type: 'ability-choice' | 'finished' }> }
  | {
      type: 'combat-step';
      frame: number;
      step: 'commit' | 'defend' | 'reveal' | 'lifecycle' | 'damage' | 'finish';
    }
) & { provenance?: CardProvenance };
export type ChoiceObject =
  | { type: 'fighter'; id: string }
  | { type: 'space'; id: string }
  | { type: 'token'; id: string }
  | { type: 'pile'; player: string; zone: 'deck' | 'discard' };
export interface ChoiceSource {
  fighter?: string;
  card?: Card;
  name?: string;
  description?: string;
}
export interface ChoiceOption {
  id: string;
  label: string;
  card?: Card;
  object?: ChoiceObject;
  value?: number;
  decline?: boolean;
}
export interface PendingChoice {
  frame: number;
  id: string;
  player: string;
  prompt: string;
  public?: boolean;
  source?: ChoiceSource;
  options: ChoiceOption[];
  min: number;
  max: number;
  /** Private continuations are never projected to a client. */
  continuations: Record<string, Task[]>;
}
export interface ResolutionState {
  queue: Task[];
  frames: Record<number, Frame>;
  next: number;
  steps: number;
  combat: number | null;
  choice: PendingChoice | null;
  turn: number;
  turnPositions: Record<string, string | null>;
  turnTokens?: BoardToken[];
  removedUntilTurn?: string[];
  dormant?: string[];
  movementLocks?: string[];
  attacked?: string[];
  endTurnRequested?: boolean;
  random: number;
  uses: Record<string, { turn: number; count: number; total: number }>;
}
export const emptyResolution = (): ResolutionState => ({
  queue: [],
  frames: {},
  next: 0,
  steps: 0,
  combat: null,
  choice: null,
  turn: 0,
  turnPositions: {},
  random: 1,
  uses: {},
});
