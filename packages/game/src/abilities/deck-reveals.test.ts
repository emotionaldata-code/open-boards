import { expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { validateDefinitions } from './validation';
import type { Effect } from './vocabulary';

function setup() {
  const defs = structuredClone(basic);
  defs.cards.prepare.effects = [
    {
      type: 'reveal-top-card',
      effects: [
        {
          type: 'choose-option',
          prompt: 'Discard the revealed card?',
          options: [
            {
              id: 'discard',
              label: 'Discard',
              effects: [
                {
                  type: 'discard-selected-card',
                  onDiscard: [{ type: 'heal', amount: { card: 'selected', field: 'boost' } }],
                },
              ],
            },
            { id: 'keep', label: 'Keep', effects: [] },
          ],
        },
      ],
    },
  ];
  validateDefinitions(defs);
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().hp = 5;
  return h;
}
it('publicly reveals only the exact top instance through private choices and JSON recovery', () => {
  const h = setup(),
    top = structuredClone(h.state.players[0].deck[0]),
    other = h.state.players[0].deck[1];
  const outcomes = h.action('prepare');
  expect(outcomes.find((o) => o.type === 'hand-revealed')).toMatchObject({
    zone: 'deck',
    cards: [top],
    audience: 'all',
  });
  h.reconnect();
  for (const viewer of ['p0', 'p1', 'spectator']) {
    const view = projectGame(h.state, viewer, false);
    expect(view.observation?.cards).toEqual([top]);
    expect(JSON.stringify(view.observation)).not.toContain(other.id);
    if (viewer !== 'p0') expect(view.choice).toBeNull();
  }
  const before = structuredClone(h.state),
    choice = h.state.resolution.choice!;
  expect(h.run({ type: 'choose', choice: choice.id, options: ['discard'] }, 'p1').ok).toBe(false);
  expect(h.run({ type: 'choose', choice: choice.id, options: ['forged'] }).ok).toBe(false);
  expect(h.state).toEqual(before);
  h.choose('discard');
  expect(h.state.players[0].discard.some((c) => c.id === top.id)).toBe(true);
  expect(h.fighter().hp).toBe(7);
  expect(projectGame(h.state, 'p1', false).observation).toBeUndefined();
});
it('leaves the revealed instance on its deck when declined', () => {
  const h = setup(),
    top = h.state.players[0].deck[0];
  h.action('prepare');
  h.choose('keep');
  expect(h.state.players[0].deck[0]).toEqual(top);
  expect(h.fighter().hp).toBe(5);
});
it('never discards another instance or runs a receipt if the revealed card moved', () => {
  const h = setup();
  h.action('prepare');
  const top = h.state.players[0].deck.shift()!;
  h.state.players[0].hand.push(top);
  const next = h.state.players[0].deck[0];
  h.reconnect();
  h.choose('discard');
  expect(h.state.players[0].deck[0]).toEqual(next);
  expect(h.state.players[0].hand.some((c) => c.id === top.id)).toBe(true);
  expect(h.fighter().hp).toBe(5);
});
it('continues an empty-deck reveal without a fabricated card or discard receipt', () => {
  const h = setup();
  h.state.players[0].deck = [];
  const out = h.action('prepare');
  expect(out.some((o) => o.type === 'hand-revealed')).toBe(false);
  h.choose('discard');
  expect(h.fighter().hp).toBe(5);
});
it('rejects invalid reveal vocabulary', () => {
  for (const effect of [
    { type: 'reveal-top-card', effects: [{ type: 'execute-code' }] },
    { type: 'discard-selected-card', target: 'opponent' },
  ]) {
    const defs = structuredClone(basic);
    defs.cards.prepare.effects = [effect as Effect];
    expect(() => validateDefinitions(defs)).toThrow();
  }
});
