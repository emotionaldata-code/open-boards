/** Serializable character-authoring vocabulary. No callbacks or executable content. */
export const hooks = [
  'game-start',
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
  'after-action',
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
  | 'opponent-main'
  | 'chosen'
  | 'main'
  | 'ally';
export type Value =
  | number
  | {
      fighters: 'friendly' | 'enemy' | 'any';
      role?: 'main' | 'ally';
      range?: 'adjacent' | 'zone';
      anchor?: PlayerRef;
      exclude?: PlayerRef;
    }
  | { stat: 'hp' | 'hand' | 'deck' | 'movement'; of?: PlayerRef }
  | { stat: 'discard'; tag?: string; of?: PlayerRef }
  | { stat: 'counter'; name: string; of?: PlayerRef }
  | { stat: 'actions' }
  | { event: 'amount' | 'attack' | 'defense' | 'distance' }
  | { card: 'played' | 'attack' | 'defense' | 'opposing' | 'selected'; field: 'value' | 'boost' };
export type FighterCondition = { type: 'allies-defeated' };
export type Condition =
  | FighterCondition
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
  | { type: 'fighter-role'; target?: PlayerRef; role: 'main' | 'ally' }
  | { type: 'card-has-hook'; card: 'opposing'; hook: Hook }
  | {
      type: 'card-category';
      card: 'played' | 'attack' | 'defense';
      category: 'attack' | 'defense' | 'versatile' | 'action';
    }
  | { type: 'combat-result'; result: 'won' | 'lost' | 'blocked' }
  | { type: 'prediction-matches' }
  | { type: 'defeated'; target?: PlayerRef }
  | { type: 'on-token'; token: string; target?: PlayerRef; atTurnStart?: boolean }
  | { type: 'maneuvered'; target?: PlayerRef }
  | { type: 'changed-position'; target?: PlayerRef }
  | { type: 'has-status'; player?: PlayerRef; status: string };
export type Effect =
  | { type: 'reveal-boost-draw' }
  | { type: 'return-combat-card' }
  | { type: 'discard-deck'; target?: PlayerRef; count: number; onDiscard?: Effect[] }
  | {
      type: 'choose-token';
      token: string;
      at?: PlayerRef;
      excludeChosen?: boolean;
      chooser?: PlayerRef;
      effects: Effect[];
    }
  | { type: 'for-each-token'; token: string; effects: Effect[] }
  | {
      type: 'move-token';
      distance?: number;
      empty?: boolean;
      optional?: boolean;
      placeSelf?: boolean;
    }
  | {
      type: 'return-to-deck';
      count: number;
      target?: PlayerRef;
      random?: boolean;
      chooser?: PlayerRef;
      destination?: 'top' | 'bottom';
    }
  | { type: 'defeat'; target: PlayerRef; onDefeat?: Effect[] }
  | { type: 'remove-until-next-turn'; target?: PlayerRef }
  | { type: 'lock-card-value'; target?: PlayerRef; value: Value }
  | { type: 'end-turn' }
  | { type: 'boost-combat'; target?: PlayerRef; grant?: string }
  | { type: 'lock-movement'; target?: PlayerRef }
  | { type: 'search-cards'; cards: string[]; recycleOnDeck?: boolean }
  | { type: 'replace-attack' }
  | { type: 'bonus-attack'; name: string; value: number }
  | { type: 'replace-defender'; target: PlayerRef }
  | {
      type: 'recover-card';
      cards?: string[];
      tag?: string;
      all?: boolean;
      destination?: 'hand' | 'deck';
    }
  | { type: 'return-played-card' }
  | { type: 'boost-attack'; grant?: string; cancelWithCard?: boolean }
  | { type: 'set-health'; target?: PlayerRef; value: number }
  | { type: 'prevent-damage'; target?: PlayerRef }
  | { type: 'search-card'; card: string; zones: ('deck' | 'discard')[] }
  | { type: 'inspect-deck'; count: number; take: number }
  | {
      type: 'area-damage';
      range: 'zone' | 'any' | 'adjacent' | 'own-zone' | 'adjacent-to-friendly';
      adjacent?: boolean;
      relation: 'friendly' | 'enemy' | 'any';
      amount: number;
      onDefeat?: Effect[];
      onDamage?: Effect[];
    }
  | { type: 'suppress-card-effects' }
  | { type: 'predict-value' }
  | { type: 'ignore-combat-value'; target?: PlayerRef }
  | { type: 'reveal-hand'; target?: PlayerRef; count: number; discard: number }
  | { type: 'draw-to'; target?: PlayerRef; count: number }
  | { type: 'inspect-hand'; target?: PlayerRef; public?: boolean }
  | { type: 'named-value-discard'; target?: PlayerRef }
  | { type: 'swap'; target: PlayerRef; onSuccess?: Effect[] }
  | { type: 'summon-ally'; placement: 'adjacent' | 'replace-self'; damage?: number }
  | { type: 'redirect-combat-damage'; target: PlayerRef }
  | { type: 'revive-ally'; optional?: boolean; anchor?: PlayerRef; zone?: 'any' }
  | {
      type: 'for-each-fighter';
      relation: 'friendly' | 'enemy' | 'any';
      role?: 'main' | 'ally';
      range?: 'adjacent' | 'zone';
      effects: Effect[];
    }
  | { type: 'draw'; target?: PlayerRef; count: Value }
  | { type: 'damage'; target?: PlayerRef; amount: Value; onDamage?: Effect[]; onDefeat?: Effect[] }
  | { type: 'heal'; target?: PlayerRef; amount: Value }
  | { type: 'move'; target?: PlayerRef; distance: number; throughEnemies?: boolean }
  | { type: 'push' | 'pull'; target?: PlayerRef; distance: number }
  | {
      type: 'teleport';
      target?: PlayerRef;
      zone?: 'any' | 'shared';
      anchor?: PlayerRef;
      range?: 'adjacent';
      optional?: boolean;
      allowDefeatedAnchor?: boolean;
      includeOrigin?: boolean;
      token?: string;
      starting?: boolean;
    }
  | {
      type: 'discard';
      target?: PlayerRef;
      chooser?: PlayerRef;
      random?: boolean;
      count: number;
      upTo?: boolean;
      onDiscard?: Effect[];
      combatBonus?: { field: 'attack' | 'defense'; per: 'card' | 'boost' };
      onDecline?: Effect[];
      /** All-or-nothing optional payment, with one continuation after the full payment. */
      optional?: boolean;
      onComplete?: Effect[];
    }
  | { type: 'actions'; target?: PlayerRef; amount: number }
  | { type: 'counter'; name: string; amount: number }
  | { type: 'status'; target?: PlayerRef; status: string; stacks?: number; turns?: number }
  | { type: 'remove-status'; target?: PlayerRef; status: string }
  | { type: 'modify'; field: 'amount' | 'attack' | 'defense'; amount: Value }
  | { type: 'set-combat-value'; target?: PlayerRef; value: Value; mode?: 'printed' | 'total' }
  | { type: 'cancel' }
  | { type: 'if'; condition: Condition; then: Effect[]; else?: Effect[] }
  | {
      type: 'choose-fighter';
      relation: 'friendly' | 'enemy' | 'any';
      role?: 'main' | 'ally';
      range?: 'any' | 'adjacent' | 'zone' | 'attack-range' | 'combat';
      effects: Effect[];
    }
  | {
      type: 'choose-player';
      relation: 'opponent' | 'any' | 'self';
      range?: 'any' | 'adjacent' | 'zone' | 'attack-range' | 'combat';
      effects: Effect[];
    }
  | {
      type: 'choose-option';
      chooser?: PlayerRef;
      count?: number;
      prompt: string;
      options: {
        id: string;
        label: string;
        target?: PlayerRef;
        decline?: boolean;
        effects: Effect[];
      }[];
    };
export interface Ability {
  id: string;
  name: string;
  description: string;
  trigger: Hook;
  /** Defaults to events concerning this owner. 'any' observes every player's events. */
  scope?: 'self' | 'any';
  /** Resolve this immediate passive in the owner's chosen order with their card. */
  orderWithCard?: boolean;
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
