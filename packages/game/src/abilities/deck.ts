import { fighterById } from '../fighters';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';
import { reference } from './conditions';
import { openChoice } from './choices';

function player(runtime: Runtime, binding: Binding) {
  return runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, binding.owner)!.player,
  )!;
}

/** Seed lives in private resolution state: replay and reconnect consume the same stream. */
export function shuffle(runtime: Runtime, cards: { id: string; definition: string }[]): void {
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
      object: { type: 'pile' as const, player: p.id, zone },
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
    { fighter: binding.owner },
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
    { fighter: task.owner },
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
    { fighter: task.owner },
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
    effect.destination === 'deck'
      ? 'Shuffle a discarded card into your deck'
      : 'Return a discarded card to your hand',
    p.discard
      .filter((c) => !committed.has(c.id) && (!effect.cards || effect.cards.includes(c.definition)))
      .map((card) => ({
        id: card.id,
        label: runtime.defs.cards[card.definition].name,
        card,
        tasks: [
          {
            ...binding,
            type: 'recover-card',
            card: card.id,
            cards: effect.cards,
            destination: effect.destination,
          },
        ],
      })),
    1,
    1,
    binding.provenance,
    { fighter: binding.owner },
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
  if (task.destination === 'deck') {
    p.deck.push(...cards);
    shuffle(runtime, p.deck);
  } else {
    p.hand.push(...cards);
    runtime.emit({ type: 'draw', player: p.id, cards }, p.id);
  }
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

/** Private exact-instance search, with an optional recycle of the resolving scheme. */
export function searchCards(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'search-cards' }>,
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
    'Choose a card from your deck or discard',
    (['deck', 'discard'] as const).flatMap((zone) =>
      p[zone]
        .filter((c) => effect.cards.includes(c.definition) && !committed.has(c.id))
        .map((card) => ({
          id: card.id,
          label: `${runtime.defs.cards[card.definition].name} · ${zone}`,
          card: { ...card },
          tasks: [
            {
              ...binding,
              type: 'search-selected' as const,
              card: card.id,
              zone,
              recycleOnDeck: effect.recycleOnDeck,
            },
          ],
        })),
    ),
    1,
    1,
    binding.provenance,
    { fighter: binding.owner },
  );
}
export function takeSearched(
  runtime: Runtime,
  task: Extract<Task, { type: 'search-selected' }>,
): void {
  const p = player(runtime, task);
  if (p.eliminated) return;
  const index = p[task.zone].findIndex((c) => c.id === task.card);
  if (index < 0) return;
  const cards = p[task.zone].splice(index, 1);
  p.hand.push(...cards);
  runtime.emit({ type: 'draw', player: p.id, cards }, p.id);
  if (task.zone === 'deck') {
    if (task.recycleOnDeck && task.provenance) {
      const source = Object.values(runtime.data.frames).find(
        (f) => f.kind === 'card' && f.card.id === task.provenance!.card && !f.discarded,
      );
      const index = p.discard.findIndex((c) => c.id === task.provenance!.card);
      if (source?.kind === 'card' && index >= 0) {
        p.deck.push(...p.discard.splice(index, 1));
        source.returned = true;
      }
    }
    shuffle(runtime, p.deck);
  }
}

/** Select in top-to-bottom order; no discard/draw events and no public card identities. */
export function returnToDeck(
  runtime: Runtime,
  task: Extract<Task, { type: 'return-to-deck' }>,
): void {
  const p = player(runtime, task);
  if (p.eliminated) return;
  if (task.selected) {
    const card = p.hand.find((c) => c.id === task.selected);
    if (!card || task.ordered.includes(card.id)) return;
    task = { ...task, ordered: [...task.ordered, card.id], remaining: task.remaining - 1 };
  }
  const available = p.hand.filter((c) => !task.ordered.includes(c.id));
  if (task.remaining <= 0 || !available.length) {
    const cards = task.ordered.map((id) => p.hand.find((c) => c.id === id)!);
    p.hand = p.hand.filter((c) => !task.ordered.includes(c.id));
    p.deck.unshift(...cards);
    return;
  }
  openChoice(
    runtime,
    task.frame,
    p.id,
    'Choose the next card for the top of your deck',
    available.map((card) => ({
      id: card.id,
      label: runtime.defs.cards[card.definition].name,
      card: { ...card },
      tasks: [{ ...task, selected: card.id }],
    })),
    1,
    1,
    task.provenance,
    { fighter: task.owner },
  );
}

/** Public top-deck discards resolve reactions before each exact-card continuation. */
export function discardDeck(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'discard-deck' }>,
): void {
  const target = reference(runtime.state, binding, effect.target);
  const p = runtime.state.players.find((p) => p.id === target?.player);
  if (!p || p.eliminated || effect.count <= 0) return;
  const card = p.deck.shift();
  if (!card) return;
  runtime.prepend(
    ...runtime.effects(effect.onDiscard ?? [], { ...binding, selectedCard: card }),
    ...runtime.effects(effect.count > 1 ? [{ ...effect, count: effect.count - 1 }] : [], binding),
  );
  runtime.card(target!.id, card, true);
}
