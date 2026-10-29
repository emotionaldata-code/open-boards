import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { basic, cardPresentation } from '@open-boards/content';
import { hookDescriptions } from './rules';
import sharp from 'sharp';
import { rasterForUrl } from '../artwork/assets';

it('illustrates every card and explains every authored timing without executable artwork', async () => {
  const illustrations = new Map<string, string[]>();
  for (const card of Object.values(basic.cards)) {
    const presentation = cardPresentation[card.id];
    const asset = rasterForUrl(presentation.art.image);
    expect(asset?.kind).toBe('card');
    const bytes = readFileSync(new URL(`../../public${asset!.url}`, import.meta.url));
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width! / metadata.height!).toBe(8 / 5);
    const pixels = bytes.toString('base64');
    illustrations.set(pixels, [...(illustrations.get(pixels) ?? []), card.id]);
    for (const ability of card.abilities ?? [])
      expect(hookDescriptions[ability.trigger]).toBeTruthy();
  }
  // The three printed Into the Woods copies differ only in their basket symbol.
  expect(
    [...illustrations.values()].filter((ids) => ids.length > 1).map((ids) => ids.sort()),
  ).toEqual([
    [
      'little-red-into-the-woods-knife',
      'little-red-into-the-woods-pelt',
      'little-red-into-the-woods-wolfsbane',
    ],
  ]);
  expect(illustrations.size).toBe(Object.keys(basic.cards).length - 2);
});
