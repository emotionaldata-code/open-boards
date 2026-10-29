import { describe, expect, it } from 'vitest';
import { reachablePaths, validateDefinitions } from '@open-boards/game';
import { basic, characters, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/golden-bat/inventory.json';

function setup(roster = ['golden-bat', 'vanguard']) {
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
  h.choose(h.state.resolution.choice!.options.find((o) => o.id === '$stay')!.id);
}

describe('Golden Bat complete printed deck', () => {
  it('preserves 18 HP, movement 3, solo melee, all thirty copies and twelve exact printed designs', () => {
    validateDefinitions(basic);
    expect(characters['golden-bat']).toMatchObject({ hp: 18, movement: 3, attackType: 'melee' });
    expect(characters['golden-bat'].ally).toBeUndefined();
    expect(deckDefinitions('golden-bat')).toHaveLength(30);
    expect(characters['golden-bat'].deck).toHaveLength(12);
    for (const c of inventory.cards) {
      const { id, name, category, usableBy, value, boost } = c;
      expect(basic.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(deckDefinitions('golden-bat').filter((id) => id === c.id)).toHaveLength(c.count);
      for (const text of Object.values(c.sourceRules))
        expect(basic.cards[id].description).toContain(text);
    }
  });
  it('adds two to attacks before any Maneuver, including after scheme movement', () => {
    const h = setup();
    h.action('golden-bat-arrive-just-in-time');
    h.choose('n0');
    h.attack('golden-bat-super-strength');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(4);
  });
  it('a Maneuver that stays still removes the attack bonus for the rest of the turn', () => {
    const h = setup();
    h.apply({ type: 'maneuver' });
    h.apply({ type: 'finish-maneuver' });
    h.attack('golden-bat-super-strength');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(2);
  });
  it('Imposing Presence cannot cancel the hero bonus, and defense never receives that attack bonus', () => {
    const h = setup();
    h.attack('golden-bat-super-strength');
    h.defend('golden-bat-imposing-presence');
    expect(h.state.revealed?.damage).toBe(4);
    const k = setup();
    k.attack('strike', 'p1:main', 'p0:main');
    k.defend('golden-bat-he-laughs-at-your-feebleness', 'p0');
    expect(k.fighter().hp).toBe(18);
    expect(k.defs.cards[k.state.revealed!.defense!.definition].value).toBe(5);
  });
  it.each([false, true])(
    'A Punch to Shake the Earth damages every enemy in Golden Bat’s zone (win=%s)',
    (won) => {
      const h = setup(['golden-bat', 'medusa']);
      const harpies = h.state.fighters.filter((f) => f.role === 'ally');
      harpies[0].position = 'n5';
      harpies[1].position = 'n9';
      harpies[2].position = 'n20';
      const nearby = harpies.slice(0, 2).map((f) => f.id);
      // Exact zone membership, not adjacency alone, determines the wave.
      for (const f of harpies.slice(0, 2))
        expect(h.defs.map.zones.n0.some((z) => h.defs.map.zones[f.position!].includes(z))).toBe(
          true,
        );
      h.attack('golden-bat-a-punch-to-shake-the-earth');
      h.defend(won ? null : 'golden-bat-he-laughs-at-your-feebleness');
      while (h.state.resolution.choice) h.choose();
      expect(h.fighter('p1:main').hp).toBe(won ? 11 : 15);
      for (const id of nearby) expect(h.fighter(id).defeated).toBe(true);
      expect(h.fighter(harpies[2].id).defeated).toBe(false);
    },
  );
  it('Alpine Fortress shuffles the exact selected prior discard, then draws two and moves four', () => {
    const h = setup();
    h.state.players[0].deck = [{ id: 'deck-one', definition: 'golden-bat-super-strength' }];
    h.state.players[0].discard = [
      { id: 'chosen-old', definition: 'golden-bat-skirmish' },
      { id: 'left-old', definition: 'golden-bat-skirmish' },
    ];
    const hand = h.state.players[0].hand.length;
    h.action('golden-bat-alpine-fortress');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['chosen-old', 'left-old']);
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    h.reconnect();
    h.choose('chosen-old');
    expect(h.state.players[0].hand).toHaveLength(hand + 1);
    expect(h.state.players[0].hand.some((c) => c.id === 'chosen-old')).toBe(true);
    expect(h.state.players[0].discard.map((c) => c.id)).toContain('left-old');
    stay(h);
    expect(h.state.resolution.frames).toEqual({});
  });
  it('Arrive Just in Time allows any unoccupied space including staying in the current space', () => {
    const h = setup();
    h.action('golden-bat-arrive-just-in-time');
    const c = h.state.resolution.choice!;
    expect(c.options.some((o) => o.id === 'n1')).toBe(false);
    expect(c.options.some((o) => o.id === 'n20')).toBe(true);
    h.reconnect();
    h.choose('n20');
    expect(h.fighter().position).toBe('n20');
    expect(h.state.resolution.maneuvered ?? []).toEqual([]);
  });
  it('Insight of the Ancients recovers one random prior discard only on a win, excluding itself', () => {
    const h = setup();
    h.state.players[0].discard = [{ id: 'recover-me', definition: 'golden-bat-super-strength' }];
    h.attack('golden-bat-insight-of-the-ancients');
    h.defend('guard');
    expect(h.state.players[0].hand.some((c) => c.id === 'recover-me')).toBe(true);
    expect(
      h.state.players[0].discard.some((c) => c.definition === 'golden-bat-insight-of-the-ancients'),
    ).toBe(true);
    const k = setup();
    k.state.players[0].discard = [
      { id: 'stay-discarded', definition: 'golden-bat-super-strength' },
    ];
    k.attack('golden-bat-insight-of-the-ancients');
    k.defend('golden-bat-he-laughs-at-your-feebleness');
    expect(k.state.players[0].discard.some((c) => c.id === 'stay-discarded')).toBe(true);
  });
  it('Like a Flash requires disjoint starting zones, retains the hero bonus and moves up to five', () => {
    const h = setup();
    h.state.resolution.turnPositions['p0:main'] = 'n20';
    h.attack('golden-bat-like-a-flash-of-golden-light');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(3);
    stay(h);
    const k = setup();
    k.state.resolution.turnPositions['p0:main'] = 'n1';
    k.attack('golden-bat-like-a-flash-of-golden-light');
    k.defend('guard');
    expect(k.state.revealed?.damage).toBe(1);
    stay(k);
  });
  it('Sight Beyond Sight privately reorders the opponent’s exact top three across reconnect', () => {
    const h = setup();
    const deck = structuredClone(h.state.players[1].deck);
    h.attack('golden-bat-sight-beyond-sight');
    h.defend('guard');
    const c = h.state.resolution.choice!;
    expect(c.player).toBe('p0');
    expect(c.options.map((o) => o.id)).toEqual(deck.slice(0, 3).map((c) => c.id));
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    const before = structuredClone(h.state);
    expect(h.run({ type: 'choose', choice: c.id, options: [deck[3].id] }).ok).toBe(false);
    expect(h.state).toEqual(before);
    h.reconnect();
    h.choose(deck[2].id);
    h.choose(deck[1].id);
    expect(h.state.players[1].deck).toEqual([deck[2], deck[1], deck[0], ...deck.slice(3)]);
  });
  it('Skirmish only offers exact living combatants on a win', () => {
    const h = setup();
    h.attack('golden-bat-skirmish');
    h.defend('guard');
    expect(h.state.resolution.choice!.options.map((o) => o.id).sort()).toEqual([
      'p0:main',
      'p1:main',
    ]);
    h.choose('p1:main');
    stay(h);
    const k = setup();
    k.apply({ type: 'maneuver' });
    k.apply({ type: 'finish-maneuver' });
    k.attack('golden-bat-skirmish');
    k.defend('golden-bat-he-laughs-at-your-feebleness');
    expect(k.state.resolution.choice).toBeNull();
  });
  it('Terrifying Roar immediately locks every fighter until the next turn and Feint can cancel it', () => {
    const h = setup();
    h.attack('golden-bat-terrifying-roar');
    h.defend('guard');
    expect(h.state.resolution.movementLocks!.sort()).toEqual(
      h.state.fighters.map((f) => f.id).sort(),
    );
    h.action('golden-bat-arrive-just-in-time');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['n0']);
    h.choose('n0');
    expect(h.state.turn).toBe(1);
    expect(h.state.resolution.movementLocks).toEqual([]);
    const k = setup();
    k.attack('golden-bat-terrifying-roar');
    k.defend('golden-bat-imposing-presence');
    expect(k.state.resolution.movementLocks ?? []).toEqual([]);
    expect(Object.keys(reachablePaths(k.state, k.fighter(), k.defs.map, 3)).length).toBeGreaterThan(
      0,
    );
  });
  it('Vaporizing Eyebeams discards exactly one opposing random hand card, or none from an empty hand', () => {
    const h = setup();
    h.state.players[1].hand = [{ id: 'random-exact', definition: 'strike' }];
    h.attack('golden-bat-vaporizing-eyebeams');
    h.defend();
    expect(h.state.players[1].hand).toEqual([]);
    expect(h.state.players[1].discard).toContainEqual({ id: 'random-exact', definition: 'strike' });
    const k = setup();
    k.state.players[1].hand = [];
    k.attack('golden-bat-vaporizing-eyebeams');
    k.defend();
    expect(k.state.resolution.choice).toBeNull();
  });
  it('a winning defensive Insight recovers a prior card, while immediate cancellation prevents recovery', () => {
    const h = setup();
    h.state.players[0].discard = [
      { id: 'defense-recovery', definition: 'golden-bat-super-strength' },
    ];
    h.attack('adapt', 'p1:main', 'p0:main');
    h.defend('golden-bat-insight-of-the-ancients', 'p0');
    expect(h.state.players[0].hand.some((c) => c.id === 'defense-recovery')).toBe(true);
    const k = setup();
    k.state.players[0].discard = [
      { id: 'cancelled-recovery', definition: 'golden-bat-super-strength' },
    ];
    k.attack('golden-bat-insight-of-the-ancients');
    k.defend('golden-bat-imposing-presence');
    expect(k.state.players[0].discard.some((c) => c.id === 'cancelled-recovery')).toBe(true);
  });
  it('Feint suppresses Flash’s printed replacement and movement while retaining the hero attack bonus', () => {
    const h = setup();
    h.state.resolution.turnPositions['p0:main'] = 'n20';
    h.attack('golden-bat-like-a-flash-of-golden-light');
    h.defend('medusa-feint');
    expect(h.state.revealed?.damage).toBe(2);
    expect(h.state.resolution.choice).toBeNull();
    expect(h.fighter().position).toBe('n0');
  });
  it('a defending Flash receives only its printed replacement, without the hero attack bonus', () => {
    const h = setup();
    h.state.resolution.turnPositions['p0:main'] = 'n20';
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('golden-bat-like-a-flash-of-golden-light', 'p0');
    expect(h.state.revealed?.damage).toBe(0);
    expect(h.fighter().hp).toBe(18);
    stay(h);
  });
  it('a defensive Roar locks before the attacking Feint and blocks later after-combat movement', () => {
    const h = setup();
    h.attack('medusa-feint', 'p1:main', 'p0:main');
    h.defend('golden-bat-terrifying-roar', 'p0');
    expect(h.state.resolution.movementLocks!.sort()).toEqual(
      h.state.fighters.map((f) => f.id).sort(),
    );
    const k = setup();
    k.attack('golden-bat-like-a-flash-of-golden-light');
    k.defend('golden-bat-terrifying-roar');
    expect(k.state.resolution.choice).toBeNull();
    expect(k.fighter().position).toBe('n0');
  });
  it('Alpine Fortress draws and moves with no prior discard, without recovering itself', () => {
    const h = setup();
    h.state.players[0].discard = [];
    const hand = h.state.players[0].hand.length;
    const exact = h.state.players[0].hand[0].id;
    h.action('golden-bat-alpine-fortress');
    expect(h.state.players[0].hand).toHaveLength(hand + 1);
    expect(h.state.players[0].hand.some((c) => c.id === exact)).toBe(false);
    expect(h.state.resolution.choice!.options.some((o) => o.id === '$stay')).toBe(true);
    stay(h);
    expect(h.state.players[0].discard.some((c) => c.id === exact)).toBe(true);
  });
  it('deploys two/four-seat solo rosters with independent owners', () => {
    for (const roster of [['golden-bat', 'golden-bat'], Array<string>(4).fill('golden-bat')]) {
      const h = setup(roster);
      expect(h.state.phase.type).toBe('taking-actions');
      expect(h.state.fighters).toHaveLength(roster.length);
    }
  });
});
