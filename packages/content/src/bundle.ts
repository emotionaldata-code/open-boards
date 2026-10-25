import type { CardDefinition, CharacterDefinition } from '@open-boards/game';

// Card hooks run only in the card/combat frame; lasting reactions belong on characters/statuses.
const cardHooks = [
  'before-attack',
  'before-defense',
  'combat-reveal',
  'before-combat',
  'after-combat',
  'after-attack',
  'after-defense',
  'card-played',
  'card-discarded',
];

export const cardScenes = [
  'shield',
  'blade',
  'bastion',
  'lantern',
  'trail',
  'fire',
  'embers',
  'ward',
  'bolt',
  'map',
] as const;
export interface CardArtwork {
  scene: (typeof cardScenes)[number];
  variant?: number;
  image?: string;
}
export interface CardPalette {
  ground: string;
  ink: string;
  accent: string;
}
export interface CardPresentation {
  character: string;
  art: CardArtwork;
  palette: CardPalette;
  flavor: string;
}
/** Authoring format: each character owns its card rules, copies and visual recipes. */
export type CharacterBundle = Omit<CharacterDefinition, 'deck'> & {
  palette: CardPalette;
  cards: (CardDefinition & { count: number; art: CardArtwork; flavor: string })[];
};

/** Composition only. The engine receives rules; rendering metadata stays outside Definitions. */
export function compileRoster(bundles: CharacterBundle[]) {
  const characters: Record<string, CharacterDefinition> = {};
  const cards: Record<string, CardDefinition> = {};
  const cardPresentation: Record<string, CardPresentation> = {};
  for (const { cards: entries, palette, ...character } of bundles) {
    if (Object.hasOwn(characters, character.id))
      throw new Error(`Duplicate character: ${character.id}`);
    for (const { count, art, flavor, ...card } of entries) {
      if (Object.hasOwn(cards, card.id)) throw new Error(`Duplicate card: ${card.id}`);
      if (!Number.isInteger(count) || count < 1 || count > 100)
        throw new Error(`Invalid copies: ${card.id}`);
      if (
        !cardScenes.includes(art.scene) ||
        (art.variant !== undefined &&
          (!Number.isInteger(art.variant) || art.variant < 0 || art.variant > 6)) ||
        (art.image !== undefined && !/^\/[a-z0-9/_-]+\.(svg|webp|png|jpg)$/i.test(art.image)) ||
        !Object.values(palette).every((color) => /^#[0-9a-f]{6}$/i.test(color))
      )
        throw new Error(`Invalid artwork: ${card.id}`);
      if (
        (card.category !== 'action' && card.effects?.length) ||
        card.abilities?.some(
          (ability) =>
            !cardHooks.includes(ability.trigger) ||
            (card.category === 'action' &&
              !['card-played', 'card-discarded'].includes(ability.trigger)),
        )
      )
        throw new Error(`Unsupported card timing: ${card.id}`);
      cards[card.id] = card;
      cardPresentation[card.id] = { character: character.id, palette, art, flavor };
    }
    characters[character.id] = {
      ...character,
      deck: entries.map(({ id, count }) => ({ card: id, count })),
    };
  }
  return { characters, cards, cardPresentation };
}
