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
  const chooser = effect.chooser
    ? reference(runtime.state, binding, effect.chooser)?.player
    : playerId;
  if (!chooser) return;
  if (effect.optional) {
    if (player.hand.length < effect.count) return;
    openChoice(
      runtime,
      binding.frame,
      chooser,
      `Discard ${effect.count} cards?`,
      [
        {
          id: 'pay',
          label: `Discard ${effect.count} cards`,
          tasks: runtime.effects([{ ...effect, optional: false }], binding),
        },
        { id: '$decline', label: 'Decline discard', decline: true, tasks: [] },
      ],
      1,
      1,
      binding.provenance,
      { fighter: binding.owner },
    );
    return;
  }
  if (effect.onComplete && player.hand.length < effect.count) return;
  const payment = effect.onComplete ? ++runtime.data.next : undefined;
  if (payment !== undefined) {
    (runtime.data.discardPayments ??= {})[payment] = 0;
    runtime.prepend({
      ...binding,
      type: 'complete-payment',
      payment,
      count: effect.count,
      effects: effect.onComplete!,
    });
  }
  if (effect.onDecline) {
    if (!player.hand.length) {
      runtime.prepend(...runtime.effects(effect.onDecline, binding));
      return;
    }
    openChoice(
      runtime,
      binding.frame,
      chooser,
      'Discard 1 card or decline',
      [
        ...player.hand.map((card) => ({
          id: card.id,
          label: runtime.defs.cards[card.definition].name,
          card: { ...card },
          tasks: [
            {
              type: 'discard-card' as const,
              player: playerId,
              card: card.id,
              combat: binding.frame,
              bonus: effect.combatBonus,
              provenance: binding.provenance,
              continuation: effect.onDiscard ? { binding, effects: effect.onDiscard } : undefined,
            },
          ],
        })),
        {
          id: '$decline',
          decline: true,
          label: 'Decline discard',
          tasks: runtime.effects(effect.onDecline, binding),
        },
      ],
      1,
      1,
      binding.provenance,
      { fighter: binding.owner },
    );
    return;
  }
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
        provenance: binding.provenance,
        continuation: effect.onDiscard ? { binding, effects: effect.onDiscard } : undefined,
      })),
    );
    return;
  }
  const count = Math.min(effect.count, player.hand.length);
  openChoice(
    runtime,
    binding.frame,
    chooser,
    `Discard ${effect.upTo ? 'up to ' : ''}${count} card${count === 1 ? '' : 's'}${chooser === playerId ? '' : ` from ${player.name}’s hand`}`,
    player.hand.map((card) => ({
      id: card.id,
      label: runtime.defs.cards[card.definition].name,
      card: { ...card },
      tasks: [
        {
          type: 'discard-card',
          payment,
          player: playerId,
          card: card.id,
          combat: binding.frame,
          bonus: effect.combatBonus,
          provenance: binding.provenance,
          continuation: effect.onDiscard ? { binding, effects: effect.onDiscard } : undefined,
        },
      ],
    })),
    effect.upTo ? 0 : count,
    count,
    binding.provenance,
    { fighter: binding.owner },
  );
}
