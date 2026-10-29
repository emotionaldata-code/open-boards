import { expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { validateDefinitions } from './validation';

it('evaluates exact discarded-card BOOST for counter gains and clamps at the owning fighter maximum', () => {
  const defs = structuredClone(basic);
  defs.characters.vanguard.counters = { energy: { initial: 1, max: 3 } };
  defs.characters.ranger.counters = { energy: { initial: 0, max: 3 } };
  defs.cards.guard.boost = 7;
  defs.cards.prepare.effects = [
    {
      type: 'choose-player',
      relation: 'opponent',
      effects: [
        {
          type: 'discard',
          target: 'chosen',
          random: true,
          count: 1,
          onDiscard: [
            { type: 'counter', name: 'energy', amount: { card: 'selected', field: 'boost' } },
          ],
        },
      ],
    },
  ];
  validateDefinitions(defs);
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  for (const card of h.state.players[1].hand) card.definition = 'guard';
  h.action('prepare');
  h.reconnect();
  h.choose('p1');
  expect(h.fighter().counters.energy).toBe(3);
  expect(h.fighter('p1:main').counters).toEqual({ energy: 0 });
});
it('evaluates live counter expressions and preserves signed literals with clamping', () => {
  const defs = structuredClone(basic);
  defs.characters.vanguard.counters = { energy: { initial: 2, max: 5 } };
  defs.characters.ranger.counters = { energy: { initial: 0, max: 3 } };
  defs.cards.prepare.effects = [
    { type: 'counter', name: 'energy', amount: { stat: 'counter', name: 'energy' } },
    { type: 'counter', name: 'energy', amount: -3 },
  ];
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.action('prepare');
  expect(h.fighter().counters.energy).toBe(1);
});
it('mandatory single-card combat BOOST exposes no Skip and rejects illegal responses without mutation', () => {
  const defs = structuredClone(basic);
  defs.cards.strike.abilities = [
    {
      id: 'boost',
      name: 'Boost',
      description: 'Mandatory BOOST',
      trigger: 'before-combat',
      effects: [{ type: 'boost-combat', optional: false }],
    },
  ];
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.attack('strike');
  h.defend('guard');
  const c = h.state.resolution.choice!,
    before = structuredClone(h.state);
  expect(c.options.some((o) => o.id === '$skip')).toBe(false);
  expect(h.run({ type: 'choose', choice: c.id, options: ['$skip'] }).ok).toBe(false);
  expect(h.state).toEqual(before);
  h.reconnect();
  const p = h.state.players[0].hand[0],
    boost = defs.cards[p.definition].boost;
  h.choose(p.id);
  expect(h.state.revealed?.damage).toBe(1 + boost);
});
