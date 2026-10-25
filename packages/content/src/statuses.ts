import type { StatusDefinition } from '@open-boards/game';

export const statuses: Record<string, StatusDefinition> = {
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
