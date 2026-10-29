import { expect, it } from 'vitest';
import { characters } from '@open-boards/content';
import { profiles } from './profiles';
import { fighterArtwork, rasterAssets } from '../artwork/assets';
import { abilityVisuals } from './marks';

it('gives every playable fighter distinct original artwork, flavor and an ability visual', () => {
  expect(Object.keys(profiles).sort()).toEqual(Object.keys(characters).sort());
  for (const character of Object.keys(characters)) {
    expect(abilityVisuals[character]).toBeDefined();
  }
});

it('gives every hero and ally raster artwork and a registered ability mark', () => {
  for (const character of Object.values(characters)) {
    for (const id of [character.id, ...(character.ally ? [character.ally.id] : [])]) {
      const art = fighterArtwork[id];
      expect(rasterAssets[art.portrait].kind).toBe('portrait');
      expect(rasterAssets[art.token].kind).toBe('token');
      expect(abilityVisuals[id]).toBeDefined();
    }
  }
});
