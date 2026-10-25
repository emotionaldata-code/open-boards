import { reference } from './conditions';
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
