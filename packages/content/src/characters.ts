import goldenBat from './characters/golden-bat.json';
import jekyllHyde from './characters/jekyll-hyde.json';
import bloodyMary from './characters/bloody-mary.json';
import hamlet from './characters/hamlet.json';
import beowulf from './characters/beowulf.json';
import harryHoudini from './characters/harry-houdini.json';
import littleRed from './characters/little-red.json';
import nikolaTesla from './characters/nikola-tesla.json';
import sunWukong from './characters/sun-wukong.json';
import yenneferTriss from './characters/yennefer-triss.json';
import eredin from './characters/eredin.json';
import darthVader from './characters/darth-vader.json';
import invisibleMan from './characters/invisible-man.json';
import geraltOfRivia from './characters/geralt-of-rivia.json';
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
import alice from './characters/alice.json';
import philippa from './characters/philippa.json';
import sinbad from './characters/sinbad.json';

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
  invisibleMan,
  geraltOfRivia,
  darthVader,
  alice,
  yenneferTriss,
  philippa,
  eredin,
  sunWukong,
  sinbad,
  nikolaTesla,
  harryHoudini,
  littleRed,
  beowulf,
  hamlet,
  bloodyMary,
  jekyllHyde,
  goldenBat,
] as CharacterBundle[];
export const { characters, cards, cardPresentation } = compileRoster(bundles);
export const defaultCharacter = 'medusa';
export function deckDefinitions(character = defaultCharacter): string[] {
  if (!Object.hasOwn(characters, character)) throw new Error('Choose a supported character.');
  return characters[character].deck.flatMap(({ card, count }) => Array<string>(count).fill(card));
}
