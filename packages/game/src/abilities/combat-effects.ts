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
