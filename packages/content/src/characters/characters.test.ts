import { describe, expect, it } from 'vitest';
import { validateDefinitions } from '@open-boards/game';
import { basic, characters, cardPresentation, deckDefinitions } from '../index';
import { compileRoster, type CharacterBundle } from '../bundle';
import medusa from './medusa.json';

describe('complete character bundles', () => {
  it('compiles serializable decks without visual metadata in engine rules', () => {
    expect(() => validateDefinitions(basic)).not.toThrow();
    expect(Object.keys(characters)).toEqual(['medusa', 'the-genie', 'king-arthur']);
    expect(JSON.parse(JSON.stringify(basic))).toEqual(basic);
    const owned = new Set<string>();
    for (const character of Object.values(characters)) {
      expect(deckDefinitions(character.id)).toHaveLength(30);
      expect(character.deck).toHaveLength(
        ({ medusa: 11, 'the-genie': 12, 'king-arthur': 16 } as Record<string, number>)[
          character.id
        ],
      );
      for (const { card, count } of character.deck) {
        expect(owned.has(card)).toBe(false);
        owned.add(card);
        expect(deckDefinitions(character.id).filter((id) => id === card)).toHaveLength(count);
        expect(cardPresentation[card].character).toBe(character.id);
        expect(basic.cards[card]).not.toHaveProperty('art');
        expect(basic.cards[card]).not.toHaveProperty('count');
      }
    }
    expect(owned.size).toBe(39);
    expect(() => deckDefinitions('ranger')).toThrow('supported character');
  });
  it('rejects duplicate definitions, invalid copies and unsafe artwork recipes', () => {
    const bundle = () => structuredClone(medusa) as CharacterBundle;
    expect(() => compileRoster([bundle(), bundle()])).toThrow('Duplicate character');
    const duplicate = bundle();
    duplicate.cards[1].id = duplicate.cards[0].id;
    expect(() => compileRoster([duplicate])).toThrow('Duplicate card');
    const invalid = bundle();
    invalid.cards[0].count = 0;
    expect(() => compileRoster([invalid])).toThrow('Invalid copies');
    const unsafe = bundle();
    unsafe.cards[0].art.image = 'javascript:alert(1)';
    expect(() => compileRoster([unsafe])).toThrow('Invalid artwork');
    const timing = bundle();
    timing.cards[0].abilities![0].trigger = 'turn-start';
    expect(() => compileRoster([timing])).toThrow('Unsupported card timing');
  });
});
