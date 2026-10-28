import { fighterById } from '../fighters';
import { condition } from './conditions';
import { openChoice } from './choices';
import { suppressed } from './suppression';
import type { Runtime } from './runtime';
import type { Task } from './state';

/** An immediate passive may share its owner's priority with their card effects. */
export function orderAbilities(
  runtime: Runtime,
  task: Extract<Task, { type: 'order-abilities' }>,
): void {
  const frame = runtime.data.frames[task.frame];
  const abilities = task.abilities.filter(
    (t) =>
      (!t.provenance ||
        frame.kind !== 'combat' ||
        [frame.card.id, frame.defenseCard?.id].includes(t.provenance.card)) &&
      !suppressed(runtime, t.provenance) &&
      (!t.ability.when || condition(runtime.state, runtime.defs, t, t.ability.when)),
  );
  if (abilities.length < 2) {
    runtime.prepend(...abilities);
    return;
  }
  openChoice(
    runtime,
    task.frame,
    fighterById(runtime.state, task.owner)!.player,
    'Choose the next immediate effect',
    abilities.map((ability, i) => ({
      id: String(i),
      label: ability.ability.name,
      tasks: [ability, { ...task, abilities: abilities.filter((t) => t !== ability) }],
    })),
    1,
    1,
    undefined,
    { fighter: task.owner },
  );
}
