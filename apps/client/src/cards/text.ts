import { basic, cardPresentation } from '@open-boards/content';
import { contentText } from '../localization/text';

// Display copy only. Authored rules and their executable effects stay in the content bundle.
const concise: Record<string, string> = {
  'sherlock-holmes-confirm-suspicion':
    'Choose an opponent and name a combat value. They discard a matching card; their hero takes damage equal to its BOOST. If none match, they reveal their hand.',
  'sherlock-holmes-deduce-strategy':
    'During combat: You may set the opposing card’s printed value to its BOOST (0 if absent).',
  'sherlock-holmes-elementary':
    'Play face up. Predict the attack’s printed value. During combat: If correct, cancel its effects and ignore its attack value.',
  'king-arthur-noble-sacrifice':
    'During combat: You may BOOST this attack, in addition to Arthur’s ability.',
  'king-arthur-the-holy-grail': 'After combat: If Arthur has 1–4 health, set his health to 8.',
  'king-arthur-the-lady-of-the-lake':
    'Find Excalibur in your deck or discard pile and add it to your hand. Shuffle if you searched your deck.',
  'king-arthur-prophecy':
    'Look at your top 4 cards. Keep 2; return the others to the top in any order.',
  'king-arthur-bewilderment':
    'During combat: Prevent all damage. After combat: You may place your fighter in any space.',
  'king-arthur-restless-spirits':
    'Choose a space in Merlin’s zone and one adjacent space. Deal 2 damage to each enemy there. If any are defeated, draw 1 card.',
  'king-arthur-command-the-storms': 'Move every fighter up to 3 spaces, including enemies.',
  'king-arthur-momentous-shift':
    'During combat: If your fighter started this turn in another space, this card’s value is 5.',
  'medusa-winged-frenzy':
    'Move each of your fighters up to 3 spaces, through enemies. Then return a defeated Harpy to any space in Medusa’s zone.',
  'achilles-under-achilles-helm':
    'Immediately: If Patroclus is alive, Achilles may swap spaces with him. Patroclus becomes the defender.',
  'achilles-test-for-weakness':
    'After combat: Make a second attack against the same fighter with a value of 3.',
  'dracula-do-my-bidding':
    'Immediately: Return the attack card to your opponent’s hand. Look at their hand and choose an attack or versatile card to replace it. You may choose the same card.',
  'dracula-feeding-frenzy':
    'During combat: +1 value for each Sister sharing a zone with the opposing fighter.',
  'dracula-beastform': 'During combat: You may discard cards. +1 value for each card discarded.',
  'dracula-look-into-my-eyes': 'During combat: Add the attack card’s BOOST to this card’s defense.',
  'dracula-prey-upon':
    'Deal 1 damage to each enemy adjacent to Dracula. Recover 1 health per damage dealt.',
  'dracula-ravening-seduction':
    'Move any fighter up to 2 spaces. Then deal them 1 damage per adjacent Sister.',
  'the-genie-three-wishes':
    'Gain 1 action. Choose one:\n• Draw 5 cards.\n• Your cards have a fixed value of 4 this turn.\n• Each opponent discards 2 cards.',
};
const timing: Record<string, string> = {
  'before-attack': 'Before attacking',
  'before-defense': 'Before defending',
  'combat-reveal': 'Immediately',
  'before-combat': 'During combat',
  'after-combat': 'After combat',
  'after-attack': 'After attacking',
  'after-defense': 'After defending',
};

export function cardText(id: string): string {
  const card = basic.cards[id];
  const text = concise[id] ?? card.description;
  if (!text) return '';
  // Some source decks omit the timing label; retain that essential rule on the card itself.
  const triggers = [...new Set(card.abilities?.map((ability) => ability.trigger) ?? [])];
  const prefix = triggers.length === 1 ? timing[triggers[0]] : undefined;
  return prefix && !/immediately:|combat:|attack:|defen[cs]e:/i.test(text)
    ? `${contentText(prefix)}: ${contentText(text)}`
    : contentText(text);
}

export function cardFighter(id: string): string {
  const card = basic.cards[id];
  const character = basic.characters[cardPresentation[id].character];
  if (card.requiresStatus)
    return contentText(basic.statuses?.[card.requiresStatus]?.name ?? card.requiresStatus);
  if (card.fighter)
    return contentText(
      card.fighter === character.ally?.id
        ? character.ally.name
        : (character.heroSelection?.mainName ?? character.name),
    );
  return card.usableBy === 'BOTH'
    ? 'Qualsiasi combattente'
    : card.usableBy === 'ALLY'
      ? contentText(character.ally?.name ?? 'Alleato')
      : contentText(character.name);
}
