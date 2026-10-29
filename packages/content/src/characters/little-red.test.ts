import { describe, expect, it } from 'vitest';
import { canPlayDefense, validateDefinitions, type Command } from '@open-boards/game';
import { basic, characters, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/little-red/inventory.json';
import bundle from './little-red.json';

function setup() {
  const defs = structuredClone({
    ...basic,
    characters: { ...basic.characters, ...neutral.characters },
    cards: { ...basic.cards, ...neutral.cards },
  });
  const h = deckHarness(defs, ['little-red', 'vanguard']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.fighter('p0:ally-1').position = 'n20';
  return h;
}
function basket(h: ReturnType<typeof setup>, item: 'pelt' | 'knife' | 'wolfsbane' | 'wild') {
  const definition = {
    pelt: 'little-red-what-big-ears-you-have',
    knife: 'little-red-the-wolf-s-skin',
    wolfsbane: 'little-red-once-upon-a-time',
    wild: 'little-red-what-s-that-in-my-basket',
  }[item];
  h.state.players[0].discard.push({ id: `basket-${item}`, definition });
}
function privateChoice(h: ReturnType<typeof setup>) {
  const c = h.state.resolution.choice!;
  expect(c).toBeTruthy();
  expect(projectGame(h.state, c.player === 'p0' ? 'p1' : 'p0', false).choice).toBeNull();
  expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
  const before = structuredClone(h.state);
  const command: Command = { type: 'choose', choice: c.id, options: [c.options[0].id] };
  expect(h.run(command, c.player === 'p0' ? 'p1' : 'p0').ok).toBe(false);
  expect(h.run({ ...command, options: ['forged'] }, c.player).ok).toBe(false);
  expect(h.state).toEqual(before);
  h.reconnect();
}

describe('Little Red printed deck and live basket', () => {
  it('preserves 30 cards, twelve printed designs, fourteen symbol variants, stats and every BOOST', () => {
    validateDefinitions(basic);
    expect(characters['little-red']).toMatchObject({
      hp: 14,
      movement: 2,
      attackType: 'melee',
      ally: { hp: 9, count: 1, attackType: 'ranged' },
      discardBase: { tags: ['basket-wild'] },
    });
    expect(deckDefinitions('little-red')).toHaveLength(30);
    expect(characters['little-red'].deck).toHaveLength(14);
    expect(inventory.source.cards).toHaveLength(12);
    for (const source of inventory.source.cards) {
      const ids = deckDefinitions('little-red').filter(
        (id) => id === `little-red-${source.slug}` || id.startsWith(`little-red-${source.slug}-`),
      );
      expect(ids).toHaveLength(source.quantity);
      for (const id of ids)
        expect(basic.cards[id]).toMatchObject({
          boost: source.boost,
          value: source.value ?? 0,
          category: source.type === 'scheme' ? 'action' : source.type,
          usableBy: { 'LITTLE RED': 'MAIN', HUNTSMAN: 'ALLY', ANY: 'BOTH' }[source.characterName],
        });
    }
    for (const symbol of ['pelt', 'knife', 'wolfsbane'])
      expect(basic.cards[`little-red-into-the-woods-${symbol}`].tags).toEqual([`basket-${symbol}`]);
    expect(setup().state.players[0].discard).toEqual([]); // The non-card basket adds no card instance.
  });

  it.each(bundle.cards.filter((c) => c.usableBy !== 'BOTH'))(
    'rejects the wrong fighter for $name without mutation',
    (card) => {
      const h = setup();
      const wrong = card.usableBy === 'MAIN' ? 'p0:ally-1' : 'p0:main';
      h.fighter(wrong).position = 'n0';
      h.state.players[0].hand[0].definition = card.id;
      if (card.category === 'defense') h.attack('strike', 'p1:main', wrong);
      const before = structuredClone(h.state),
        instance = h.state.players[0].hand[0];
      const command: Command =
        card.category === 'action'
          ? { type: 'play-action', fighter: wrong, card: instance.id }
          : card.category === 'defense'
            ? { type: 'defend', card: instance.id }
            : { type: 'attack', fighter: wrong, target: 'p1:main', card: instance.id };
      expect(h.run(command).ok).toBe(false);
      expect(h.state).toEqual(before);
    },
  );

  it('supports legal two- and four-seat Huntsman deployments', () => {
    const h = deckHarness(basic, Array<string>(4).fill('little-red'));
    expect(h.state.phase.type).toBe('taking-actions');
    expect(h.state.fighters).toHaveLength(8);
    expect(new Set(h.state.fighters.map((f) => f.position)).size).toBe(8);
  });

  it.each(['pelt', 'knife', 'wolfsbane', 'wild'] as const)(
    'Never Leave the Path resolves only the %s basket option',
    (item) => {
      const h = setup();
      basket(h, item);
      const hand = h.state.players[0].hand.length;
      const hp = h.fighter('p1:main').hp;
      h.action('little-red-never-leave-the-path');
      if (item === 'wild') {
        privateChoice(h);
        h.choose('wolfsbane');
      } else if (item === 'pelt') {
        privateChoice(h);
        h.choose('n4');
      } else if (item === 'knife') {
        privateChoice(h);
        h.choose('p1:main');
      }
      if (item === 'wolfsbane' || item === 'wild') {
        expect(h.state.players[0].hand).toHaveLength(hand + 2);
        expect(h.state.actions).toBe(1);
        expect(h.fighter('p1:main').hp).toBe(hp);
      } else if (item === 'knife') {
        expect(h.state.players[0].hand).toHaveLength(hand - 1);
        expect(h.fighter('p1:main').hp).toBe(hp - 2);
      } else {
        expect(h.fighter().position).toBe('n4');
        expect(h.state.actions).toBe(2);
        expect(h.state.players[0].hand).toHaveLength(hand - 1);
      }
    },
  );

  it.each(['pelt', 'knife', 'wild'] as const)(
    'Wolf’s Skin uses the prior %s basket and excludes its own commitment',
    (item) => {
      const h = setup();
      basket(h, item);
      const count = h.state.players[0].hand.length;
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend('little-red-the-wolf-s-skin', 'p0');
      if (item === 'wild') h.choose('match');
      expect(h.state.players[0].hand).toHaveLength(count - 1 + (item === 'knife' ? 0 : 2));
    },
  );

  it.each([
    'the-wolf-s-skin',
    'what-a-terrible-big-mouth-you-have',
    'what-big-eyes-you-have',
    'stones-in-the-belly',
    'once-upon-a-time',
    'a-grimm-tale',
  ])('a wild basket may deliberately mismatch %s', (slug) => {
    const h = setup();
    basket(h, 'wild');
    const hand = h.state.players[0].hand.length;
    if (slug === 'a-grimm-tale') {
      h.fighter().hp = 5;
      h.action('little-red-' + slug, 'p0:ally-1');
      privateChoice(h);
      h.choose('different');
      expect(h.fighter().hp).toBe(7);
    } else if (['the-wolf-s-skin', 'what-a-terrible-big-mouth-you-have'].includes(slug)) {
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend('little-red-' + slug, 'p0');
      privateChoice(h);
      h.choose('different');
      expect(h.fighter('p1:main').hp).toBe(15);
      expect(h.state.players[0].hand).toHaveLength(hand - 1);
    } else {
      h.attack('little-red-' + slug);
      h.defend('guard');
      privateChoice(h);
      h.choose('different');
      expect(h.state.revealed?.damage).toBe(0);
      expect(h.fighter('p1:main').hp).toBe(15);
      expect(h.state.players[1].hand).toHaveLength(4);
    }
  });

  it('Big Mouth deals the opposing printed value, only with pelt', () => {
    const h = setup();
    basket(h, 'pelt');
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('little-red-what-a-terrible-big-mouth-you-have', 'p0');
    expect(h.fighter('p1:main').hp).toBe(11);
  });

  it.each(['knife', 'wild', 'pelt'] as const)(
    'Big Ears defense permission matches %s and is shared with the public view',
    (item) => {
      const h = setup();
      basket(h, item);
      const card = h.defs.cards['little-red-what-big-ears-you-have'];
      expect(canPlayDefense(projectGame(h.state, 'p0', false), h.fighter(), card, h.defs)).toBe(
        item !== 'pelt',
      );
      h.attack('little-red-what-big-eyes-you-have', 'p1:main', 'p0:main');
      if (item !== 'pelt') {
        h.defend(card.id, 'p0');
        expect(h.state.revealed?.damage).toBe(0); // Cancellation cannot undo the declaration.
      } else {
        h.state.players[0].hand[0].definition = card.id;
        const before = structuredClone(h.state);
        expect(h.run({ type: 'defend', card: h.state.players[0].hand[0].id }).ok).toBe(false);
        expect(h.state).toEqual(before);
      }
    },
  );

  it.each(['wolfsbane', 'pelt'] as const)(
    'Big Eyes cancels effects and ignores printed value only for %s',
    (item) => {
      const h = setup();
      basket(h, item);
      h.attack('little-red-what-big-eyes-you-have');
      h.defend('guard');
      expect(h.state.revealed?.damage).toBe(item === 'wolfsbane' ? 3 : 0);
    },
  );

  it('Large Hands optionally returns the exact top prior discard, then exposes the next basket', () => {
    const h = setup();
    basket(h, 'knife');
    basket(h, 'wolfsbane');
    const own = h.state.players[0].hand[0].id;
    h.attack('little-red-what-large-hands-you-have');
    h.defend();
    privateChoice(h);
    h.choose('top-card');
    privateChoice(h);
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual(['basket-wolfsbane']);
    h.choose();
    expect(h.state.players[0].hand.some((c) => c.id === 'basket-wolfsbane')).toBe(true);
    expect(h.state.players[0].discard.some((c) => c.id === own)).toBe(true);
  });

  it('Large Hands may return itself with a nonmatching basket', () => {
    const h = setup();
    basket(h, 'knife');
    const own = h.state.players[0].hand[0].id;
    h.attack('little-red-what-large-hands-you-have');
    h.defend();
    h.choose('return');
    expect(h.state.players[0].hand.some((c) => c.id === own)).toBe(true);
  });

  it.each([true, false])(
    'Grimm Tale heals Little Red for the correct amount (pelt=%s)',
    (matches) => {
      const h = setup();
      basket(h, matches ? 'pelt' : 'knife');
      h.fighter().hp = 5;
      h.action('little-red-a-grimm-tale', 'p0:ally-1');
      expect(h.fighter().hp).toBe(matches ? 9 : 7);
      expect(h.fighter('p0:ally-1').hp).toBe(9);
    },
  );

  it.each(['p0:main', 'p0:ally-1'])(
    'Stones uses the exact random discarded BOOST for %s',
    (fighter) => {
      const h = setup();
      basket(h, 'knife');
      h.fighter(fighter).position = 'n0';
      h.state.players[1].hand.forEach((c) => {
        c.definition = 'guard';
      });
      h.attack('little-red-stones-in-the-belly', fighter);
      h.reconnect();
      h.defend();
      expect(h.state.revealed?.damage).toBe(4);
      expect(h.state.players[1].discard.filter((c) => c.definition === 'guard')).toHaveLength(1);
    },
  );

  it('Stones adds to defense and Once Upon a Time deals exact opponent damage', () => {
    const h = setup();
    basket(h, 'knife');
    h.state.players[1].hand.forEach((c) => {
      c.definition = 'guard';
    });
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('little-red-stones-in-the-belly', 'p0');
    expect(h.state.revealed?.damage).toBe(0);
    const next = setup();
    basket(next, 'knife');
    next.attack('little-red-once-upon-a-time');
    next.defend('guard');
    expect(next.fighter('p1:main').hp).toBe(12);
  });

  it('Long Have I Sought You is six adjacent and four at ranged distance', () => {
    for (const adjacent of [true, false]) {
      const h = setup();
      h.fighter('p0:ally-1').position = 'n0';
      h.fighter('p1:main').position = adjacent ? 'n1' : 'n11';
      h.attack('little-red-long-have-i-sought-you', 'p0:ally-1');
      h.defend();
      expect(h.state.revealed?.damage).toBe(adjacent ? 6 : 4);
    }
  });

  it.each(['pelt', 'knife', 'wolfsbane'])(
    'Into the Woods moves and preserves its distinct %s discard symbol',
    (symbol) => {
      const h = setup();
      h.action(`little-red-into-the-woods-${symbol}`);
      privateChoice(h);
      h.choose('$stay');
      expect(h.state.actions).toBe(2);
      expect(h.defs.cards[h.state.players[0].discard.at(-1)!.definition].tags).toEqual([
        `basket-${symbol}`,
      ]);
    },
  );
});
