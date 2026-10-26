import { fighterById } from '../fighters';
import { adjacent, emptyEndpoint, portalStep } from '../movement';
import { sharesZone } from '../targeting';
import { reference } from './conditions';
import { openChoice } from './choices';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';

export function setupTokens(runtime: Runtime, task: Extract<Task, { type: 'token-setup' }>): void {
  const [id, ...remaining] = task.remaining;
  if (!id) return;
  const token = runtime.state.boardTokens?.find((t) => t.id === id);
  const owner = token && fighterById(runtime.state, token.owner);
  if (!token || !owner || owner.defeated) {
    runtime.prepend({ ...task, remaining });
    return;
  }
  openChoice(
    runtime,
    task.frame,
    owner.player,
    `Place ${token.name}`,
    runtime.defs.map.nodes
      .filter(
        (position) =>
          emptyEndpoint(runtime.state, position) &&
          sharesZone(runtime.defs.map, owner.position, position) &&
          !runtime.state.boardTokens?.some(
            (t) =>
              t.position === position &&
              (t.owner === owner.id || (token.exclusive && t.kind === token.kind)),
          ),
      )
      .map((position) => ({
        id: position,
        label: `Space ${runtime.defs.map.nodes.indexOf(position) + 1}`,
        tasks: [
          { ...task, type: 'token-place' as const, token: id, position, setup: true },
          { ...task, remaining },
        ],
      })),
  );
}

export function chooseToken(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'choose-token' }>,
): void {
  const chooser = reference(runtime.state, binding, effect.chooser);
  if (!chooser) return;
  const at = effect.at && reference(runtime.state, binding, effect.at);
  openChoice(
    runtime,
    binding.frame,
    chooser.player,
    'Choose a token',
    (runtime.state.boardTokens ?? [])
      .filter(
        (t) =>
          t.owner === binding.owner &&
          t.kind === effect.token &&
          t.position !== null &&
          (!effect.at || (at?.position !== null && t.position === at?.position)) &&
          (!effect.excludeChosen || t.id !== binding.chosenToken),
      )
      .map((t) => ({
        id: t.id,
        label: `${t.name} · Space ${runtime.defs.map.nodes.indexOf(t.position!) + 1}`,
        tasks: runtime.effects(effect.effects, {
          ...binding,
          chosenToken: t.id,
          tokenChooser: chooser.player,
        }),
      })),
    1,
    1,
    binding.provenance,
  );
}

export function moveToken(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'move-token' }>,
): void {
  const token = runtime.state.boardTokens?.find(
    (t) => t.id === binding.chosenToken && t.owner === binding.owner,
  );
  const chooser = reference(runtime.state, binding);
  // The chooser is explicitly carried by choose-token, while token ownership stays unchanged.
  const player = binding.tokenChooser ?? chooser?.player;
  if (!token || token.position === null || !player) return;
  const distances: Record<string, number> = { [token.position]: 0 };
  const queue = [token.position];
  for (const position of queue)
    for (const next of runtime.defs.map.nodes)
      if (
        distances[next] === undefined &&
        (adjacent(runtime.defs.map, position, next) || portalStep(runtime.defs.map, position, next))
      ) {
        distances[next] = distances[position] + 1;
        queue.push(next);
      }
  openChoice(
    runtime,
    binding.frame,
    player,
    `Move ${token.name}`,
    [
      ...runtime.defs.map.nodes
        .filter(
          (position) =>
            position !== token.position &&
            !runtime.state.boardTokens?.some(
              (t) =>
                t.id !== token.id &&
                t.kind === token.kind &&
                t.position === position &&
                (token.exclusive || t.exclusive),
            ) &&
            (effect.distance === undefined || distances[position] <= effect.distance) &&
            (!effect.empty || emptyEndpoint(runtime.state, position)),
        )
        .map((position) => ({
          id: position,
          label: `Space ${runtime.defs.map.nodes.indexOf(position) + 1}`,
          tasks: [
            {
              ...binding,
              type: 'token-place' as const,
              token: token.id,
              position,
              placeSelf: effect.placeSelf,
            },
          ],
        })),
      ...(effect.distance !== undefined || effect.optional
        ? [{ id: '$stay', label: 'Leave token in place', tasks: [] }]
        : []),
    ],
    1,
    1,
    binding.provenance,
  );
}

export function placeToken(runtime: Runtime, task: Extract<Task, { type: 'token-place' }>): void {
  const token = runtime.state.boardTokens?.find((t) => t.id === task.token);
  const owner = token && fighterById(runtime.state, token.owner);
  if (!token || !owner || owner.defeated || !runtime.defs.map.nodes.includes(task.position)) return;
  if (
    task.setup &&
    (!emptyEndpoint(runtime.state, task.position) ||
      !sharesZone(runtime.defs.map, owner.position, task.position) ||
      runtime.state.boardTokens?.some(
        (t) => t.id !== token.id && t.owner === owner.id && t.position === task.position,
      ))
  )
    return;
  if (
    runtime.state.boardTokens?.some(
      (t) =>
        t.id !== token.id &&
        t.kind === token.kind &&
        t.position === task.position &&
        (token.exclusive || t.exclusive),
    )
  )
    return;
  token.position = task.position;
  if (task.placeSelf && emptyEndpoint(runtime.state, task.position)) {
    runtime.operation(
      {
        kind: 'move',
        actor: owner.id,
        target: owner.id,
        origin: owner.position!,
        path: [task.position],
        mode: 'teleport',
        distance: 1,
      },
      task.provenance,
    );
  }
}

/** Snapshot membership and let the owner choose order without rebinding a fighter. */
export function nextToken(runtime: Runtime, task: Extract<Task, { type: 'token-group' }>): void {
  const owner = fighterById(runtime.state, task.owner)!;
  if (owner.defeated) return;
  const remaining = task.remaining.filter((id) =>
    runtime.state.boardTokens?.some((t) => t.id === id),
  );
  openChoice(
    runtime,
    task.frame,
    owner.player,
    'Choose the next token',
    remaining.map((id) => ({
      id,
      label: runtime.state.boardTokens!.find((t) => t.id === id)!.name,
      tasks: [
        ...runtime.effects(task.effects, { ...task, chosenToken: id, tokenChooser: owner.player }),
        { ...task, remaining: remaining.filter((t) => t !== id) },
      ],
    })),
    1,
    1,
    task.provenance,
  );
}
