import { requireRule } from './errors';
import { fighterById } from './fighters';
import type { Card, Definitions, Fighter, GameState, Player } from './types';
import { movement } from './abilities/conditions';
import type { Runtime } from './abilities/runtime';

/** Effective BOOST belongs to the card owner, including references outside payment. */
export function boostValue(
  player: Pick<Player, 'ongoing' | 'eliminated'>,
  card: Card,
  defs: Definitions,
): number {
  return (
    defs.cards[card.definition].boost +
    (player.eliminated
      ? 0
      : (player.ongoing ?? []).reduce(
          (n, c) => n + (defs.cards[c.definition].ongoing?.boostBonus ?? 0),
          0,
        ))
  );
}

/** Boost payment ignores play eligibility and never executes the payment card. */
export function payBoost(player: Player, id: string, defs: Definitions) {
  const index = player.hand.findIndex((card) => card.id === id);
  requireRule(index >= 0, 'Choose a boost card from your hand.');
  const card = player.hand.splice(index, 1)[0];
  return { card, amount: boostValue(player, card, defs) };
}

export function revealBoost(
  runtime: Runtime,
  fighter: string,
  card: Card,
  purpose: 'maneuver' | 'attack' | 'defense',
  hooks = true,
  cancelled = false,
  amount?: number,
): void {
  const player = fighterById(runtime.state, fighter)!.player;
  runtime.state.players.find((p) => p.id === player)!.discard.push(card);
  runtime.emit({
    type: 'boost',
    player,
    fighter,
    card,
    amount: cancelled
      ? 0
      : (amount ??
        boostValue(
          runtime.state.players.find((p) => p.id === player)!,
          card,
          runtime.defs,
        )),
    purpose,
    ...(cancelled ? { cancelled: true } : {}),
  });
  if (hooks) {
    runtime.cardEvents(fighter, card, true, true);
    const effects = runtime.defs.cards[card.definition].boostEffects;
    if (effects?.length) {
      const frame = runtime.frame({
        kind: 'card',
        actor: fighter,
        card,
        discarded: true,
        suppressAbilities: true,
      });
      runtime.prepend(...runtime.effects(effects, { frame, owner: fighter }), {
        type: 'release',
        frame,
      });
    }
  }
}

/** Shared by authoritative path validation and client highlights. Effect moves use their own distance. */
export function maneuverMovement(
  state: Pick<GameState, 'maneuver' | 'fighters'> & {
    players: Pick<Player, 'id' | 'ongoing' | 'discard'>[];
  },
  fighter: Fighter,
  defs: Definitions,
): number {
  return (
    movement(fighter, defs, state) +
    (state.maneuver?.player === fighter.player ? state.maneuver.boost : 0)
  );
}
