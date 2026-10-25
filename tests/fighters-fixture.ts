import type { Ability, Definitions } from '../packages/game/src';
import { basic as rules } from './rules-fixture';

/** Test-only fighters and cards for shared ally hooks; never registered in the playable roster. */
const onDamage: Ability['when'] = {
  type: 'all',
  conditions: [
    { type: 'role', role: 'attacker' },
    { type: 'compare', left: { event: 'amount' }, op: 'gt', right: 0 },
  ],
};
export const basic: Definitions = {
  ...rules,
  characters: {
    leader: {
      id: 'leader',
      name: 'Leader',
      hp: 14,
      movement: 2,
      attackType: 'ranged',
      deck: ['strike', 'ally-strike', 'adapt', 'guard', 'heal', 'advance', 'prepare'].map(
        (card, i) => ({ card, count: i === 6 ? 2 : 3 }),
      ),
      abilities: [
        {
          id: 'draw-on-hit',
          name: 'Draw on hit',
          description: 'Draw once per turn after attack damage.',
          trigger: 'after-attack',
          when: onDamage,
          limit: { scope: 'turn', count: 1 },
          effects: [{ type: 'draw', count: 1 }],
        },
      ],
      ally: {
        id: 'companion',
        name: 'Companion',
        hp: 2,
        attackType: 'melee',
        count: 3,
        abilities: [
          {
            id: 'move-on-hit',
            name: 'Move on hit',
            description: 'Move once per turn after attack damage.',
            trigger: 'after-attack',
            when: onDamage,
            limit: { scope: 'turn', count: 1 },
            effects: [{ type: 'move', distance: 1 }],
          },
        ],
      },
    },
  },
  cards: {
    ...rules.cards,
    'ally-strike': {
      ...rules.cards.strike,
      id: 'ally-strike',
      name: 'Ally strike',
      usableBy: 'ALLY',
      value: 3,
    },
    adapt: { ...rules.cards.adapt, usableBy: 'BOTH' },
    guard: { ...rules.cards.guard, usableBy: 'BOTH' },
    heal: {
      id: 'heal',
      name: 'Heal',
      category: 'action',
      value: 0,
      boost: 2,
      usableBy: 'BOTH',
      effects: [{ type: 'heal', amount: 2 }],
    },
    advance: {
      id: 'advance',
      name: 'Advance',
      category: 'action',
      value: 0,
      boost: 2,
      usableBy: 'BOTH',
      effects: [
        { type: 'move', distance: 2 },
        { type: 'draw', count: 1 },
      ],
    },
  },
};
export function deckDefinitions(character = 'leader') {
  return basic.characters[character].deck.flatMap(({ card, count }) =>
    Array<string>(count).fill(card),
  );
}
