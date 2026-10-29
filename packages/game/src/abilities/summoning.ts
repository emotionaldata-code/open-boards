import { fighterById, fighterDefinition, fighterLabel } from '../fighters';
import { adjacent, emptyEndpoint } from '../movement';
import { sharesZone } from '../targeting';
import { openChoice } from './choices';
import { canPlace } from './positions';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';

type Summon = Extract<Effect, { type: 'summon-ally' }>;
function candidates(runtime: Runtime, binding: Binding) {
  const owner = fighterById(runtime.state, binding.owner)!;
  if (owner.defeated || owner.position === null) return [];
  const allies = runtime.state.fighters.filter(
    (f) => f.player === owner.player && f.role === 'ally',
  );
  const reserve = allies.filter((f) => f.defeated);
  return reserve.length
    ? reserve
    : allies.filter((f) => f.position !== null && !runtime.data.movementLocks?.includes(f.id));
}
function destinations(runtime: Runtime, binding: Binding, effect: Summon) {
  const owner = fighterById(runtime.state, binding.owner)!;
  if (owner.defeated || owner.position === null) return [];
  return runtime.defs.map.nodes.filter((n) =>
    effect.placement === 'replace-self'
      ? sharesZone(runtime.defs.map, owner.position, n) &&
        canPlace(runtime.state, owner, runtime.defs, n, { zone: 'shared' })
      : emptyEndpoint(runtime.state, n) && adjacent(runtime.defs.map, owner.position!, n),
  );
}

/** Pay or leave first; select the ally from the pool after all resulting reactions. */
export function offerSummon(runtime: Runtime, binding: Binding, effect: Summon): void {
  const owner = fighterById(runtime.state, binding.owner)!;
  if (!candidates(runtime, binding).length) return;
  openChoice(
    runtime,
    binding.frame,
    owner.player,
    effect.placement === 'replace-self'
      ? 'Place your fighter and leave an ally behind'
      : 'Summon in an adjacent space',
    destinations(runtime, binding, effect).map((position) => ({
      id: position,
      object: { type: 'space' as const, id: position },
      label: `Space ${runtime.defs.map.nodes.indexOf(position) + 1}`,
      tasks: [
        ...(effect.damage
          ? [
              {
                type: 'operation' as const,
                operation: {
                  kind: 'damage' as const,
                  actor: owner.id,
                  target: owner.id,
                  amount: effect.damage,
                  reason: 'ability' as const,
                },
              },
            ]
          : []),
        ...(effect.placement === 'replace-self'
          ? [
              {
                type: 'operation' as const,
                operation: {
                  kind: 'move' as const,
                  actor: owner.id,
                  target: owner.id,
                  origin: owner.position!,
                  path: [position],
                  distance: 1,
                  mode: 'teleport' as const,
                  zone: 'shared' as const,
                },
              },
            ]
          : []),
        {
          ...binding,
          type: 'summon-ally' as const,
          effect,
          fighter: '',
          origin: owner.position!,
          position,
          stage: 'select' as const,
        },
      ],
    })),
    1,
    1,
    binding.provenance,
    { fighter: owner.id },
  );
}

export function resolveSummon(
  runtime: Runtime,
  task: Extract<Task, { type: 'summon-ally' }>,
): void {
  const owner = fighterById(runtime.state, task.owner)!;
  if (
    owner.defeated ||
    owner.position === null ||
    runtime.state.players.find((p) => p.id === owner.player)!.eliminated
  )
    return;
  const position = task.effect.placement === 'replace-self' ? task.origin : task.position;
  if (!emptyEndpoint(runtime.state, position)) return;
  if (task.effect.placement === 'replace-self') {
    if (owner.position !== task.position || owner.position === task.origin) return;
  } else if (!adjacent(runtime.defs.map, owner.position, position)) return;
  if (task.stage === 'select') {
    openChoice(
      runtime,
      task.frame,
      owner.player,
      'Choose an ally to summon',
      candidates(runtime, task).map((f) => ({
        id: f.id,
        object: { type: 'fighter' as const, id: f.id },
        label: fighterLabel(f, runtime.defs),
        tasks: [{ ...task, fighter: f.id, stage: 'finish' as const }],
      })),
      1,
      1,
      task.provenance,
      { fighter: owner.id },
    );
    return;
  }
  const ally = candidates(runtime, task).find((f) => f.id === task.fighter);
  if (!ally) return;
  if (!ally.defeated) {
    runtime.operation(
      {
        kind: 'move',
        actor: owner.id,
        target: ally.id,
        origin: ally.position!,
        path: [position],
        distance: 1,
        mode: 'teleport',
      },
      task.provenance,
    );
    return;
  }
  const definition = fighterDefinition(ally, runtime.defs);
  ally.hp = definition.hp;
  ally.statuses = [];
  ally.counters = Object.fromEntries(
    Object.entries(definition.counters ?? {}).map(([id, c]) => [id, c.initial]),
  );
  ally.defeated = false;
  ally.position = position;
  runtime.emit({ type: 'revived', fighter: ally.id, position });
}
