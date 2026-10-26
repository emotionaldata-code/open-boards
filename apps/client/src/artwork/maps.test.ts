import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { boardSize } from '@open-boards/content';
import { expect, it } from 'vitest';
import sharp from 'sharp';
import { mapArtwork, rasterAssets } from './assets';

it('ships registered map scenery at the board aspect ratio without enlarging or cropping its master', async () => {
  const asset = rasterAssets[mapArtwork['king-solomons-mine']];
  const master = await sharp(
    new URL('../../../../artwork/maps/king-solomons-mine/masters/scenery.png', import.meta.url)
      .pathname,
  ).metadata();
  expect(asset.kind).toBe('map');
  expect(asset.variants.map(({ width }) => width)).toEqual([950, 1900]);
  expect(asset.url).toBe(asset.variants.at(-1)!.url);
  expect(
    Math.abs(master.width! / master.height! / (boardSize.width / boardSize.height) - 1),
  ).toBeLessThan(0.005);
  for (const variant of asset.variants) {
    const bytes = await readFile(new URL(`../../public${variant.url}`, import.meta.url));
    expect(variant.width / variant.height).toBe(boardSize.width / boardSize.height);
    expect(variant.width).toBeLessThanOrEqual(master.width!);
    expect(variant.height).toBeLessThanOrEqual(master.height!);
    expect(bytes.length).toBe(variant.bytes);
    expect(variant.url).toContain(createHash('sha256').update(bytes).digest('hex').slice(0, 12));
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: 'webp',
      width: variant.width,
      height: variant.height,
      hasAlpha: false,
    });
  }
});
