import type { Definitions } from '@open-boards/game';
import { characters, cards } from './characters';
import { statuses } from './statuses';
import { kingSolomonsMine } from './map';

export const basic: Definitions = { characters, cards, statuses, map: kingSolomonsMine };
export * from './characters';
export type { CardArtwork, CardPalette, CardPresentation, CharacterBundle } from './bundle';
export * from './layout';
export * from './map';
