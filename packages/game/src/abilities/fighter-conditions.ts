import type { Definitions, Fighter, GameState } from '../types';
import type { FighterCondition } from './vocabulary';

export function fighterCondition(
  state: Pick<GameState, 'fighters'>,
  owner: Pick<Fighter, 'player'>,
  rule: FighterCondition,
): boolean {
  switch (rule.type) {
    case 'allies-defeated': {
      const allies = state.fighters.filter((f) => f.player === owner.player && f.role === 'ally');
      return allies.length > 0 && allies.every((f) => f.defeated);
    }
  }
}

/** Continuous bonuses read live fighter state, including sacrifices and revivals during combat. */
export function conditionalModifier(
  state: Pick<GameState, 'fighters'>,
  fighter: Pick<Fighter, 'player' | 'character'>,
  field: 'attack' | 'defense' | 'movement',
  defs: Definitions,
): number {
  return (defs.characters[fighter.character].conditionalModifiers ?? []).reduce(
    (sum, rule) => sum + (fighterCondition(state, fighter, rule.when) ? (rule[field] ?? 0) : 0),
    0,
  );
}
