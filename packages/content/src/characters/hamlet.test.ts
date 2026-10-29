import { describe, expect, it } from 'vitest';
import { validateDefinitions } from '@open-boards/game';
import { basic, characters, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/hamlet/inventory.json';

function setup(roster = ['hamlet', 'vanguard']) {
  const defs = structuredClone({
    ...basic,
    characters: { ...basic.characters, ...neutral.characters },
    cards: { ...basic.cards, ...neutral.cards },
  });
  const h = deckHarness(defs, roster);
  if (h.state.resolution.choice?.options.some((o) => o.id === 'to-be')) h.choose('to-be');
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.fighter('p0:ally-1').position = 'n4';
  return h;
}

describe('Hamlet printed deck', () => {
  it('preserves all 30 copies, 12 designs, printed rules and fighter restrictions', () => {
    validateDefinitions(basic);
    expect(characters.hamlet).toMatchObject({
      hp: 15,
      movement: 2,
      attackType: 'melee',
      ally: { id: 'hamlet-rosencrantz-guildenstern', hp: 6, count: 1, attackType: 'melee' },
    });
    expect(deckDefinitions('hamlet')).toHaveLength(30);
    expect(characters.hamlet.deck).toHaveLength(12);
    for (const c of inventory.cards) {
      expect(basic.cards[c.id]).toMatchObject({
        id: c.id,
        name: c.name,
        category: c.category,
        usableBy: c.usableBy,
        value: c.value,
        boost: c.boost,
      });
      expect(deckDefinitions('hamlet').filter((id) => id === c.id)).toHaveLength(c.count);
      for (const text of Object.values(c.sourceRules))
        expect(basic.cards[c.id].description).toContain(text);
    }
  });
  it('TO BE draws exactly one extra Maneuver card for the shared owner', () => {
    const h = setup(),
      before = h.state.players[0].hand.length;
    h.apply({ type: 'maneuver' });
    expect(h.state.players[0].hand).toHaveLength(before + 2);
    h.apply({ type: 'finish-maneuver' });
    expect(h.state.players[0].hand).toHaveLength(before + 2);
  });
  it('TO BE does not alter other draws', () => {
    const h = setup(),
      before = h.state.players[0].hand.length;
    h.action('prepare');
    expect(h.state.players[0].hand).toHaveLength(before + 1);
  });
  it.each(['p0:main', 'p0:ally-1'])(
    'NOT TO BE pays exactly two damage to %s, with private reconnect choice',
    (fighter) => {
      const h = setup();
      h.state.actions = 1;
      h.action('prepare');
      h.state.actions = 1;
      h.action('prepare', 'p1:main');
      expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['to-be', 'not-to-be']);
      h.choose('not-to-be');
      h.reconnect();
      expect(projectGame(h.state, 'p1', false).choice).toBeNull();
      const hp = h.fighter(fighter).hp;
      h.choose(fighter);
      expect(h.fighter(fighter).hp).toBe(hp - 2);
      expect(h.fighter().counters['not-to-be']).toBe(1);
      expect(h.state.resolution.damaged).toContain(fighter);
    },
  );
  it('NOT TO BE modifies Hamlet attacks and leaves ally attacks and Maneuver unchanged', () => {
    const h = setup();
    h.fighter().counters['not-to-be'] = 1;
    h.attack('hamlet-uncertain-doom');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(1);
    h.fighter('p0:ally-1').position = 'n0';
    h.fighter().position = 'n4';
    h.attack('hamlet-uncertain-doom', 'p0:ally-1');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(0);
  });
  it('Cruel To Be Kind permits a private BOOST and respects cancellation', () => {
    const h = setup();
    h.attack('hamlet-cruel-to-be-kind');
    h.defend('guard');
    const c = h.state.resolution.choice!;
    expect(c.options.some((o) => o.card)).toBe(true);
    h.reconnect();
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    const card = c.options.find((o) => o.card)!;
    const boost = h.defs.cards[card.card!.definition].boost;
    h.choose(card.id);
    expect(h.state.revealed?.damage).toBe(Math.max(0, 2 + boost - 3));
    const other = setup();
    other.attack('hamlet-cruel-to-be-kind');
    other.defend('robin-hood-feint');
    expect(other.state.resolution.choice).toBeNull();
  });
  it('Uncertain Doom ignores a versatile defense but retains ordinary defense', () => {
    const h = setup();
    h.attack('hamlet-uncertain-doom');
    h.defend('hamlet-the-readiness-is-all');
    expect(h.state.revealed?.damage).toBe(2);
  });
  it('To Sleep moves the opponent up to actual combat damage and heals Hamlet after an ally loss', () => {
    const h = setup();
    h.attack('hamlet-to-sleep-perchance-to-dream');
    h.defend(null);
    expect(h.state.revealed?.damage).toBe(3);
    expect(h.state.resolution.choice!.prompt).toContain('destination');
    h.choose('$stay');
    h.fighter().hp = 10;
    h.fighter().position = 'n4';
    h.fighter('p0:ally-1').position = 'n0';
    h.attack('hamlet-to-sleep-perchance-to-dream', 'p0:ally-1');
    h.defend('guard');
    expect(h.fighter().hp).toBe(11);
    expect(h.fighter('p0:ally-1').hp).toBe(6);
  });
  it('Readiness places either combat fighter and locks it for the rest of the current turn', () => {
    const h = setup();
    h.attack('hamlet-the-readiness-is-all');
    h.defend('guard');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['p0:main', 'p1:main']);
    h.choose('p1:main');
    const dest = h.state.resolution.choice!.options.find((o) => o.id !== 'n1')!.id;
    h.choose(dest);
    expect(h.fighter('p1:main').position).toBe(dest);
    expect(h.state.resolution.movementLocks).toContain('p1:main');
  });
  it('The Play’s The Thing heals Hamlet for the exact random discarded BOOST only after a win', () => {
    const h = setup();
    h.fighter().hp = 8;
    h.state.players[1].hand.forEach((c) => (c.definition = 'hamlet-cruel-to-be-kind'));
    h.attack('hamlet-the-plays-the-thing');
    h.defend(null);
    expect(h.fighter().hp).toBe(12);
    expect(h.state.players[1].discard.at(-1)?.definition).toBe('hamlet-cruel-to-be-kind');
  });
  it('Blood Will Have Blood observes actual damage earlier in the same seat turn', () => {
    const h = setup();
    h.state.resolution.damaged = ['p0:main'];
    h.attack('hamlet-blood-will-have-blood');
    h.defend('guard');
    expect(h.fighter('p1:main').hp).toBe(14);
    const clean = setup();
    clean.fighter().hp = 8;
    clean.attack('hamlet-blood-will-have-blood');
    clean.defend('guard');
    expect(clean.fighter('p1:main').hp).toBe(15);
  });
  it('Blood Will Have Blood includes damage from the resolving defense combat', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('hamlet-blood-will-have-blood', 'p0');
    expect(h.fighter().hp).toBe(13);
    expect(h.fighter('p1:main').hp).toBe(14);
  });
  it('Outrageous Fortune returns only its exact discarded instance after losing', () => {
    const h = setup();
    h.state.players[0].deck[0].definition = 'hamlet-blood-will-have-blood';
    const top = structuredClone(h.state.players[0].deck[0]);
    h.attack('hamlet-outrageous-fortune');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(0);
    expect(h.state.players[0].hand.some((c) => c.id === top.id)).toBe(true);
    expect(h.state.players[0].discard.some((c) => c.id === top.id)).toBe(false);
  });
  it('Outrageous Fortune adds discarded BOOST to defense and keeps it discarded on a win', () => {
    const h = setup();
    h.state.players[0].deck[0].definition = 'hamlet-cruel-to-be-kind';
    const top = h.state.players[0].deck[0].id;
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('hamlet-outrageous-fortune', 'p0');
    expect(h.state.revealed?.damage).toBe(0);
    expect(h.state.players[0].discard.some((c) => c.id === top)).toBe(true);
  });
  it('Maddening Insight uses remaining hand size and makes the opponent choose a discard on a win', () => {
    const h = setup(),
      hand = h.state.players[0].hand.length;
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('hamlet-maddening-insight', 'p0');
    const combat = h.state.resolution.frames[h.state.resolution.combat!];
    expect(combat.kind === 'combat' && combat.defense).toBe(hand - 1);
    expect(h.state.resolution.choice?.player).toBe('p1');
    h.choose();
  });
  it('The Rest Is Silence ends the active opponent’s turn after defense', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('hamlet-the-rest-is-silence', 'p0');
    expect(h.state.players[h.state.turn].id).toBe('p0');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['to-be', 'not-to-be']);
    expect(h.state.resolution.damaged).toEqual([]);
  });
  it('Nothing Either Good Or Bad damages the exact opposing fighter only for a versatile attack', () => {
    const h = setup();
    h.attack('hamlet-blood-will-have-blood', 'p1:main', 'p0:main');
    h.defend('hamlet-nothing-either-good-or-bad', 'p0');
    expect(h.fighter('p1:main').hp).toBe(13);
  });
  it('Method In The Madness returns privately in bottom order, permits fewer draws and gains one action', () => {
    const h = setup(),
      hand = h.state.players[0].hand.map((c) => c.id);
    h.action('hamlet-method-in-the-madness');
    h.choose(hand[1]);
    h.reconnect();
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    h.choose(hand[2]);
    h.choose('$done');
    expect(h.state.players[0].deck.slice(-2).map((c) => c.id)).toEqual([hand[1], hand[2]]);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['0', '1', '2']);
    h.choose('1');
    expect(h.state.actions).toBe(2);
    expect(h.state.players[0].hand).toHaveLength(hand.length - 2);
  });
  it('Method permits zero returned cards, gives its action and rejects forged choices atomically', () => {
    const h = setup();
    h.action('hamlet-method-in-the-madness');
    const c = h.state.resolution.choice!,
      before = structuredClone(h.state);
    expect(h.run({ type: 'choose', choice: c.id, options: ['bogus'] }).ok).toBe(false);
    expect(h.state).toEqual(before);
    h.choose('$done');
    expect(h.state.actions).toBe(2);
    expect(h.state.resolution.choice).toBeNull();
  });
  it.each(['heal', 'place'])('The Ghost resolves %s using Hamlet as the recipient', (pick) => {
    const h = setup();
    h.fighter().hp = 8;
    h.action('hamlet-the-ghost');
    h.choose(pick);
    if (pick === 'place') {
      h.choose('n0');
      expect(h.state.actions).toBe(2);
    } else expect(h.fighter().hp).toBe(10);
  });
  it('deploys complete fighters at four seats', () => {
    const h = setup(['hamlet', 'hamlet', 'hamlet', 'hamlet']);
    expect(h.state.fighters.filter((f) => f.position !== null)).toHaveLength(8);
    expect(h.state.fighters.filter((f) => f.role === 'ally')).toHaveLength(4);
  });
});

