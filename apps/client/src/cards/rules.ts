import type { Hook } from '@open-boards/game';

/** Human timing labels, independent of the interpreter and its implementation. */
export const hookDescriptions: Record<Hook, string> = {
  'turn-start': 'At the start of your turn.',
  'turn-end': 'At the end of your turn.',
  'before-draw': 'Before cards are drawn.',
  'after-draw': 'After cards are drawn.',
  'maneuver-boosted': 'After boosting a Maneuver and resolving discard reactions.',
  'before-move': 'Before movement.',
  'after-move': 'After movement.',
  'before-attack': 'Before the defender decides; this effect stays private.',
  'after-attack': 'After your attack resolves.',
  'before-defense': 'Before defense is revealed; this effect stays private.',
  'after-defense': 'After your defense resolves.',
  'combat-reveal': 'When both combat cards are revealed.',
  'before-combat': 'After reveal, before combat damage.',
  'after-combat': 'After combat damage resolves.',
  'before-damage': 'Before damage is applied.',
  'after-damage': 'After damage is applied.',
  'before-heal': 'Before healing is applied.',
  'after-heal': 'After healing is applied.',
  'card-played': 'When the card is played.',
  'card-discarded': 'When the card is discarded.',
  eliminated: 'When you are eliminated.',
};
