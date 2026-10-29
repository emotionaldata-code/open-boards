import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { basic, cardPresentation } from '@open-boards/content';
import { hookDescriptions } from './rules';
import sharp from 'sharp';
import { rasterForUrl } from '../artwork/assets';

it('illustrates every card and explains every authored timing without executable artwork', async () => {
  const illustrations = new Set<string>();
  for (const card of Object.values(basic.cards)) {
    const presentation = cardPresentation[card.id];
    const asset = rasterForUrl(presentation.art.image);
    expect(asset?.kind).toBe('card');
    const bytes = readFileSync(new URL(`../../public${asset!.url}`, import.meta.url));
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width! / metadata.height!).toBe(8 / 5);
    illustrations.add(bytes.toString('base64'));
    for (const ability of card.abilities ?? [])
      expect(hookDescriptions[ability.trigger]).toBeTruthy();
  }
  expect(illustrations.size).toBe(Object.keys(basic.cards).length);
});
