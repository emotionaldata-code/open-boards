import type { Definitions } from '../packages/game/src';
import { kingSolomonsMine } from '../packages/content/src/map';
import { statuses } from '../packages/content/src/statuses';

/** Neutral, fixed decks isolate engine invariants from playable-roster balance and hooks. */
const deck = ['strike', 'guard', 'adapt', 'prepare'].map((card) => ({ card, count: 5 }));
export const basic: Definitions = {
  map: kingSolomonsMine,
  statuses,
  characters: {
    vanguard: { id: 'vanguard', name: 'Vanguard', hp: 15, movement: 2, attackType: 'melee', deck },
    ranger: { id: 'ranger', name: 'Ranger', hp: 15, movement: 2, attackType: 'ranged', deck },
  },
  cards: {
    strike: {
      id: 'strike',
      name: 'Strike',
      usableBy: 'MAIN',
      category: 'attack',
      value: 4,
      boost: 1,
    },
    guard: {
      id: 'guard',
      name: 'Guard',
      usableBy: 'MAIN',
      category: 'defense',
      value: 3,
      boost: 2,
    },
    adapt: {
      id: 'adapt',
      name: 'Adapt',
      usableBy: 'MAIN',
      category: 'versatile',
      value: 3,
      boost: 1,
    },
    prepare: {
      id: 'prepare',
      name: 'Prepare',
      usableBy: 'MAIN',
      category: 'action',
      value: 0,
      boost: 2,
      effects: [{ type: 'draw', count: 2 }],
    },
  },
};
export function deckDefinitions(character = 'vanguard') {
  return basic.characters[character].deck.flatMap(({ card, count }) =>
    Array<string>(count).fill(card),
  );
}
