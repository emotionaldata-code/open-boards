import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import sharp from 'sharp';
import { cardPresentation } from '@open-boards/content';
import { fighterArtwork, rasterAssets, rasterForUrl } from './assets';

const importedArtwork: {
  character: string;
  ally: string | null;
  designs: number;
  artworks?: number;
}[] = [
  { character: 'nikola-tesla', ally: null, designs: 11 },
  { character: 'harry-houdini', ally: 'harry-houdini-bess', designs: 13 },
  { character: 'little-red', ally: 'little-red-huntsman', designs: 14, artworks: 12 },
  { character: 'beowulf', ally: 'beowulf-wiglaf', designs: 12 },
  { character: 'hamlet', ally: 'hamlet-rosencrantz-guildenstern', designs: 12 },
  { character: 'bloody-mary', ally: null, designs: 13 },
  { character: 'jekyll-hyde', ally: null, designs: 13 },
  { character: 'golden-bat', ally: null, designs: 12 },
  { character: 'sinbad', ally: 'sinbad-porter', designs: 16 },
  { character: 'darth-vader', ally: null, designs: 12 },
  { character: 'geralt-of-rivia', ally: 'geralt-of-rivia-dandelion', designs: 15 },
  { character: 'invisible-man', ally: null, designs: 14 },
  { character: 'sun-wukong', ally: 'sun-wukong-clone', designs: 12 },
  { character: 'eredin', ally: 'eredin-red-rider', designs: 11 },
  { character: 'bruce-lee', ally: null, designs: 17 },
  { character: 'yennefer-triss', ally: 'yennefer-triss-triss', designs: 11 },
  { character: 'alice', ally: 'alice-jabberwock', designs: 15 },
  { character: 'philippa', ally: 'philippa-dijkstra', designs: 13 },
  { character: 'achilles', ally: 'achilles-patroclus', designs: 12 },
  { character: 'dracula', ally: 'dracula-sister', designs: 13 },
  { character: 'bigfoot', ally: 'bigfoot-jackalope', designs: 11 },
  { character: 'the-genie', ally: null, designs: 12 },
  { character: 'robin-hood', ally: 'robin-hood-outlaw', designs: 11 },
  { character: 'medusa', ally: 'medusa-harpy', designs: 11 },
  { character: 'king-arthur', ally: 'king-arthur-merlin', designs: 16 },
  { character: 'sherlock-holmes', ally: 'sherlock-holmes-dr-watson', designs: 13 },
];

it.each(importedArtwork)(
  'ships $character with correctly sized, hashed derivatives and transparent tokens',
  async ({ character, ally, designs, artworks = designs }) => {
    const cards = Object.values(cardPresentation).filter((card) => card.character === character);
    expect(cards).toHaveLength(designs);
    for (const card of cards) expect(rasterForUrl(card.art.image)?.kind).toBe('card');
    const pilot = new Set(cards.map((card) => rasterForUrl(card.art.image)!));
    const fighters = ally ? [character, ally] : [character];
    for (const fighter of fighters) {
      expect(rasterAssets[fighterArtwork[fighter].portrait].kind).toBe('portrait');
      expect(rasterAssets[fighterArtwork[fighter].token].kind).toBe('token');
      pilot.add(rasterAssets[fighterArtwork[fighter].portrait]);
      pilot.add(rasterAssets[fighterArtwork[fighter].token]);
    }
    expect(pilot.size).toBe(artworks + fighters.length * 2);
    const sources = JSON.parse(
      await readFile(`artwork/characters/${character}/sources.json`, 'utf8'),
    ) as { id: string; anchor?: [number, number] }[];
    for (const asset of pilot) {
      const widths =
        asset.kind === 'card'
          ? [320, 640, 1280]
          : asset.kind === 'portrait'
            ? [256, 512, 1024]
            : [512];
      expect(asset.variants.map((variant) => variant.width)).toEqual(widths);
      expect(asset.url).toBe(asset.variants.at(-1)!.url);
      for (const variant of asset.variants) {
        const bytes = await readFile(new URL(`../../public${variant.url}`, import.meta.url));
        expect(bytes.length).toBe(variant.bytes);
        expect(variant.url).toContain(
          createHash('sha256').update(bytes).digest('hex').slice(0, 12),
        );
        const metadata = await sharp(bytes).metadata();
        expect(metadata).toMatchObject({
          format: 'webp',
          width: variant.width,
          height: variant.height,
        });
        if (asset.kind === 'token') {
          expect(metadata.hasAlpha).toBe(true);
          expect((await sharp(bytes).stats()).isOpaque).toBe(false);
          expect(asset.anchor).toEqual(
            sources.find((source) => rasterAssets[source.id] === asset)?.anchor,
          );
        }
      }
    }
  },
);
