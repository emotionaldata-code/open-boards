import type { CardDefinition, Definitions, Fighter, GameState } from './types';
import { cardEligible } from './fighters';
import { canAttack } from './targeting';
import { fighterCondition } from './abilities/fighter-conditions';

export function attackModeAvailable(
  state: Pick<GameState, 'fighters'>,
  fighter: Fighter,
  card: CardDefinition,
): boolean {
  return !!card.attackMode && fighterCondition(state, fighter, card.attackMode.when);
}

export function canPlayAttack(
  state: Pick<GameState, 'fighters'>,
  fighter: Fighter,
  card: CardDefinition,
): boolean {
  return (
    cardEligible(card, fighter) &&
    (card.category === 'attack' ||
      card.category === 'versatile' ||
      (card.category === 'defense' && attackModeAvailable(state, fighter, card)))
  );
}

export function canAttackWithCard(
  state: Pick<GameState, 'fighters'>,
  attacker: Fighter,
  defender: Fighter,
  card: CardDefinition,
  defs: Definitions,
  faceUp = false,
): boolean {
  if (!canPlayAttack(state, attacker, card)) return false;
  const alternate = attackModeAvailable(state, attacker, card);
  if (faceUp && (!alternate || !card.attackMode?.faceUp)) return false;
  if (alternate && card.attackMode?.range === 'any' && (!card.attackMode.faceUp || faceUp))
    return (
      attacker.player !== defender.player &&
      !attacker.defeated &&
      !defender.defeated &&
      attacker.position !== null &&
      defender.position !== null &&
      defs.map.nodes.includes(attacker.position) &&
      defs.map.nodes.includes(defender.position)
    );
  return canAttack(attacker, defender, defs);
}
