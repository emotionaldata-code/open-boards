import { fighterById } from '../fighters';
import { adjacent } from '../movement';
import { sharesZone } from '../targeting';
import { openChoice } from './choices';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';

type AreaEffect = Extract<Effect, { type: 'area-damage' }>;

export function chooseArea(runtime: Runtime, binding: Binding, effect: AreaEffect): void {
  const owner = fighterById(runtime.state, binding.owner)!;
  if (owner.defeated || owner.position === null) return;
  if (effect.range === 'adjacent') {
    damageArea(runtime, {
      ...binding,
      type: 'area-apply',
      effect,
      spaces: runtime.defs.map.nodes.filter((n) => adjacent(runtime.defs.map, owner.position, n)),
    });
    return;
  }
  openChoice(
    runtime,
    binding.frame,
    owner.player,
    'Choose the first space',
    runtime.defs.map.nodes
      .filter((n) => effect.range === 'any' || sharesZone(runtime.defs.map, owner.position, n))
      .map((space) => ({
        id: space,
        label: `Space ${runtime.defs.map.nodes.indexOf(space) + 1}`,
        tasks: [{ ...binding, type: 'area-adjacent', effect, space }],
      })),
    1,
    1,
    binding.provenance,
  );
}

export function chooseAdjacent(
  runtime: Runtime,
  task: Extract<Task, { type: 'area-adjacent' }>,
): void {
  const owner = fighterById(runtime.state, task.owner)!;
  const neighbors = task.effect.adjacent
    ? runtime.defs.map.nodes.filter((n) => adjacent(runtime.defs.map, task.space, n))
    : [];
  if (!neighbors.length) {
    runtime.prepend({ ...task, type: 'area-apply', spaces: [task.space] });
    return;
  }
  openChoice(
    runtime,
    task.frame,
    owner.player,
    'Choose an adjacent space',
    neighbors.map((space) => ({
      id: space,
      label: `Space ${runtime.defs.map.nodes.indexOf(space) + 1}`,
      tasks: [{ ...task, type: 'area-apply', spaces: [task.space, space] }],
    })),
    1,
    1,
    task.provenance,
  );
}

export function damageArea(runtime: Runtime, task: Extract<Task, { type: 'area-apply' }>): void {
  const owner = fighterById(runtime.state, task.owner)!;
  if (runtime.state.players.find((p) => p.id === owner.player)!.eliminated) return;
  const area = runtime.frame({ kind: 'area', actor: owner.id, defeats: 0, amount: 0 });
  const targets = runtime.state.fighters.filter(
    (f) =>
      !f.defeated &&
      f.position !== null &&
      task.spaces.includes(f.position) &&
      (task.effect.relation === 'any' ||
        (task.effect.relation === 'friendly'
          ? f.player === owner.player
          : f.player !== owner.player)),
  );
  runtime.prepend(
    ...targets.map((f): Task => ({
      type: 'operation',
      provenance: task.provenance,
      operation: {
        kind: 'damage',
        actor: owner.id,
        target: f.id,
        amount: task.effect.amount,
        reason: 'ability',
        area,
      },
    })),
    {
      ...task,
      type: 'area-result',
      area,
      effects: task.effect.onDefeat ?? [],
      onDamage: task.effect.onDamage,
    },
    { type: 'release', frame: area },
  );
}

export function areaResult(runtime: Runtime, task: Extract<Task, { type: 'area-result' }>): void {
  const area = runtime.data.frames[task.area];
  if (area?.kind === 'area' && area.defeats > 0)
    runtime.prepend(...runtime.effects(task.effects, task));
  if (area?.kind === 'area' && area.amount > 0)
    runtime.prepend(...runtime.effects(task.onDamage ?? [], { ...task, frame: task.area }));
}
