import { describe, expect, it } from 'vitest';
import { validateDefinitions } from '@open-boards/game';
import { basic, characters, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/bloody-mary/inventory.json';

function setup(roster = ['bloody-mary', 'vanguard']) {
  const defs = structuredClone({
    ...basic,
    characters: { ...basic.characters, ...neutral.characters },
    cards: { ...basic.cards, ...neutral.cards },
  });
  const h = deckHarness(defs, roster);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.state.resolution.turnPositions = Object.fromEntries(
    h.state.fighters.map((f) => [f.id, f.position]),
  );
  return h;
}
function stay(h: ReturnType<typeof setup>) {
  h.choose(h.state.resolution.choice!.options.find((o) => o.id === '$stay')?.id);
}
function freeAction(h: ReturnType<typeof setup>) {
  h.action('bloody-mary-closer-than-she-appears');
  stay(h);
}
function third(h: ReturnType<typeof setup>) {
  freeAction(h);
  freeAction(h);
}
function privateChoice(h: ReturnType<typeof setup>, other = 'p1') {
  const c = h.state.resolution.choice!;
  expect(projectGame(h.state, other, false).choice).toBeNull();
  const before = structuredClone(h.state);
  expect(h.run({ type: 'choose', choice: c.id, options: ['forged'] }, c.player).ok).toBe(false);
  expect(h.state).toEqual(before);
  h.reconnect();
}

describe('Bloody Mary complete printed deck', () => {
  it('preserves 30 copies, 13 designs, all source clauses and explicit BOOSTs', () => {
    validateDefinitions(basic);
    expect(characters['bloody-mary']).toMatchObject({ hp: 16, movement: 3, attackType: 'melee' });
    expect(characters['bloody-mary'].ally).toBeUndefined();
    expect(deckDefinitions('bloody-mary')).toHaveLength(30);
    expect(characters['bloody-mary'].deck).toHaveLength(13);
    for (const c of inventory.cards) {
      const { id, name, category, usableBy, value, boost } = c;
      expect(basic.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(deckDefinitions('bloody-mary').filter((id) => id === c.id)).toHaveLength(c.count);
      for (const text of Object.values(c.sourceRules))
        expect(basic.cards[id].description).toContain(text);
    }
  });
  it.each([2, 3, 4])('grants an extra start action only for exactly three cards (%i)', (n) => {
    const h = setup();
    h.state.players[0].hand = h.state.players[0].hand.slice(0, n);
    h.state.actions = 1;
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend(null, 'p0');
    expect(h.state.turn).toBe(0);
    expect(h.state.actions).toBe(n === 3 ? 3 : 2);
    expect(h.state.resolution.actionNumber).toBe(0);
  });
  it('counts actual actions despite action grants: third Speak Three Times is seven, fourth is three', () => {
    const h = setup();
    h.state.actions = 5;
    third(h);
    expect(h.state.resolution.actionNumber).toBe(2);
    expect(h.state.actions).toBe(5);
    h.attack('bloody-mary-speak-three-times');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(4);
    expect(h.state.resolution.actionNumber).toBe(3);
    h.attack('bloody-mary-speak-three-times');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(0);
    expect(h.state.resolution.actionNumber).toBe(4);
  });
  it('Maneuver is an action; movement, BOOST and free defense are not', () => {
    const h = setup();
    h.apply({ type: 'maneuver' });
    expect(h.state.resolution.actionNumber).toBe(1);
    h.apply({ type: 'boost-maneuver', card: h.state.players[0].hand[0].id });
    h.apply({ type: 'finish-maneuver' });
    expect(h.state.resolution.actionNumber).toBe(1);
    h.attack('bloody-mary-speak-three-times');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(0);
  });
  it('Out of the Mirror adds the exact random discard BOOST and draws on third action', () => {
    const h = setup();
    third(h);
    h.state.players[1].hand = [{ id: 'payment', definition: 'bloody-mary-bloody-requiem' }];
    const hand = h.state.players[0].hand.length;
    h.attack('bloody-mary-out-of-the-mirror');
    h.defend();
    expect(h.state.revealed?.damage).toBe(5);
    expect(h.state.players[1].discard).toContainEqual({
      id: 'payment',
      definition: 'bloody-mary-bloody-requiem',
    });
    expect(h.state.players[0].hand).toHaveLength(hand);
  });
  it('Ghostly Touch permits BOOST and heals three only on third action', () => {
    const h = setup();
    third(h);
    h.fighter().hp = 9;
    h.attack('bloody-mary-ghostly-touch');
    h.defend();
    privateChoice(h);
    const payment = h.state.resolution.choice!.options.find((o) => o.card)!;
    const boost = h.defs.cards[payment.card!.definition].boost;
    h.choose(payment.id);
    expect(h.state.revealed?.damage).toBe(1 + boost);
    expect(h.fighter().hp).toBe(12);
  });
  it('Feint cancels the third-action heal and BOOST offer', () => {
    const h = setup();
    third(h);
    h.fighter().hp = 9;
    h.attack('bloody-mary-ghostly-touch');
    h.defend('bloody-mary-feint');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.fighter().hp).toBe(9);
  });
  it('Bloody Reprise uses the FIRST defense printed value, requires a fresh defense and spends no extra action', () => {
    const h = setup();
    h.defs.cards.guard.abilities = [
      {
        id: 'raise',
        name: 'Raise',
        description: 'Raise',
        trigger: 'before-combat',
        effects: [{ type: 'modify', field: 'defense', amount: 4 }],
      },
    ];
    h.attack('bloody-mary-bloody-requiem');
    h.defend('guard');
    expect(h.state.phase).toMatchObject({
      type: 'awaiting-defense',
      bonus: { name: 'Bloody Reprise', value: 0, combatValue: 3 },
    });
    expect(h.state.resolution.actionNumber).toBe(1);
    h.reconnect();
    h.defend(null);
    expect(h.state.revealed?.damage).toBe(3);
    expect(
      h.state.players[0].discard.filter((c) => c.definition === 'bloody-mary-bloody-requiem'),
    ).toHaveLength(1);
    expect(h.state.actions).toBe(1);
  });
  it('unopposed Requiem still creates a zero-value Reprise', () => {
    const h = setup();
    h.attack('bloody-mary-bloody-requiem');
    h.defend(null);
    expect(h.state.phase).toMatchObject({ type: 'awaiting-defense', bonus: { combatValue: 0 } });
    h.defend(null);
    expect(h.state.revealed?.damage).toBe(0);
  });
  it('Feint on Requiem prevents Reprise, while Feint on Reprise cancels its copied value', () => {
    const h = setup();
    h.attack('bloody-mary-bloody-requiem');
    h.defend('bloody-mary-feint');
    expect(h.state.phase.type).toBe('taking-actions');
    const k = setup();
    k.attack('bloody-mary-bloody-requiem');
    k.defend('guard');
    k.defend('bloody-mary-feint');
    expect(k.state.revealed?.damage).toBe(0);
    expect(k.state.resolution.frames).toEqual({});
  });
  it('Broken Glass adjusts either role and compares final values for draw and exact opponent damage', () => {
    const h = setup();
    const hand = h.state.players[0].hand.length;
    h.attack('bloody-mary-broken-glass');
    h.defend('guard');
    privateChoice(h);
    h.choose('keep');
    expect(h.state.players[0].hand).toHaveLength(hand);
    expect(h.fighter('p1:main').hp).toBe(13);
    const k = setup();
    k.attack('strike', 'p1:main', 'p0:main');
    k.defend('bloody-mary-broken-glass', 'p0');
    k.choose('increase');
    expect(k.fighter().hp).toBe(16);
    expect(k.fighter('p1:main').hp).toBe(13);
  });
  it('Broken Glass decrease can match, and mismatches do not deal the extra damage', () => {
    const h = setup();
    h.attack('bloody-mary-broken-glass');
    h.defend('bloody-mary-feint');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.fighter('p1:main').hp).toBe(14);
    const k = setup();
    k.defs.cards.guard.value = 2;
    k.attack('bloody-mary-broken-glass');
    k.defend('guard');
    k.choose('decrease');
    expect(k.fighter('p1:main').hp).toBe(13);
  });
  it('Jump Scare requires no shared starting zone, not merely a different space', () => {
    const h = setup();
    h.state.resolution.turnPositions['p0:main'] = 'n1';
    h.attack('bloody-mary-jump-scare');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(0);
    const k = setup();
    k.state.resolution.turnPositions['p0:main'] = 'n20';
    expect(k.defs.map.zones.n20.some((z) => k.defs.map.zones.n0.includes(z))).toBe(false);
    k.attack('bloody-mary-jump-scare');
    k.defend('guard');
    expect(k.state.revealed?.damage).toBe(3);
  });
  it.each(['discard', 'decline'])(
    'Stolen Memories privately selects one EXACT card and lets its owner %s',
    (decision) => {
      const h = setup();
      h.state.players[1].hand = [
        { id: 'chosen-exact', definition: 'bloody-mary-bloody-requiem' },
        { id: 'other-copy', definition: 'bloody-mary-bloody-requiem' },
      ];
      h.action('bloody-mary-stolen-memories');
      h.choose('p1');
      privateChoice(h);
      h.choose('chosen-exact');
      expect(h.state.resolution.choice!.player).toBe('p1');
      expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual([
        'chosen-exact',
        '$decline',
      ]);
      privateChoice(h, 'p0');
      h.choose(decision === 'discard' ? 'chosen-exact' : '$decline');
      expect(h.state.players[1].hand.map((c) => c.id)).toContain('other-copy');
      expect(h.fighter('p1:main').hp).toBe(decision === 'discard' ? 15 : 11);
      expect(h.state.players[1].discard.some((c) => c.id === 'chosen-exact')).toBe(
        decision === 'discard',
      );
    },
  );
  it('Mirror Image copies printed attack value and Evade draws once', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('bloody-mary-mirror-image', 'p0');
    expect(h.fighter().hp).toBe(16);
    const k = setup();
    const hand = k.state.players[0].hand.length;
    k.attack('strike', 'p1:main', 'p0:main');
    k.defend('bloody-mary-evade', 'p0');
    expect(k.state.players[0].hand).toHaveLength(hand);
    expect(k.fighter().hp).toBe(15);
  });
  it('Infinity Mirror chooses only exact combat participants, and Trick of the Light places adjacent', () => {
    const h = setup();
    h.attack('bloody-mary-infinity-mirror');
    h.defend('guard');
    expect(h.state.resolution.choice!.options.map((o) => o.id).sort()).toEqual([
      'p0:main',
      'p1:main',
    ]);
    h.choose('p1:main');
    stay(h);
    const k = setup();
    k.attack('bloody-mary-trick-of-the-light');
    k.defend('guard');
    expect(k.state.resolution.choice!.options.some((o) => o.id === '$stay')).toBe(true);
    stay(k);
    expect(k.state.resolution.frames).toEqual({});
  });
  it('deploys full two/four-seat rosters without allies', () => {
    for (const roster of [['bloody-mary', 'bloody-mary'], Array<string>(4).fill('bloody-mary')]) {
      const h = setup(roster);
      expect(h.state.phase.type).toBe('taking-actions');
      expect(h.state.fighters).toHaveLength(roster.length);
    }
  });
});
