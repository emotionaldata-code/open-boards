import { compileRoster, type CharacterBundle } from './bundle';
import sherlockHolmes from './characters/sherlock-holmes.json';
import medusa from './characters/medusa.json';
import kingArthur from './characters/king-arthur.json';
import theGenie from './characters/the-genie.json';
import achilles from './characters/achilles.json';
import dracula from './characters/dracula.json';
import bigfoot from './characters/bigfoot.json';
import robinHood from './characters/robin-hood.json';
import bruceLee from './characters/bruce-lee.json';

// JSON literals are validated as engine Definitions at startup and by content tests.
const bundles = [
  medusa,
  theGenie,
  kingArthur,
  achilles,
  sherlockHolmes,
  dracula,
  bigfoot,
  robinHood,
  bruceLee,
] as CharacterBundle[];
export const { characters, cards, cardPresentation } = compileRoster(bundles);
export const defaultCharacter = 'medusa';
export function deckDefinitions(character = defaultCharacter): string[] {
  if (!Object.hasOwn(characters, character)) throw new Error('Choose a supported character.');
  return characters[character].deck.flatMap(({ card, count }) => Array<string>(count).fill(card));
}
