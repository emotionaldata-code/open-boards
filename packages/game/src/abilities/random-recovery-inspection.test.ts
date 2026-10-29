import { describe, expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { reachablePaths } from '../movement';
import { validateDefinitions, type Effect } from '../index';

function setup(effects: Effect[]) {
  const defs = structuredClone(basic);
  defs.cards.adapt.abilities = [
    {
      id: 'neutral-after',
      name: 'Neutral after',
      description: 'Neutral after',
      trigger: 'after-combat',
      effects,
    },
  ];
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}
function fight(h: ReturnType<typeof setup>) {
  h.attack('adapt');
  return h.defend('guard');
}
function seedAfter(seed: number) {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
}

describe('seeded settled recovery and privately targeted inspection', () => {
  it('recovers an exact settled card with one deterministic seed step and no draw hooks', () => {
    const h = setup([{ type: 'recover-card', random: true }]);
    h.defs.characters.vanguard.abilities = [
      {
        id: 'draw-observer',
        name: 'Draw observer',
        description: 'Draw observer',
        trigger: 'after-draw',
        effects: [{ type: 'damage', amount: 5 }],
      },
    ];
    const prior = [
      { id: 'old-a', definition: 'strike' },
      { id: 'old-b', definition: 'adapt' },
    ];
    h.state.players[0].discard = [...prior];
    const next = seedAfter(h.state.resolution.random);
    const expected = prior[Math.floor((next / 0x100000000) * prior.length)];
    h.reconnect();
    fight(h);
    expect(h.state.players[0].hand).toContainEqual(expected);
    expect(h.state.players[0].discard).not.toContainEqual(expected);
    expect(h.state.players[0].discard.filter((c) => c.id.startsWith('old-'))).toHaveLength(1);
    expect(h.state.players[0].discard.some((c) => c.definition === 'adapt')).toBe(true);
    expect(h.state.resolution.random).toBe(next);
    expect(h.fighter().hp).toBe(15);
    expect(h.state.resolution.choice).toBeNull();
  });
  it('does not recover its committed combat card or consume random on an empty prior discard', () => {
    const h = setup([{ type: 'recover-card', random: true }]);
    const seed = h.state.resolution.random;
    const hand = h.state.players[0].hand.length;
    fight(h);
    expect(h.state.players[0].hand).toHaveLength(hand - 1);
    expect(h.state.resolution.random).toBe(seed);
  });
  it('ordinary recovery excludes its still-resolving scheme without consuming a random step', () => {
    const h = setup([]);
    h.defs.cards.prepare.effects = [{ type: 'recover-card', random: true }];
    const seed = h.state.resolution.random;
    const card = h.state.players[0].hand[0].id;
    h.action('prepare');
    expect(h.state.players[0].hand.some((c) => c.id === card)).toBe(false);
    expect(h.state.players[0].discard.some((c) => c.id === card)).toBe(true);
    expect(h.state.resolution.random).toBe(seed);
  });
  it('privately orders only the exact top three opposing cards, retaining the untouched tail', () => {
    const h = setup([{ type: 'inspect-deck', target: 'opponent', count: 3, take: 0 }]);
    const deck = structuredClone(h.state.players[1].deck);
    fight(h);
    const choice = h.state.resolution.choice!;
    expect(choice.player).toBe('p0');
    expect(choice.options.map((o) => o.id)).toEqual(deck.slice(0, 3).map((c) => c.id));
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    expect(projectGame(h.state, null, true).choice).toBeNull();
    const before = structuredClone(h.state);
    for (const [actor, id] of [
      ['p1', deck[0].id],
      ['p0', deck[3].id],
    ]) {
      expect(h.run({ type: 'choose', choice: choice.id, options: [id] }, actor).ok).toBe(false);
      expect(h.state).toEqual(before);
    }
    h.reconnect();
    h.choose(deck[2].id);
    h.reconnect();
    h.choose(deck[0].id);
    expect(h.state.players[1].deck).toEqual([deck[2], deck[0], deck[1], ...deck.slice(3)]);
    expect(h.state.resolution.frames).toEqual({});
  });
  it('shows a singleton inspection privately and handles empty decks without exhaustion', () => {
    for (const count of [0, 1]) {
      const h = setup([{ type: 'inspect-deck', target: 'opponent', count: 3, take: 0 }]);
      h.state.players[1].deck = h.state.players[1].deck.slice(0, count);
      const deck = structuredClone(h.state.players[1].deck);
      fight(h);
      if (count) {
        expect(h.state.resolution.choice!.options.map((o) => o.card)).toEqual(deck);
        expect(projectGame(h.state, 'p1', false).choice).toBeNull();
        h.choose();
      }
      expect(h.state.players[1].deck).toEqual(deck);
      expect(h.fighter('p1:main').hp).toBe(15);
      expect(h.state.resolution.choice).toBeNull();
    }
  });
  it('strictly validates the new operation fields', () => {
    for (const effect of [
      { type: 'recover-card', random: 'yes' },
      { type: 'inspect-deck', target: 'invalid', count: 3, take: 0 },
      { type: 'lock-movement', all: 'yes' },
    ]) {
      const h = setup([]);
      h.defs.cards.prepare.effects = [effect as Effect];
      expect(() => validateDefinitions(h.defs)).toThrow();
    }
  });
  it.each(['revive-ally', 'summon-ally'] as const)(
    'global movement lock retains a later %s and resets at the turn boundary',
    (type) => {
      const h = setup([]);
      h.defs.characters.vanguard.ally = {
        id: 'guard',
        name: 'Guard',
        hp: 1,
        count: 1,
        attackType: 'melee',
        startsOffBoard: true,
      };
      // Start a fresh game so the reserve is part of the fixed fighter roster.
      const k = deckHarness(h.defs, ['vanguard', 'ranger']);
      k.fighter().position = 'n0';
      k.fighter('p1:main').position = 'n1';
      k.defs.cards.prepare.effects = [
        { type: 'lock-movement', all: true },
        type === 'revive-ally' ? { type, zone: 'any' } : { type, placement: 'adjacent' },
      ];
      k.action('prepare');
      while (k.state.resolution.choice) k.choose();
      const ally = k.fighter('p0:ally-1');
      expect(ally.defeated).toBe(false);
      expect(k.state.resolution.movementLocks).toContain(ally.id);
      expect(reachablePaths(k.state, ally, k.defs.map, 5)).toEqual({});
      k.apply({ type: 'maneuver' });
      k.apply({ type: 'finish-maneuver' });
      expect(k.state.turn).toBe(1);
      expect(k.state.resolution.movementLocks).toEqual([]);
      expect(Object.keys(reachablePaths(k.state, ally, k.defs.map, 5)).length).toBeGreaterThan(0);
    },
  );
});
