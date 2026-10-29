import { expect, it } from 'vitest';
import { validateDefinitions, type Ability, type Condition } from '../index';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { condition } from './conditions';
import { projectGame } from '../../../../apps/server/src/transport/projection';

const ability = (
  trigger: Ability['trigger'],
  effects: Ability['effects'],
  when?: Condition,
): Ability => ({
  id: 'test-rule',
  name: 'Test rule',
  description: 'Test rule',
  trigger,
  effects,
  ...(when ? { when } : {}),
});
function setup() {
  const defs = structuredClone(basic);
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}

it('records positive applied damage throughout a seat turn, ignores prevention and resets before next turn hooks', () => {
  const h = setup();
  h.defs.cards.prepare.effects = [{ type: 'damage', amount: 0 }];
  h.action('prepare');
  expect(h.state.resolution.damaged).toBeUndefined();
  h.state.actions = 2;
  h.attack('strike', 'p1:main', 'p0:main');
  h.defend('guard', 'p0');
  expect(h.state.resolution.damaged).toContain('p0:main');
  h.state.actions = 1;
  h.action('prepare', 'p1:main');
  expect(h.state.resolution.damaged).toEqual([]);
  const frame = Object.keys(h.state.resolution.frames).map(Number)[0];
  expect(
    condition(h.state, h.defs, { frame, owner: 'p0:main' }, { type: 'damaged-this-turn' }),
  ).toBe(false);
});

it('a prevented damage operation never satisfies damaged-this-turn even if the fighter has missing health', () => {
  const h = setup();
  h.fighter().hp = 3;
  h.defs.characters.vanguard.abilities = [ability('before-damage', [{ type: 'cancel' }])];
  h.defs.cards.prepare.effects = [{ type: 'damage', amount: 3 }];
  h.action('prepare');
  expect(h.fighter().hp).toBe(3);
  expect(h.state.resolution.damaged).toBeUndefined();
});

it('Maneuver draw reason supports a single replaced draw and preserves exhaustion semantics', () => {
  const h = setup();
  h.defs.characters.vanguard.abilities = [
    ability('before-draw', [{ type: 'modify', field: 'amount', amount: 1 }], {
      type: 'draw-reason',
      reason: 'maneuver',
    }),
  ];
  validateDefinitions(h.defs);
  h.state.players[0].deck = h.state.players[0].deck.slice(0, 1);
  h.apply({ type: 'maneuver' });
  expect(h.fighter().hp).toBe(13);
  expect(h.state.players[0].deck).toHaveLength(0);
  h.apply({ type: 'finish-maneuver' });
});

it('bottom hand cycling is private, ordered, survives reconnect and accepts a zero draw', () => {
  const h = setup();
  h.defs.cards.prepare.effects = [
    { type: 'return-to-deck', destination: 'bottom', count: 100, upTo: true, redraw: 'up-to' },
  ];
  validateDefinitions(h.defs);
  h.action('prepare');
  const cards = h.state.resolution.choice!.options.filter((o) => o.card);
  h.choose(cards[1].id);
  h.reconnect();
  expect(projectGame(h.state, 'p1', false).choice).toBeNull();
  expect(JSON.stringify(projectGame(h.state, 'p1', false))).not.toContain('ordered');
  h.choose(cards[0].id);
  h.choose('$done');
  expect(h.state.players[0].deck.slice(-2).map((c) => c.id)).toEqual([cards[1].id, cards[0].id]);
  h.choose('0');
  expect(h.state.players[0].hand).toHaveLength(2);
});

it('source-card discard receipts recover exact instances even after another card reaches discard', () => {
  const h = setup();
  h.defs.cards.strike.abilities = [
    ability('before-combat', [{ type: 'discard-deck', count: 1 }]),
    {
      ...ability('after-combat', [{ type: 'recover-card', discardedByCard: true }]),
      id: 'return-rule',
    },
  ];
  h.defs.cards.guard.abilities = [
    ability('after-combat', [{ type: 'discard', target: 'opponent', count: 1, random: true }]),
  ];
  h.state.players[0].deck[0].definition = 'strike';
  const top = structuredClone(h.state.players[0].deck[0]);
  h.attack('strike');
  h.defend('guard');
  expect(h.state.players[0].hand.some((c) => c.id === top.id)).toBe(true);
  expect(h.state.players[0].discard.filter((c) => c.id === top.id)).toHaveLength(0);
});

it('dynamic movement uses the actual combat amount after damage prevention', () => {
  const h = setup();
  h.defs.cards.strike.abilities = [
    ability('after-combat', [{ type: 'move', target: 'opponent', distance: { event: 'amount' } }]),
  ];
  h.defs.characters.ranger.abilities = [
    ability('before-damage', [{ type: 'modify', field: 'amount', amount: -2 }]),
  ];
  validateDefinitions(h.defs);
  h.attack('strike');
  h.defend(null);
  expect(h.state.revealed?.damage).toBe(2);
  const c = h.state.resolution.choice!;
  const frame = h.state.resolution.frames[c.frame];
  expect(frame.kind === 'combat' && frame.amount).toBe(2);
  for (const tasks of Object.values(c.continuations)) {
    const move = tasks.find((t) => t.type === 'operation');
    if (move?.type === 'operation' && move.operation.kind === 'move')
      expect(move.operation.path.length).toBeLessThanOrEqual(2);
  }
  h.choose('$stay');
});

it('rejects invalid cycling variants and nonnumeric movement expressions', () => {
  const defs = structuredClone(basic);
  for (const effect of [
    { type: 'return-to-deck', count: 2, random: true, upTo: true },
    { type: 'return-to-deck', count: 2, random: true, redraw: 'up-to' },
    { type: 'return-to-deck', count: 2, redraw: 'all' },
    { type: 'move', distance: { event: 'unsupported' } },
  ]) {
    defs.cards.prepare.effects = [effect] as never;
    expect(() => validateDefinitions(defs)).toThrow();
  }
});
