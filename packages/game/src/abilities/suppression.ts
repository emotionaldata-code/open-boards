import { fighterById } from '../fighters';
import { publicBoosts } from './attack-boost';
import { modifyCombatValue } from './combat-values';
import type { Runtime } from './runtime';
import type { Binding, CardProvenance, Frame } from './state';

/** Provenance names a committed instance, never a design or fighter passive. */
export function cardProvenance(runtime: Runtime, frame: Frame, card: string): CardProvenance {
  const combatId = frame.kind === 'combat' ? runtime.data.combat : frame.combatRoot;
  const combat = combatId == null ? undefined : runtime.data.frames[combatId];
  return {
    kind: 'card',
    card,
    ...(combat?.kind === 'combat' && (combat.card.id === card || combat.defenseCard?.id === card)
      ? { combat: combatId! }
      : {}),
  };
}
export function suppressed(runtime: Runtime, provenance?: CardProvenance): boolean {
  if (provenance?.combat === undefined) return false;
  const combat = runtime.data.frames[provenance.combat];
  return combat?.kind === 'combat' && !!combat.suppressedCards?.includes(provenance.card);
}
export function suppressOpponent(runtime: Runtime, binding: Binding): void {
  const frame = runtime.data.frames[binding.frame];
  const combat = frame.kind === 'combat' ? frame : runtime.data.frames[frame.combatRoot!];
  if (combat?.kind !== 'combat') return;
  const card =
    binding.owner === combat.attacker
      ? combat.defenseCard
      : binding.owner === combat.defender
        ? combat.card
        : null;
  const recipient = fighterById(
    runtime.state,
    binding.owner === combat.attacker ? combat.defender : combat.attacker,
  );
  const protection = recipient && runtime.defs.characters[recipient.character].cardEffectProtection;
  if (card && runtime.defs.cards[card.definition].effectsCannotBeCancelled) return;
  if (card && protection?.tags.includes(runtime.defs.cards[card.definition].usableBy)) return;
  if (
    !card ||
    !pendingCardEffects(runtime, combat, card.id, card.definition) ||
    combat.suppressedCards?.includes(card.id)
  )
    return;
  (combat.suppressedCards ??= []).push(card.id);
  if (card.id === combat.card.id)
    for (const boost of combat.boosts)
      if (boost.cancelWithCard && !boost.cancelled) {
        boost.cancelled = true;
        modifyCombatValue(
          combat,
          'attack',
          -(boost.amount ?? runtime.defs.cards[boost.card.definition].boost),
        );
      }
  if (runtime.state.revealed) runtime.state.revealed.boosts = publicBoosts(runtime, combat);
}

/** Already resolved effects cannot be cancelled retroactively. */
function pendingCardEffects(
  runtime: Runtime,
  combat: Extract<Frame, { kind: 'combat' }>,
  card: string,
  definition: string,
): boolean {
  if (combat.bonus && combat.card.id === card)
    return (
      combat.bonus.combatValue !== undefined &&
      runtime.data.queue.some(
        (task) =>
          (task.type === 'event' &&
            task.hook === 'before-combat' &&
            runtime.data.frames[task.frame] === combat) ||
          (task.provenance?.card === card && ['ability', 'effect'].includes(task.type)),
      )
    );
  const abilities = runtime.defs.cards[definition].abilities ?? [];
  return runtime.data.queue.some((task) => {
    if (task.type === 'order-abilities')
      return task.abilities.some(
        (ability) => ability.provenance?.card === card && ability.ability.effects.length,
      );
    if (
      task.provenance?.card === card &&
      ['ability', 'effect', 'operation', 'apply'].includes(task.type)
    )
      return true;
    if (
      task.type === 'combat-step' &&
      task.step === 'lifecycle' &&
      runtime.data.frames[task.frame] === combat
    )
      return abilities.some(
        (a) => ['card-played', 'card-discarded'].includes(a.trigger) && a.effects.length,
      );
    if (task.type !== 'event') return false;
    const frame = runtime.data.frames[task.frame];
    if (frame?.kind === 'card')
      return (
        frame.card.id === card && abilities.some((a) => a.trigger === task.hook && a.effects.length)
      );
    if (frame !== combat) return false;
    return abilities.some(
      (a) =>
        a.effects.length &&
        a.trigger === task.hook &&
        (a.scope === 'any' ||
          ((!task.hook.includes('attack') || card === combat.card.id) &&
            (!task.hook.includes('defense') || card === combat.defenseCard?.id))),
    );
  });
}
