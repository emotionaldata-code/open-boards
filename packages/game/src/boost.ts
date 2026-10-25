import { requireRule } from './errors';
import { fighterById } from './fighters';
import type { Card, Definitions, Fighter, GameState, Player } from './types';
import { movement } from './abilities/conditions';
import type { Runtime } from './abilities/runtime';

/** Boost payment ignores play eligibility and never executes the payment card. */
export function payBoost(player: Player, id: string, defs: Definitions) {
  const index = player.hand.findIndex((card) => card.id === id);
  requireRule(index >= 0, 'Choose a boost card from your hand.');
  const card = player.hand.splice(index, 1)[0];
  return { card, amount: defs.cards[card.definition].boost };
}

export function revealBoost(
  runtime: Runtime,
  fighter: string,
  card: Card,
  purpose: 'maneuver' | 'attack',
  hooks = true,
  cancelled = false,
): void {
  const player = fighterById(runtime.state, fighter)!.player;
  runtime.state.players.find((p) => p.id === player)!.discard.push(card);
  runtime.emit({
    type: 'boost',
    player,
    fighter,
    card,
    amount: cancelled ? 0 : runtime.defs.cards[card.definition].boost,
    purpose,
    ...(cancelled ? { cancelled: true } : {}),
  });
  if (hooks) runtime.cardEvents(fighter, card, true, true);
}

/** Shared by authoritative path validation and client highlights. Effect moves use their own distance. */
export function maneuverMovement(
  state: Pick<GameState, 'maneuver'>,
  fighter: Fighter,
  defs: Definitions,
): number {
  return (
    movement(fighter, defs) + (state.maneuver?.player === fighter.player ? state.maneuver.boost : 0)
  );
}
