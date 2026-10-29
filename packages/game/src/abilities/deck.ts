import { fighterById, mainFighter } from '../fighters';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';
import { reference } from './conditions';
import { openChoice } from './choices';
import { availableDiscards, taggedCards } from './discard-pile';

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

export function inspectDeck(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'inspect-deck' }>,
): void {
  const target = reference(runtime.state, binding, effect.target ?? 'self', false);
  const p = runtime.state.players.find((p) => p.id === target?.player);
  if (!p || p.eliminated || runtime.data.dormant?.includes(p.id)) return;
  const cards = p.deck.slice(0, effect.count).map((c) => c.id);
  // A one-card inspection still needs a private view before its trivial ordering finishes.
  if (!effect.take && cards.length === 1) {
    const card = p.deck[0];
    openChoice(
      runtime,
      binding.frame,
      player(runtime, binding).id,
      'Inspect the top card',
      [
        {
          id: card.id,
          label: runtime.defs.cards[card.definition].name,
          card: { ...card },
          tasks: [],
        },
      ],
      1,
      1,
      binding.provenance,
      { fighter: binding.owner },
    );
    return;
  }
  runtime.prepend({
    ...binding,
    type: 'inspect-take',
    player: p.id,
    cards,
    remaining: Math.min(effect.take, cards.length),
  });
}

