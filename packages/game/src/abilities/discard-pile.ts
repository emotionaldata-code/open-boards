import type { Card, Definitions, GameState, Player } from '../types';

export function taggedCards(cards: Card[], defs: Definitions, tag?: string): Card[] {
  return cards.filter((card) => !tag || defs.cards[card.definition].tags?.includes(tag));
}

/** Unfinished schemes and combat commitments are unavailable for counting or recovery. */
export function availableDiscards(
  state: Pick<GameState, 'resolution'>,
  player: Pick<Player, 'discard'>,
): Card[] {
  const committed = new Set(
    Object.values(state.resolution.frames).flatMap((frame) =>
      frame.kind === 'combat'
        ? [frame.card.id, ...(frame.defenseCard ? [frame.defenseCard.id] : [])]
        : frame.kind === 'card' && !frame.discarded
          ? [frame.card.id]
          : [],
    ),
  );
  return player.discard.filter((card) => !committed.has(card.id));
}

/** Unfinished actions and combat commitments do not become the visible pile's top yet. */
export function topDiscardTags(
  state: { resolution?: GameState['resolution'] },
  player: Pick<Player, 'discard' | 'character'>,
  defs: Definitions,
): string[] {
  const unfinished = new Set(
    Object.values(state.resolution?.frames ?? {}).flatMap((frame) =>
      frame.kind === 'combat'
        ? [frame.card.id, ...(frame.defenseCard ? [frame.defenseCard.id] : [])]
        : frame.kind === 'card' && !frame.discarded
          ? [frame.card.id]
          : [],
    ),
  );
  const top = player.discard.filter((card) => !unfinished.has(card.id)).at(-1);
  return top
    ? (defs.cards[top.definition].tags ?? [])
    : (defs.characters[player.character].discardBase?.tags ?? []);
}

/** Played cards enter the settled pile after their effects, above intervening discards. */
export function settleDiscard(player: Pick<Player, 'discard'>, card: Card): void {
  const index = player.discard.findIndex((entry) => entry.id === card.id);
  if (index >= 0) player.discard.push(...player.discard.splice(index, 1));
}
