import { applyCombatValues } from './combat-values';
import { modifier, reference } from './conditions';
import type { Runtime } from './runtime';
import type { Task } from './state';

export function applyCombatEffect(runtime: Runtime, task: Extract<Task, { type: 'effect' }>): void {
  const frame = runtime.data.frames[task.frame];
  if (frame.kind !== 'combat') return;
  const effect = task.effect;
  if (effect.type === 'prevent-damage') {
    const target = reference(runtime.state, task, effect.target);
    if (target && !target.defeated) (frame.protectedFighters ??= []).push(target.id);
  }
}

export function setHealth(runtime: Runtime, task: Extract<Task, { type: 'effect' }>): void {
  if (task.effect.type !== 'set-health') return;
  const target = reference(runtime.state, task, task.effect.target);
  if (
    !target ||
    target.defeated ||
    runtime.state.players.find((p) => p.id === target.player)!.eliminated
  )
    return;
  const definition = runtime.defs.characters[target.character];
  const maximum = target.role === 'main' ? definition.hp : definition.ally!.hp;
  const hp = Math.min(maximum, task.effect.value);
  const amount = hp - target.hp;
  target.hp = hp;
  const frame = runtime.data.frames[task.frame];
  if (hp > 0 && frame?.kind === 'combat' && frame.lethalFighters?.includes(target.id))
    (frame.detachedFighters ??= []).push(target.id);
  if (amount >= 0) runtime.emit({ type: 'heal', fighter: target.id, amount });
  else runtime.emit({ type: 'damage', fighter: target.id, amount: -amount, reason: 'ability' });
}

/** The existing commitment now defends the replacement; its owner and instance stay unchanged. */
export function replaceDefender(runtime: Runtime, task: Extract<Task, { type: 'effect' }>): void {
  if (task.effect.type !== 'replace-defender') return;
  const frame = runtime.data.frames[task.frame];
  const from = reference(runtime.state, task);
  const to = reference(runtime.state, task, task.effect.target);
  if (
    frame.kind !== 'combat' ||
    frame.hook !== 'combat-reveal' ||
    from?.id !== frame.defender ||
    !to ||
    to.id === from.id ||
    to.player !== from.player ||
    from.defeated ||
    to.defeated ||
    from.position === null ||
    to.position === null
  )
    return;
  frame.defender = to.id;
  frame.target = to.id;
  frame.defense =
    frame.defenseCard && !frame.defenseCancelled
      ? Math.max(
          0,
          runtime.defs.cards[frame.defenseCard.definition].value +
            modifier(to, 'defense', runtime.defs),
        )
      : 0;
  if (frame.lockedValues) delete frame.lockedValues.defense;
  applyCombatValues(runtime, frame, ['defense']);
  if (runtime.state.revealed) runtime.state.revealed.defender = to.id;
}

/** Transfer the revealed commitment to the other owned fighter in either combat role. */
export function replaceCombatant(runtime: Runtime, task: Extract<Task, { type: 'effect' }>): void {
  if (task.effect.type !== 'replace-combatant') return;
  const frame = runtime.data.frames[task.frame];
  const from = reference(runtime.state, task);
  const to = reference(runtime.state, task, task.effect.target);
  if (
    frame.kind !== 'combat' ||
    frame.hook !== 'combat-reveal' ||
    !from ||
    !to ||
    from.id === to.id ||
    from.player !== to.player ||
    from.defeated ||
    to.defeated ||
    from.position === null ||
    to.position === null
  )
    return;
  const field =
    from.id === frame.attacker ? 'attack' : from.id === frame.defender ? 'defense' : undefined;
  if (!field) return;
  const card = field === 'attack' ? frame.card : frame.defenseCard;
  const previous = frame[field];
  if (field === 'attack') {
    frame.attacker = to.id;
    frame.actor = to.id;
  } else {
    frame.defender = to.id;
    frame.target = to.id;
  }
  for (const boost of frame.boosts)
    if ((boost.fighter ?? from.id) === from.id && (boost.field ?? 'attack') === field)
      boost.fighter = to.id;
  const paid = frame.boosts
    .filter((b) => (b.field ?? 'attack') === field && !b.cancelled)
    .reduce((sum, b) => sum + (b.amount ?? runtime.defs.cards[b.card.definition].boost), 0);
  frame[field] = frame.ignoredValues?.includes(field)
    ? 0
    : frame.cardLockedValues?.includes(field)
      ? previous
      : card
        ? Math.max(
            0,
            runtime.defs.cards[card.definition].value + modifier(to, field, runtime.defs) + paid,
          )
        : 0;
  if (frame.lockedValues) delete frame.lockedValues[field];
  applyCombatValues(runtime, frame, [field]);
  for (const queued of runtime.data.queue)
    if (
      card &&
      'owner' in queued &&
      queued.owner === from.id &&
      queued.provenance?.card === card.id
    )
      queued.owner = to.id;
  if (runtime.state.revealed) {
    if (field === 'attack') runtime.state.revealed.attacker = to.id;
    else runtime.state.revealed.defender = to.id;
  }
}