export function takeInspected(
  runtime: Runtime,
  task: Extract<Task, { type: 'inspect-take' }>,
): void {
  const p = task.player
    ? runtime.state.players.find((p) => p.id === task.player)!
    : player(runtime, task);
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
    player(runtime, task).id,
    `Choose a card for ${p.id === player(runtime, task).id ? 'your' : 'their'} hand (${task.remaining} remaining)`,
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
  const p = task.player
    ? runtime.state.players.find((p) => p.id === task.player)!
    : player(runtime, task);
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
    player(runtime, task).id,
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
  if (p.eliminated) return;
  const frame = runtime.data.frames[binding.frame];
  const boosted =
    frame?.kind === 'combat'
      ? frame.boosts
          .filter((b) => !effect.boostGrants || effect.boostGrants.includes(b.grant))
          .map((b) => b.card.id)
      : [];
  const discards = availableDiscards(runtime.state, p);
  const receipts = effect.discardedByCard
    ? (frame.discardedCards
        ?.filter((r) => r.source === binding.provenance?.card && r.player === p.id)
        .map((r) => r.card.id) ?? [])
    : undefined;
  const available = taggedCards(
    effect.top ? discards.slice(-1) : discards,
    runtime.defs,
    effect.tag,
  ).filter(
    (card) =>
      (!effect.cards || effect.cards.includes(card.definition)) &&
      (!effect.boostedOnly || boosted.includes(card.id)) &&
      (!receipts || receipts.includes(card.id)),
  );
  if (effect.random) {
    if (!available.length) return;
    resolveRecovery(runtime, {
      ...binding,
      type: 'recover-card',
      card: available[randomIndex(runtime, available.length)].id,
      destination: effect.destination,
    });
    return;
  }
  if (effect.all || effect.discardedByCard) {
    const ids = new Set(available.map((card) => card.id));
    p.discard = p.discard.filter((card) => !ids.has(card.id));
    if (effect.destination === 'deck') {
      p.deck.push(...available);
      if (available.length) shuffle(runtime, p.deck);
    } else if (available.length) {
      p.hand.push(...available);
      runtime.emit({ type: 'draw', player: p.id, cards: available }, p.id);
    }
    return;
  }
  openChoice(
    runtime,
    binding.frame,
    p.id,
    effect.destination === 'deck'
      ? 'Shuffle a discarded card into your deck'
      : 'Return a discarded card to your hand',
    available.map((card) => ({
      id: card.id,
      label: runtime.defs.cards[card.definition].name,
      card,
      tasks: [
        {
          ...binding,
          type: 'recover-card',
          card: card.id,
          cards: effect.cards,
          boostedOnly: effect.boostedOnly,
          boostGrants: effect.boostGrants,
          tag: effect.tag,
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
  const frame = runtime.data.frames[task.frame];
  const boosted =
    frame?.kind === 'combat'
      ? frame.boosts
          .filter((b) => !task.boostGrants || task.boostGrants.includes(b.grant))
          .map((b) => b.card.id)
      : [];
  const index = p.discard.findIndex(
    (c) =>
      c.id === task.card &&
      (!task.boostedOnly || boosted.includes(c.id)) &&
      (!task.cards || task.cards.includes(c.definition)) &&
      (!task.tag || runtime.defs.cards[c.definition].tags?.includes(task.tag)),
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
  const p = task.player
    ? runtime.state.players.find((p) => p.id === task.player)!
    : player(runtime, task);
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
    if (task.destination === 'bottom') p.deck.push(...cards);
    else p.deck.unshift(...cards);
    if (task.redraw === 'up-to' && cards.length)
      openChoice(
        runtime,
        task.frame,
        p.id,
        'Choose how many cards to draw',
        Array.from({ length: cards.length + 1 }, (_, amount) => ({
          id: String(amount),
          label: String(amount),
          value: amount,
          tasks: [
            {
              type: 'operation' as const,
              operation: {
                kind: 'draw' as const,
                actor: mainFighter(runtime.state, p.id).id,
                amount,
              },
            },
          ],
        })),
        1,
        1,
        task.provenance,
        { fighter: task.owner },
      );
    return;
  }
  openChoice(
    runtime,
    task.frame,
    task.chooser ?? p.id,
    task.destination === 'bottom'
      ? 'Choose a card for the bottom of their deck'
      : 'Choose the next card for the top of your deck',
    [
      ...available.map((card) => ({
        id: card.id,
        label: runtime.defs.cards[card.definition].name,
        card: { ...card },
        tasks: [{ ...task, selected: card.id }],
      })),
      ...(task.upTo
        ? [
            {
              id: '$done',
              label: 'Finish returning cards',
              decline: true,
              tasks: [{ ...task, remaining: 0, selected: undefined }],
            },
          ]
        : []),
    ],
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
  const target = reference(runtime.state, binding, effect.target, false);
  const p = runtime.state.players.find((p) => p.id === target?.player);
  if (!p || p.eliminated || effect.count <= 0) return;
  const card = p.deck.shift();
  if (!card) return;
  if (binding.provenance)
    (runtime.data.frames[binding.frame].discardedCards ??= []).push({
      card: structuredClone(card),
      player: p.id,
      source: binding.provenance.card,
    });
  runtime.prepend(
    ...runtime.effects(effect.onDiscard ?? [], {
      ...binding,
      selectedCard: card,
      selectedPlayer: p.id,
    }),
    ...runtime.effects(effect.count > 1 ? [{ ...effect, count: effect.count - 1 }] : [], binding),
  );
  runtime.card(target!.id, card, true, binding.owner);
}

/** Reveal an exact top card publicly, keeping its identity through suspended continuations. */
export function revealTopCard(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'reveal-top-card' }>,
): void {
  const target = reference(runtime.state, binding, effect.target, false);
  const p = runtime.state.players.find((p) => p.id === target?.player);
  if (!p || p.eliminated || runtime.data.dormant?.includes(p.id)) return;
  const card = p.deck[0];
  if (card) {
    const frame = runtime.data.frames[binding.frame];
    frame.revealedDeckCards = [...(frame.revealedDeckCards ?? []), structuredClone(card)];
    runtime.emit({
      type: 'hand-revealed',
      player: p.id,
      cards: [structuredClone(card)],
      zone: 'deck',
    });
  }
  runtime.prepend(
    ...runtime.effects(effect.effects, {
      ...binding,
      selectedCard: card ? structuredClone(card) : undefined,
      selectedPlayer: p.id,
    }),
  );
}

/** Discard only the exact deck instance bound by a reveal, then run its receipt. */
export function discardSelectedCard(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'discard-selected-card' }>,
): void {
  const p = runtime.state.players.find((p) => p.id === binding.selectedPlayer);
  if (!p || p.eliminated || runtime.data.dormant?.includes(p.id) || !binding.selectedCard) return;
  const index = p.deck.findIndex((c) => c.id === binding.selectedCard!.id);
  if (index < 0) return;
  const [card] = p.deck.splice(index, 1);
  const target = runtime.state.fighters.find((f) => f.player === p.id && f.role === 'main')!;
  runtime.prepend(...runtime.effects(effect.onDiscard ?? [], { ...binding, selectedCard: card }));
  runtime.card(target.id, card, true, binding.owner);
}
