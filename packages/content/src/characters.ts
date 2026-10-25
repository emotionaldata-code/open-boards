import { compileRoster, type CharacterBundle } from './bundle';
import medusa from './characters/medusa.json';
import kingArthur from './characters/king-arthur.json';
import theGenie from './characters/the-genie.json';

// JSON literals are validated as engine Definitions at startup and by content tests.
const bundles = [medusa, theGenie, kingArthur] as CharacterBundle[];
export const { characters, cards, cardPresentation } = compileRoster(bundles);
export const defaultCharacter = 'medusa';
export function deckDefinitions(character = defaultCharacter): string[] {
  if (!Object.hasOwn(characters, character)) throw new Error('Choose a supported character.');
  return characters[character].deck.flatMap(({ card, count }) => Array<string>(count).fill(card));
}
