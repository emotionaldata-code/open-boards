import { randomIndex } from './deck';
import { openChoice } from './choices';
import { reference } from './conditions';
import type { Runtime } from './runtime';
import type { Binding } from './state';
import type { Effect } from './vocabulary';

/** The affected owner and the private chooser may differ; continuations retain exact instances. */
export function offerDiscard(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'discard' }>,
  playerId: string,
): void {
  const player = runtime.state.players.find((p) => p.id === playerId)!;
  if (effect.random) {
    const remaining = [...player.hand];
    const cards = Array.from(
      { length: Math.min(effect.count, remaining.length) },
      () => remaining.splice(randomIndex(runtime, remaining.length), 1)[0],
    );
    runtime.prepend(
      ...cards.map((card) => ({
        type: 'discard-card' as const,
        player: playerId,
        card: card.id,
        combat: binding.frame,
        bonus: effect.combatBonus,
      })),
    );
    return;
  }
  const chooser = effect.chooser
    ? reference(runtime.state, binding, effect.chooser)?.player
    : playerId;
  if (!chooser) return;
  const count = Math.min(effect.count, player.hand.length);
  openChoice(
    runtime,
    binding.frame,
    chooser,
    `Discard ${effect.upTo ? 'up to ' : ''}${count} card${count === 1 ? '' : 's'}${chooser === playerId ? '' : ` from ${player.name}’s hand`}`,
    player.hand.map((card) => ({
      id: card.id,
      label: runtime.defs.cards[card.definition].name,
      ...(chooser !== playerId ? { card: { ...card } } : {}),
      tasks: [
        {
          type: 'discard-card',
          player: playerId,
          card: card.id,
          combat: binding.frame,
          bonus: effect.combatBonus,
        },
      ],
    })),
    effect.upTo ? 0 : count,
    count,
    binding.provenance,
  );
}
