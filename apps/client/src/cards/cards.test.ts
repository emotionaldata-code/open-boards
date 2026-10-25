import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { basic, cardPresentation } from '@open-boards/content';
import { cardSvg } from './art';
import { hookDescriptions } from './rules';

it('illustrates every card and explains every authored timing without executable artwork', () => {
  const illustrations = new Set<string>();
  for (const card of Object.values(basic.cards)) {
    const presentation = cardPresentation[card.id];
    const svg = presentation.art.image
      ? readFileSync(new URL(`../../public${presentation.art.image}`, import.meta.url), 'utf8')
      : cardSvg(presentation);
    expect(svg).not.toMatch(/script|href|foreignObject|undefined/i);
    expect(svg).toContain('viewBox="0 0 320 200"');
    illustrations.add(svg);
    for (const ability of card.abilities ?? [])
      expect(hookDescriptions[ability.trigger]).toBeTruthy();
  }
  expect(illustrations.size).toBe(Object.keys(basic.cards).length);
});
