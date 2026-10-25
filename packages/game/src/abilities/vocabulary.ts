/** Serializable character-authoring vocabulary. No callbacks or executable content. */
export const hooks = [
  'turn-start',
  'turn-end',
  'before-draw',
  'after-draw',
  'maneuver-boosted',
  'before-move',
  'after-move',
  'before-attack',
  'after-attack',
  'before-defense',
  'after-defense',
  'combat-reveal',
  'before-combat',
  'after-combat',
  'before-damage',
  'after-damage',
  'before-heal',
  'after-heal',
  'card-played',
  'card-discarded',
  'eliminated',
] as const;
export type Hook = (typeof hooks)[number];
export type PlayerRef =
  | 'self'
  | 'source'
  | 'actor'
  | 'target'
  | 'attacker'
  | 'defender'
  | 'opponent'
  | 'chosen'
  | 'main'
  | 'ally';
export type Value =
  | number
  | { stat: 'hp' | 'hand' | 'deck' | 'movement'; of?: PlayerRef }
  | { stat: 'counter'; name: string; of?: PlayerRef }
  | { stat: 'actions' }
  | { event: 'amount' | 'attack' | 'defense' | 'distance' }
  | { card: 'played' | 'attack' | 'defense' | 'opposing'; field: 'value' | 'boost' };
export type Condition =
  | { type: 'all' | 'any'; conditions: Condition[] }
  | { type: 'not'; condition: Condition }
  | { type: 'compare'; left: Value; op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'; right: Value }
  | {
      type: 'relation';
      relation: 'same' | 'friendly' | 'enemy' | 'adjacent' | 'zone' | 'attack-range';
      a: PlayerRef;
      b: PlayerRef;
    }
  | { type: 'role'; role: 'actor' | 'target' | 'attacker' | 'defender' }
  | {
      type: 'card-category';
      card: 'played' | 'attack' | 'defense';
      category: 'attack' | 'defense' | 'versatile' | 'action';
    }
  | { type: 'combat-result'; result: 'won' | 'lost' | 'blocked' }
  | { type: 'prediction-matches' }
  | { type: 'defeated'; target?: PlayerRef }
  | { type: 'changed-position'; target?: PlayerRef }
  | { type: 'has-status'; player?: PlayerRef; status: string };
export type Effect =
  | { type: 'bonus-attack'; name: string; value: number }
  | { type: 'replace-defender'; target: PlayerRef }
  | { type: 'recover-card' }
  | { type: 'boost-attack'; grant?: string; cancelWithCard?: boolean }
  | { type: 'set-health'; target?: PlayerRef; value: number }
  | { type: 'prevent-damage'; target?: PlayerRef }
  | { type: 'search-card'; card: string; zones: ('deck' | 'discard')[] }
  | { type: 'inspect-deck'; count: number; take: number }
  | {
      type: 'area-damage';
      range: 'zone' | 'any';
      adjacent?: boolean;
      relation: 'friendly' | 'enemy' | 'any';
      amount: number;
      onDefeat?: Effect[];
    }
  | { type: 'suppress-card-effects' }
  | { type: 'predict-value' }
  | { type: 'ignore-combat-value'; target?: PlayerRef }
  | { type: 'inspect-hand'; target?: PlayerRef; public?: boolean }
  | { type: 'named-value-discard'; target?: PlayerRef }
  | { type: 'swap'; target: PlayerRef; onSuccess?: Effect[] }
  | { type: 'revive-ally'; optional?: boolean; anchor?: PlayerRef }
  | {
      type: 'for-each-fighter';
      relation: 'friendly' | 'enemy' | 'any';
      role?: 'main' | 'ally';
      range?: 'adjacent' | 'zone';
      effects: Effect[];
    }
  | { type: 'draw'; target?: PlayerRef; count: Value }
  | { type: 'damage' | 'heal'; target?: PlayerRef; amount: number }
  | { type: 'move'; target?: PlayerRef; distance: number; throughEnemies?: boolean }
  | { type: 'push' | 'pull'; target?: PlayerRef; distance: number }
  | {
      type: 'teleport';
      target?: PlayerRef;
      zone?: 'any' | 'shared';
      anchor?: PlayerRef;
      range?: 'adjacent';
      optional?: boolean;
    }
  | { type: 'discard'; target?: PlayerRef; chooser?: PlayerRef; random?: boolean; count: number }
  | { type: 'actions'; target?: PlayerRef; amount: number }
  | { type: 'counter'; name: string; amount: number }
  | { type: 'status'; target?: PlayerRef; status: string; stacks?: number; turns?: number }
  | { type: 'remove-status'; target?: PlayerRef; status: string }
  | { type: 'modify'; field: 'amount' | 'attack' | 'defense'; amount: number }
  | { type: 'set-combat-value'; target?: PlayerRef; value: Value; mode?: 'printed' | 'total' }
  | { type: 'cancel' }
  | { type: 'if'; condition: Condition; then: Effect[]; else?: Effect[] }
  | {
      type: 'choose-fighter';
      relation: 'friendly' | 'enemy' | 'any';
      range?: 'any' | 'adjacent' | 'zone' | 'attack-range';
      effects: Effect[];
    }
  | {
      type: 'choose-player';
      relation: 'opponent' | 'any' | 'self';
      range?: 'any' | 'adjacent' | 'zone' | 'attack-range';
      effects: Effect[];
    }
  | {
      type: 'choose-option';
      prompt: string;
      options: { id: string; label: string; effects: Effect[] }[];
    };
export interface Ability {
  id: string;
  name: string;
  description: string;
  trigger: Hook;
  /** Defaults to events concerning this owner. 'any' observes every player's events. */
  scope?: 'self' | 'any';
  when?: Condition;
  optional?: boolean;
  limit?: { scope: 'turn' | 'match'; count: number };
  effects: Effect[];
}
export interface StatusDefinition {
  id: string;
  name: string;
  maxStacks: number;
  modifiers?: { attack?: number; defense?: number; movement?: number };
  combatValue?: { value: number; locked?: boolean };
  abilities?: Ability[];
}
export interface ActiveStatus {
  id: string;
  stacks: number;
  turns?: number;
}
export interface CounterDefinition {
  initial: number;
  max: number;
}
