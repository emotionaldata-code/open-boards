import type { FighterDefinition, CardCategory } from '@open-boards/game';

export const attackTypeLabel: Record<FighterDefinition['attackType'], string> = {
  melee: 'Mischia',
  ranged: 'A distanza',
};

export const cardCategoryLabel: Record<CardCategory, string> = {
  attack: 'Attacco',
  defense: 'Difesa',
  versatile: 'Attacco / Difesa',
  action: 'Stratagemma',
};