it('NOT TO BE can defeat the courtiers without redirecting its damage to Hamlet', () => {
  const h = setup();
  h.state.actions = 1;
  h.action('prepare');
  h.state.actions = 1;
  h.action('prepare', 'p1:main');
  h.fighter('p0:ally-1').hp = 1;
  h.choose('not-to-be');
  h.choose('p0:ally-1');
  expect(h.fighter('p0:ally-1').defeated).toBe(true);
  expect(h.fighter().hp).toBe(15);
  expect(h.fighter().counters['not-to-be']).toBe(1);
});
it('empty opposing hands do not create a BOOST healing receipt for The Play’s The Thing', () => {
  const h = setup();
  h.fighter().hp = 8;
  h.attack('hamlet-the-plays-the-thing');
  h.state.players[1].hand = [];
  h.defend(null);
  expect(h.fighter().hp).toBe(8);
  expect(h.state.resolution.choice).toBeNull();
});
it('MAIN-only Hamlet cards cannot be committed by the courtiers, without mutation', () => {
  const h = setup();
  h.fighter().position = 'n4';
  h.fighter('p0:ally-1').position = 'n0';
  const card = h.state.players[0].hand[0];
  card.definition = 'hamlet-cruel-to-be-kind';
  const before = structuredClone(h.state);
  expect(h.run({ type: 'attack', fighter: 'p0:ally-1', target: 'p1:main', card: card.id }).ok).toBe(
    false,
  );
  expect(h.state).toEqual(before);
});
