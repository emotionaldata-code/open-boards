import { expect, it } from 'vitest';
import { characters } from '@open-boards/content';
import { profiles } from './profiles';
import { figureSvg, illustratedCharacters } from './art';
import { abilityVisuals } from './marks';

it('gives every playable fighter distinct original artwork, flavor and an ability visual', () => {
  expect(Object.keys(profiles).sort()).toEqual(Object.keys(characters).sort());
  expect(illustratedCharacters.sort()).toEqual(Object.keys(characters).sort());
  expect(new Set(Object.keys(characters).map((id) => figureSvg(id))).size).toBe(
    Object.keys(characters).length,
  );
  for (const character of Object.keys(characters)) {
    expect(figureSvg(character)).not.toMatch(/script|href|foreignObject/i);
    expect(abilityVisuals[character]).toBeDefined();
  }
});

it('gives every main and repeated ally a visible owner-colored figure and a registered ability mark', () => {
  for (const character of Object.values(characters)) {
    for (const id of [character.id, ...(character.ally ? [character.ally.id] : [])]) {
      const svg = figureSvg(id, '#123abc');
      expect(svg).toContain('#123abc');
      expect(svg).not.toMatch(/script|href|foreignObject|undefined/i);
      expect(abilityVisuals[id]).toBeDefined();
    }
  }
});
