import { fighterById, mainFighter } from '../fighters';
import { openChoice } from './choices';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';

/** Draw normally, then retain a private subset of those exact drawn instances. */
export function offerDrawKeep(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'draw-and-keep' }>,
): void {
  const owner = fighterById(runtime.state, binding.owner)!;
  const task = {
    ...binding,
    type: 'draw-keep-start' as const,
    count: effect.count,
    keep: effect.keep,
  };
  if (!effect.upTo) {
    runtime.prepend(task);
    return;
  }
  openChoice(
    runtime,
    binding.frame,
    owner.player,
    'Choose how many cards to draw',
    Array.from({ length: effect.count + 1 }, (_, count) => ({
      id: String(count),
      label: `Draw ${count}`,
      value: count,
      tasks: [{ ...task, count }],
    })),
    1,
    1,
    binding.provenance,
    { fighter: binding.owner },
  );
}

export function startDrawKeep(
  runtime: Runtime,
  task: Extract<Task, { type: 'draw-keep-start' }>,
): void {
  if (!task.count) return;
  const actor = mainFighter(runtime.state, fighterById(runtime.state, task.owner)!.player).id;
  const draw = runtime.frame({ kind: 'draw', actor, amount: task.count });
  runtime.data.frames[draw].provenance = task.provenance;
  runtime.prepend(
    { type: 'event', frame: draw, hook: 'before-draw' },
    { type: 'apply', frame: draw, provenance: task.provenance },
    { type: 'event', frame: draw, hook: 'after-draw' },
    { ...task, type: 'draw-keep-select', draw, keep: task.keep },
    { type: 'release', frame: draw },
  );
}

export function selectDrawKeep(
  runtime: Runtime,
  task: Extract<Task, { type: 'draw-keep-select' }>,
): void {
  const p = runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, task.owner)!.player,
  )!;
  if (p.eliminated) return;
  const drawn = runtime.data.frames[task.draw]?.drawnCards ?? [];
  const cards = drawn.filter(
    (c) => !task.kept?.includes(c.id) && p.hand.some((h) => h.id === c.id),
  );
  const count = Math.min(task.keep - (task.kept?.length ?? 0), cards.length);
  if (count === cards.length) return;
  if (!count) {
    runtime.prepend({
      ...task,
      type: 'draw-keep-order',
      cards: cards.map((c) => c.id),
      ordered: [],
    });
    return;
  }
  openChoice(
    runtime,
    task.frame,
    p.id,
    `Keep ${count} drawn card${count === 1 ? '' : 's'}`,
    cards.map((card) => ({
      id: card.id,
      label: runtime.defs.cards[card.definition].name,
      card: { ...card },
      tasks: [
        {
          ...task,
          type: 'draw-keep-select' as const,
          kept: [...(task.kept ?? []), card.id],
        },
      ],
    })),
    1,
    1,
    task.provenance,
    { fighter: task.owner },
  );
}

export function orderDrawKeep(
  runtime: Runtime,
  task: Extract<Task, { type: 'draw-keep-order' }>,
): void {
  const p = runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, task.owner)!.player,
  )!;
  if (p.eliminated) return;
  const cards = task.cards.filter((id) => p.hand.some((c) => c.id === id));
  if (cards.length <= 1) {
    const order = [...task.ordered, ...cards];
    const moved = order.flatMap((id) => p.hand.filter((c) => c.id === id));
    p.hand = p.hand.filter((c) => !order.includes(c.id));
    p.deck.push(...moved);
    return;
  }
  openChoice(
    runtime,
    task.frame,
    p.id,
    'Order the returned cards: choose the next bottom card',
    cards.map((id) => ({
      id,
      label: runtime.defs.cards[p.hand.find((c) => c.id === id)!.definition].name,
      card: { ...p.hand.find((c) => c.id === id)! },
      tasks: [{ ...task, cards: cards.filter((c) => c !== id), ordered: [...task.ordered, id] }],
    })),
    1,
    1,
    task.provenance,
    { fighter: task.owner },
  );
}
