import { basic } from '@open-boards/content';
import { fighterLabel, type Fighter } from '@open-boards/game';
import type { ChoiceView } from '@open-boards/protocol';
import { contentText } from '../localization/text';
import { messageText } from '../ui/messages';

export function choiceLabel(option: ChoiceView['options'][number], fighters: Fighter[]): string {
  const object = option.object;
  if (object?.type === 'fighter') {
    const fighter = fighters.find((fighter) => fighter.id === object.id);
    if (fighter) {
      if (option.id === fighter.player) return option.label;
      const name = fighterLabel(fighter, basic);
      if (option.label === name || option.label.startsWith(`${name} · `))
        return contentText(name) + option.label.slice(name.length);
    }
    // A choose-player option contains a player's own name; leave it as supplied.
    if (!option.label.startsWith('Use ')) return option.label;
  }
  if (option.card) {
    const name = basic.cards[option.card.definition].name;
    if (option.label === name || option.label.startsWith(`${name} · `))
      return contentText(name) + option.label.slice(name.length);
  }
  return messageText(option.label);
}
