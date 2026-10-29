import { describe, expect, it } from 'vitest';
import { cardEligible } from '../fighters';
import { canPlayDefense } from '../card-defense';
import { validateDefinitions } from './validation';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';

function setup() {
  const defs = structuredClone(basic);
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}

describe('form declaration permissions and completed Maneuver hook', () => {
  it('checks status requirements for attacks, schemes and defenses, while discards remain unrestricted', () => {
    const h = setup();
    for (const card of ['strike', 'guard', 'prepare']) h.defs.cards[card].requiresStatus = 'burn';
    validateDefinitions(h.defs);
    expect(cardEligible(h.defs.cards.strike, h.fighter())).toBe(false);
    expect(canPlayDefense(h.state, h.fighter(), h.defs.cards.guard, h.defs)).toBe(false);
    h.state.players[0].hand[0].definition = 'prepare';
    const before = structuredClone(h.state);
    expect(
      h.run({ type: 'play-action', fighter: 'p0:main', card: h.state.players[0].hand[0].id }).ok,
    ).toBe(false);
    expect(h.state).toEqual(before);
    h.fighter().statuses.push({ id: 'burn', stacks: 1 });
    expect(cardEligible(h.defs.cards.strike, h.fighter())).toBe(true);
    expect(canPlayDefense(h.state, h.fighter(), h.defs.cards.guard, h.defs)).toBe(true);
    h.defs.cards.strike.requiresStatus = 'unknown';
    expect(() => validateDefinitions(h.defs)).toThrow('unknown required status');
  });
  it('fires once after Stay and once after finishing all allied movement, preserving nested reconnect choices', () => {
    const defs = structuredClone(basic);
    defs.characters.vanguard.ally = {
      id: 'helper',
      name: 'Helper',
      hp: 4,
      count: 1,
      attackType: 'melee',
    };
    defs.characters.vanguard.abilities = [
      {
        id: 'completed',
        name: 'Completed',
        description: 'After maneuvering.',
        trigger: 'after-maneuver',
        effects: [
          {
            type: 'choose-option',
            prompt: 'Completed',
            options: [
              { id: 'hurt', label: 'Take damage', effects: [{ type: 'damage', amount: 1 }] },
            ],
          },
        ],
      },
    ];
    const h = deckHarness(defs, ['vanguard', 'ranger']);
    h.apply({ type: 'maneuver' });
    h.apply({ type: 'move', fighter: 'p0:main', path: [] });
    expect(h.state.resolution.choice).toBeNull();
    h.apply({ type: 'finish-maneuver' });
    h.reconnect();
    expect(h.state.resolution.choice!.prompt).toBe('Completed');
    h.choose('hurt');
    expect(h.fighter().hp).toBe(14);
    h.apply({ type: 'maneuver' });
    h.apply({ type: 'finish-maneuver' });
    h.choose('hurt');
    expect(h.fighter().hp).toBe(13);
  });
});

