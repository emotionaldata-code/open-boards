import { fighterById } from '../fighters';
import { reference } from './conditions';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';

/** Both movement hooks run before an atomic exchange; neither destination is temporarily free. */
export function swapFighters(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'swap' }>,
): void {
  const a = reference(runtime.state, binding),
    b = reference(runtime.state, binding, effect.target);
  if (!a || !b || a.id === b.id || a.defeated || b.defeated || !a.position || !b.position) return;
  const frames = [a, b].map((fighter, i) =>
    runtime.frame({
      kind: 'move',
      actor: binding.owner,
      target: fighter.id,
      origin: fighter.position!,
      path: [(i ? a : b).position!],
      distance: 1,
      mode: 'teleport',
    }),
  );
  for (const id of frames) runtime.data.frames[id].provenance = binding.provenance;
  runtime.prepend(
    ...frames.map((frame) => ({ type: 'event' as const, frame, hook: 'before-move' as const })),
    { ...binding, type: 'swap-apply', frames, effects: effect.onSuccess ?? [] },
    ...frames.map((frame) => ({ type: 'event' as const, frame, hook: 'after-move' as const })),
    ...frames.map((frame) => ({ type: 'release' as const, frame })),
  );
}
export function applySwap(runtime: Runtime, task: Extract<Task, { type: 'swap-apply' }>): void {
  const [a, b] = task.frames.map((id) => runtime.data.frames[id]);
  if (a?.kind !== 'move' || b?.kind !== 'move') return;
  const first = fighterById(runtime.state, a.target),
    second = fighterById(runtime.state, b.target);
  if (
    runtime.data.movementLocks?.includes(a.target) ||
    runtime.data.movementLocks?.includes(b.target) ||
    a.cancelled ||
    b.cancelled ||
    !first ||
    !second ||
    first.defeated ||
    second.defeated ||
    first.position !== a.origin ||
    second.position !== b.origin
  ) {
    for (const frame of [a, b]) {
      frame.path = [];
      frame.distance = 0;
    }
    return;
  }
  first.position = b.origin;
  second.position = a.origin;
  runtime.emit({ type: 'move', fighter: first.id, path: [a.origin, b.origin] });
  runtime.emit({ type: 'move', fighter: second.id, path: [b.origin, a.origin] });
  // Finish both after-move hooks before the source's subsequent effects.
  const releaseIndex = runtime.data.queue.findIndex(
    (t) => t.type === 'release' && t.frame === task.frames[1],
  );
  runtime.data.queue.splice(releaseIndex + 1, 0, ...runtime.effects(task.effects, task));
}
