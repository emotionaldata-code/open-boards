import type { StatusDefinition } from '@open-boards/game';

export const statuses: Record<string, StatusDefinition> = {
  big: {
    id: 'big',
    name: 'BIG · Attack cards +2',
    maxStacks: 1,
    abilities: [
      {
        id: 'big-attack',
        name: 'BIG',
        description: 'Add 2 to the value of this fighter’s attack cards.',
        trigger: 'before-combat',
        when: { type: 'role', role: 'attacker' },
        effects: [{ type: 'modify', field: 'attack', amount: 2 }],
      },
    ],
  },
  small: {
    id: 'small',
    name: 'SMALL · Defense cards +1',
    maxStacks: 1,
    abilities: [
      {
        id: 'small-defense',
        name: 'SMALL',
        description:
          'Add 1 to the value of this fighter’s defense cards. A defense card is required.',
        trigger: 'before-combat',
        when: {
          type: 'all',
          conditions: [
            { type: 'role', role: 'defender' },
            {
              type: 'any',
              conditions: [
                { type: 'card-category', card: 'defense', category: 'defense' },
                { type: 'card-category', card: 'defense', category: 'versatile' },
              ],
            },
          ],
        },
        effects: [{ type: 'modify', field: 'defense', amount: 1 }],
      },
    ],
  },
  'jekyll-form': { id: 'jekyll-form', name: 'Dr. Jekyll', maxStacks: 1 },
  'hyde-form': { id: 'hyde-form', name: 'Mr. Hyde', maxStacks: 1 },
  'attack-up': {
    id: 'attack-up',
    name: 'Attack +1',
    maxStacks: 100,
    modifiers: { attack: 1 },
  },
  'fixed-four': {
    id: 'fixed-four',
    name: 'Values fixed at 4',
    maxStacks: 1,
    combatValue: { value: 4, locked: true },
  },
  burn: {
    id: 'burn',
    name: 'Burn',
    maxStacks: 1,
    abilities: [
      {
        id: 'smolder',
        name: 'Smolder',
        description: 'At your turn start, take 1 damage, then remove Burn.',
        trigger: 'turn-start',
        effects: [
          { type: 'damage', amount: 1 },
          { type: 'remove-status', status: 'burn' },
        ],
      },
    ],
  },
};
