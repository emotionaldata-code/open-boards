import { expect, it } from 'vitest';
import { basic } from '@open-boards/content';
import italian from './it.json';
import { contentText } from './text';
import { cardText } from '../cards/text';

it('covers every authored card, character, ability, status and choice in the current roster', () => {
  const copy = new Set(['name', 'description', 'prompt', 'label', 'mainName']);
  const missing = new Set<string>();
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    for (const [key, field] of Object.entries(value)) {
      if (copy.has(key) && typeof field === 'string' && field) {
        if (!Object.hasOwn(italian, field)) missing.add(field);
      } else if (field && typeof field === 'object') visit(field);
    }
  }
  visit(basic);
  expect([...missing]).toEqual([]);
});

it('preserves printed numbers, optional copy and unknown content', () => {
  for (const [source, translated] of Object.entries(italian)) {
    expect(translated.trim(), source).not.toBe('');
    expect(translated.match(/\d+/g) ?? [], source).toEqual(source.match(/\d+/g) ?? []);
  }
  expect(contentText('Harpy 3')).toBe('Arpia 3');
  expect(contentText(undefined)).toBeUndefined();
  expect(contentText('Unknown custom hero')).toBe('Unknown custom hero');
  expect(contentText('constructor')).toBe('constructor');
});

it('retains card timing and rules in the localized concise descriptions', () => {
  expect(cardText('king-arthur-noble-sacrifice')).toBe(
    'Durante il combattimento: puoi potenziare questo attacco con un BOOST, oltre all’abilità di Artù.',
  );
  expect(cardText('medusa-winged-frenzy')).toContain('Poi riporta un’Arpia sconfitta');
  expect(cardText('the-genie-three-wishes')).toContain('• Ogni avversario scarta 2 carte.');
});
