import type { CardDefinition, Definitions, Fighter, GameState, Player } from './types';
import { cardEligible } from './fighters';
import { topDiscardTags } from './abilities/discard-pile';

/** Declaration permission is fixed before effects can cancel the played card. */
export function canPlayDefense(
  state: {
    players: Pick<Player, 'id' | 'character' | 'discard'>[];
    resolution?: GameState['resolution'];
  },
  fighter: Fighter,
  card: CardDefinition,
  defs: Definitions,
): boolean {
  if (!cardEligible(card, fighter)) return false;
  if (card.category === 'defense' || card.category === 'versatile') return true;
  const when = card.defenseMode?.when;
  const player = state.players.find((p) => p.id === fighter.player);
  if (!when || !player) return false;
  const tags = topDiscardTags(state, player, defs);
  return tags.includes(when.tag) || (!!when.wildTag && tags.includes(when.wildTag));
}
