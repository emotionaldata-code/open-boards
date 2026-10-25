import { fighterById } from '../fighters';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';
import { openChoice } from './choices';

function player(runtime: Runtime, binding: Binding) {
  return runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, binding.owner)!.player,
  )!;
}

/** Seed lives in private resolution state: replay and reconnect consume the same stream. */
function shuffle(runtime: Runtime, cards: { id: string; definition: string }[]): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomIndex(runtime, i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

export function searchCard(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'search-card' }>,
): void {
  const p = player(runtime, binding);
  // Choosing the searched pile determines whether a shuffle is required, even on a miss.
  openChoice(
    runtime,
    binding.frame,
    p.id,
    'Choose a pile to search',
    [...new Set(effect.zones)].map((zone) => ({
      id: zone,
      label: `Search ${zone} first`,
      tasks: [
        {
          ...binding,
          type: 'search-card',
          zones: [zone, ...effect.zones.filter((z) => z !== zone)],
          card: effect.card,
        },
      ],
    })),
    1,
    1,
    binding.provenance,
  );
}

export function resolveSearch(
  runtime: Runtime,
  task: Extract<Task, { type: 'search-card' }>,
): void {
  const p = player(runtime, task);
  if (p.eliminated) return;
  for (const zone of task.zones) {
    const index = p[zone].findIndex((c) => c.definition === task.card);
    const cards = index >= 0 ? p[zone].splice(index, 1) : [];
    if (zone === 'deck') shuffle(runtime, p.deck);
    if (cards.length) {
      p.hand.push(...cards);
      runtime.emit({ type: 'draw', player: p.id, cards }, p.id);
      break;
    }
  }
}

export function inspectDeck(runtime: Runtime, binding: Binding, count: number, take: number): void {
  const cards = player(runtime, binding)
    .deck.slice(0, count)
    .map((c) => c.id);
  runtime.prepend({
    ...binding,
    type: 'inspect-take',
    cards,
    remaining: Math.min(take, cards.length),
  });
}

export function takeInspected(
  runtime: Runtime,
  task: Extract<Task, { type: 'inspect-take' }>,
): void {
  const p = player(runtime, task);
  if (p.eliminated) return;
  if (task.selected) {
    const index = p.deck.findIndex((c) => c.id === task.selected);
    if (index >= 0) {
      const cards = p.deck.splice(index, 1);
      p.hand.push(...cards);
      runtime.emit({ type: 'draw', player: p.id, cards }, p.id);
    }
  }
  const cards = task.cards.filter((id) => p.deck.some((c) => c.id === id));
  if (!task.remaining || !cards.length) {
    runtime.prepend({ ...task, type: 'inspect-order', cards, ordered: [] });
    return;
  }
  openChoice(
    runtime,
    task.frame,
    p.id,
    `Choose a card for your hand (${task.remaining} remaining)`,
    cards.map((id) => ({
      id,
      label: runtime.defs.cards[p.deck.find((c) => c.id === id)!.definition].name,
      card: { ...p.deck.find((c) => c.id === id)! },
      tasks: [
        {
          ...task,
          type: 'inspect-take' as const,
          cards: cards.filter((c) => c !== id),
          remaining: task.remaining - 1,
          selected: id,
        },
      ],
    })),
    1,
    1,
    task.provenance,
  );
}

export function orderInspected(
  runtime: Runtime,
  task: Extract<Task, { type: 'inspect-order' }>,
): void {
  const p = player(runtime, task);
  if (p.eliminated) return;
  if (task.cards.length <= 1) {
    const order = [...task.ordered, ...task.cards];
    const cards = order.flatMap((id) => p.deck.filter((c) => c.id === id));
    p.deck = [...cards, ...p.deck.filter((c) => !order.includes(c.id))];
    return;
  }
  openChoice(
    runtime,
    task.frame,
    p.id,
    'Order the remaining cards: choose the next top card',
    task.cards.map((id) => ({
      id,
      label: runtime.defs.cards[p.deck.find((c) => c.id === id)!.definition].name,
      card: { ...p.deck.find((c) => c.id === id)! },
      tasks: [
        { ...task, cards: task.cards.filter((c) => c !== id), ordered: [...task.ordered, id] },
      ],
    })),
    1,
    1,
    task.provenance,
  );
}

export function randomIndex(runtime: Runtime, length: number): number {
  let seed = runtime.data.random;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  runtime.data.random = seed >>> 0;
  return Math.floor((runtime.data.random / 0x100000000) * length);
}

/** Combat cards are committed until their combat finishes, even though discard is public. */
export function recoverCard(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'recover-card' }>,
): void {
  const p = player(runtime, binding);
  const committed = new Set(
    Object.values(runtime.data.frames).flatMap((f) =>
      f.kind === 'combat' ? [f.card.id, ...(f.defenseCard ? [f.defenseCard.id] : [])] : [],
    ),
  );
  openChoice(
    runtime,
    binding.frame,
    p.id,
    'Return a discarded card to your hand',
    p.discard
      .filter((c) => !committed.has(c.id) && (!effect.cards || effect.cards.includes(c.definition)))
      .map((card) => ({
        id: card.id,
        label: runtime.defs.cards[card.definition].name,
        card,
        tasks: [{ ...binding, type: 'recover-card', card: card.id, cards: effect.cards }],
      })),
    1,
    1,
    binding.provenance,
  );
}

export function resolveRecovery(
  runtime: Runtime,
  task: Extract<Task, { type: 'recover-card' }>,
): void {
  const p = player(runtime, task);
  if (p.eliminated) return;
  const index = p.discard.findIndex(
    (c) => c.id === task.card && (!task.cards || task.cards.includes(c.definition)),
  );
  if (index < 0) return;
  const cards = p.discard.splice(index, 1);
  p.hand.push(...cards);
  runtime.emit({ type: 'draw', player: p.id, cards }, p.id);
}

/** Return the exact resolving action, including from a nested damage continuation. */
export function returnPlayedCard(runtime: Runtime, binding: Binding): void {
  const p = player(runtime, binding);
  if (p.eliminated || !binding.provenance) return;
  const frame = Object.values(runtime.data.frames).find(
    (f) => f.kind === 'card' && f.card.id === binding.provenance!.card && !f.discarded,
  );
  if (
    frame?.kind !== 'card' ||
    frame.returned ||
    runtime.defs.cards[frame.card.definition].category !== 'action'
  )
    return;
  const index = p.discard.findIndex((c) => c.id === frame.card.id);
  if (index < 0) return;
  const cards = p.discard.splice(index, 1);
  p.hand.push(...cards);
  frame.returned = true;
  runtime.emit({ type: 'draw', player: p.id, cards }, p.id);
}
