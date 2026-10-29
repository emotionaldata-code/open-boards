import type { Card, Definitions, GameState, Player } from '../types';

export function taggedCards(cards: Card[], defs: Definitions, tag?: string): Card[] {
  return cards.filter((card) => !tag || defs.cards[card.definition].tags?.includes(tag));
}

/** Public combat commitments are not yet available for discard counting or recovery. */
export function availableDiscards(
  state: Pick<GameState, 'resolution'>,
  player: Pick<Player, 'discard'>,
): Card[] {
  const committed = new Set(
    Object.values(state.resolution.frames).flatMap((frame) =>
      frame.kind === 'combat'
        ? [frame.card.id, ...(frame.defenseCard ? [frame.defenseCard.id] : [])]
        : [],
    ),
  );
  return player.discard.filter((card) => !committed.has(card.id));
}
