import { fighterById, fighterLabel } from '../fighters';
import type { Fighter } from '../types';
import { adjacent } from '../movement';
import { sharesZone } from '../targeting';
import { openChoice } from './choices';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';

type Group = Extract<Effect, { type: 'for-each-fighter' }>;
function eligible(runtime: Runtime, binding: Binding, effect: Group, fighter: Fighter): boolean {
  const owner = fighterById(runtime.state, binding.owner)!;
  return (
    !fighter.defeated &&
    fighter.position !== null &&
    !runtime.state.players.find((p) => p.id === fighter.player)!.eliminated &&
    (!effect.role || effect.role === fighter.role) &&
    (!effect.range ||
      (effect.range === 'adjacent'
        ? adjacent(runtime.defs.map, owner.position, fighter.position)
        : sharesZone(runtime.defs.map, owner.position, fighter.position))) &&
    (effect.relation === 'any' ||
      (effect.relation === 'friendly'
        ? fighter.player === owner.player
        : fighter.player !== owner.player))
  );
}
export function startGroup(runtime: Runtime, binding: Binding, effect: Group): void {
  runtime.prepend({
    ...binding,
    type: 'fighter-group',
    effect,
    remaining: runtime.state.fighters
      .filter((f) => eligible(runtime, binding, effect, f))
      .map((f) => f.id),
  });
}
export function nextFighter(
  runtime: Runtime,
  task: Extract<Task, { type: 'fighter-group' }>,
): void {
  const owner = fighterById(runtime.state, task.owner)!;
  if (runtime.state.players.find((p) => p.id === owner.player)!.eliminated) return;
  const remaining = task.remaining.filter((id) => {
    const fighter = fighterById(runtime.state, id);
    return fighter && eligible(runtime, task, task.effect, fighter);
  });
  openChoice(
    runtime,
    task.frame,
    owner.player,
    'Choose the next fighter',
    remaining.map((id) => ({
      id,
      object: { type: 'fighter' as const, id },
      label: fighterLabel(fighterById(runtime.state, id)!, runtime.defs),
      tasks: [
        ...runtime.effects(task.effect.effects, { ...task, chosen: id }),
        { ...task, remaining: remaining.filter((other) => other !== id) },
      ],
    })),
    1,
    1,
    task.provenance,
    { fighter: task.owner },
  );
}
