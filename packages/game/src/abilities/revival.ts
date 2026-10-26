import { fighterById, fighterDefinition, fighterLabel } from '../fighters';
import { emptyEndpoint } from '../movement';
import { sharesZone } from '../targeting';
import { openChoice } from './choices';
import { reference } from './conditions';
import type { Runtime } from './runtime';
import type { Binding, Task, ChoiceOption } from './state';
import type { Effect, PlayerRef } from './vocabulary';

function candidates(runtime: Runtime, binding: Binding) {
  const owner = fighterById(runtime.state, binding.owner)!;
  if (runtime.state.players.find((p) => p.id === owner.player)!.eliminated) return [];
  return runtime.state.fighters.filter(
    (f) => f.player === owner.player && f.role === 'ally' && f.defeated,
  );
}
function destinations(runtime: Runtime, binding: Binding, anchor: PlayerRef) {
  const fighter = reference(runtime.state, binding, anchor);
  if (!fighter || fighter.defeated || fighter.position === null) return [];
  return runtime.defs.map.nodes.filter(
    (n) => emptyEndpoint(runtime.state, n) && sharesZone(runtime.defs.map, fighter.position, n),
  );
}
export function offerRevival(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'revive-ally' }>,
): void {
  const anchor = effect.anchor ?? 'main';
  if (!destinations(runtime, binding, anchor).length) return;
  const options: (ChoiceOption & { tasks: Task[] })[] = candidates(runtime, binding).map((f) => ({
    id: f.id,
    object: { type: 'fighter', id: f.id },
    label: fighterLabel(f, runtime.defs),
    tasks: [{ ...binding, type: 'revive-placement' as const, fighter: f.id, anchor }],
  }));
  if (!options.length) return;
  if (effect.optional) options.push({ id: '$skip', decline: true, label: 'Skip', tasks: [] });
  openChoice(
    runtime,
    binding.frame,
    fighterById(runtime.state, binding.owner)!.player,
    'Return a defeated ally',
    options,
    1,
    1,
    binding.provenance,
    { fighter: binding.owner },
  );
}
export function offerPlacement(
  runtime: Runtime,
  task: Extract<Task, { type: 'revive-placement' }>,
): void {
  if (!candidates(runtime, task).some((f) => f.id === task.fighter)) return;
  openChoice(
    runtime,
    task.frame,
    fighterById(runtime.state, task.owner)!.player,
    'Choose where to return the ally',
    destinations(runtime, task, task.anchor).map((position) => ({
      id: position,
      object: { type: 'space' as const, id: position },
      label: `Space ${runtime.defs.map.nodes.indexOf(position) + 1}`,
      tasks: [{ ...task, type: 'revive', position }],
    })),
    1,
    1,
    task.provenance,
    { fighter: task.owner },
  );
}
export function revive(runtime: Runtime, task: Extract<Task, { type: 'revive' }>): void {
  const fighter = candidates(runtime, task).find((f) => f.id === task.fighter);
  if (!fighter || !destinations(runtime, task, task.anchor).includes(task.position)) return;
  const definition = fighterDefinition(fighter, runtime.defs);
  fighter.defeated = false;
  fighter.hp = definition.hp;
  fighter.position = task.position;
  fighter.statuses = [];
  fighter.counters = Object.fromEntries(
    Object.entries(definition.counters ?? {}).map(([id, c]) => [id, c.initial]),
  );
  runtime.emit({ type: 'revived', fighter: fighter.id, position: task.position });
}