describe('exact drawn subsets and selected deck transfers', () => {
  it('excludes extra cards drawn by reactions from the exact keep-and-return subset', () => {
    const h = setup();
    h.defs.cards.prepare.effects = [{ type: 'draw-and-keep', count: 3, keep: 1 }];
    h.defs.characters.vanguard.abilities = [
      {
        id: 'extra-draw',
        name: 'Extra draw',
        description: 'Draw once after drawing.',
        trigger: 'after-draw',
        limit: { scope: 'turn', count: 1 },
        effects: [{ type: 'draw', count: 1 }],
      },
    ];
    const expected = h.state.players[0].deck.slice(0, 3).map((c) => c.id),
      extra = h.state.players[0].deck[3].id;
    h.action('prepare');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(expected);
    expect(h.state.players[0].hand.some((c) => c.id === extra)).toBe(true);
    h.choose(expected[0]);
    h.choose(expected[2]);
    expect(h.state.players[0].hand.some((c) => c.id === extra)).toBe(true);
    expect(h.state.players[0].deck.slice(-2).map((c) => c.id)).toEqual([expected[2], expected[1]]);
  });
  it('runs ordinary draw hooks, preserves original hand cards, and keeps multiple selected cards after reconnect', () => {
    const h = setup();
    h.defs.cards.prepare.effects = [{ type: 'draw-and-keep', count: 4, keep: 2, upTo: true }];
    h.defs.characters.vanguard.abilities = [
      {
        id: 'draw-hook',
        name: 'Draw hook',
        description: 'Heal after drawing.',
        trigger: 'after-draw',
        effects: [{ type: 'heal', amount: 1 }],
      },
    ];
    h.fighter().hp = 10;
    const original = h.state.players[0].hand.slice(1).map((c) => c.id),
      drawn = h.state.players[0].deck.slice(0, 4).map((c) => c.id);
    h.action('prepare');
    h.choose('4');
    expect(h.fighter().hp).toBe(11);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(drawn);
    h.choose(drawn[0]);
    h.reconnect();
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(drawn.slice(1));
    h.choose(drawn[2]);
    h.choose(drawn[3]);
    expect(h.state.players[0].hand.map((c) => c.id)).toEqual([...original, drawn[0], drawn[2]]);
    expect(h.state.players[0].deck.slice(-2).map((c) => c.id)).toEqual([drawn[3], drawn[1]]);
  });
  it('choosing zero does not draw or exhaust; an oversized draw uses ordinary exhaustion and retains its actual subset', () => {
    const zero = setup();
    zero.defs.cards.prepare.effects = [{ type: 'draw-and-keep', count: 3, keep: 1, upTo: true }];
    zero.state.players[0].deck = [];
    zero.action('prepare');
    zero.choose('0');
    expect(zero.fighter().hp).toBe(15);
    const h = setup();
    h.defs.cards.prepare.effects = [{ type: 'draw-and-keep', count: 3, keep: 1 }];
    h.state.players[0].deck.splice(1);
    const actual = h.state.players[0].deck[0].id;
    h.action('prepare');
    expect(h.fighter().hp).toBe(11);
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.players[0].hand.some((c) => c.id === actual)).toBe(true);
  });
  it('reveals then transfers only the exact bound card without draw hooks or replacement', () => {
    const h = setup();
    h.defs.cards.prepare.effects = [
      {
        type: 'reveal-top-card',
        effects: [
          {
            type: 'choose-option',
            prompt: 'Reveal pause',
            options: [{ id: 'take', label: 'Take', effects: [{ type: 'take-selected-card' }] }],
          },
        ],
      },
    ];
    h.defs.characters.vanguard.abilities = [
      {
        id: 'draw-hook',
        name: 'Draw hook',
        description: 'Damage after drawing.',
        trigger: 'after-draw',
        effects: [{ type: 'damage', amount: 1 }],
      },
    ];
    const exact = structuredClone(h.state.players[0].deck[0]);
    h.action('prepare');
    h.reconnect();
    h.choose('take');
    expect(h.fighter().hp).toBe(15);
    expect(h.state.players[0].hand.some((c) => c.id === exact.id)).toBe(true);
    h.state.actions = 2;
    h.action('prepare');
    const moved = h.state.players[0].deck.shift()!,
      next = h.state.players[0].deck[0].id;
    h.state.players[0].discard.push(moved);
    h.choose('take');
    expect(h.state.players[0].deck[0].id).toBe(next);
    expect(h.state.players[0].hand.some((c) => c.id === moved.id)).toBe(false);
  });
  it('tag-filtered optional discards never offer other cards and apply receipts only for actual payments', () => {
    const h = setup();
    h.defs.cards.guard.tags = ['payment'];
    h.defs.cards.prepare.effects = [
      {
        type: 'discard',
        tag: 'payment',
        upTo: true,
        count: 100,
        onDiscard: [{ type: 'heal', amount: 2 }],
      },
    ];
    h.fighter().hp = 10;
    h.state.players[0].hand[1].definition = 'guard';
    h.state.players[0].hand[2].definition = 'strike';
    h.action('prepare');
    const c = h.state.resolution.choice!;
    expect(c.options.every((o) => h.defs.cards[o.card!.definition].tags?.includes('payment'))).toBe(
      true,
    );
    const before = structuredClone(h.state),
      illegal = h.state.players[0].hand.find((c) => c.definition === 'strike')!.id;
    expect(h.run({ type: 'choose', choice: c.id, options: [illegal] }).ok).toBe(false);
    expect(h.state).toEqual(before);
    h.apply({ type: 'choose', choice: c.id, options: [c.options[0].id] });
    expect(h.fighter().hp).toBe(12);
  });
});
