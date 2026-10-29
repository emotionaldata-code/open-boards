import type { SymbolName } from '../ui/Icon';
import type { PresentationEvent } from './events';

export function eventSymbol(event: PresentationEvent): SymbolName {
  if (event.sounds.some((sound) => sound.name === 'heal')) return 'health';
  if (event.effects.some((effect) => effect.type === 'burst' || effect.type === 'attack'))
    return 'attack';
  if (event.effects.some((effect) => effect.type === 'shield')) return 'defense';
  if (event.effects.some((effect) => effect.type === 'move')) return 'move';
  if (event.sounds.some((sound) => sound.name === 'cards')) return 'cards';
  return 'notification';
}
