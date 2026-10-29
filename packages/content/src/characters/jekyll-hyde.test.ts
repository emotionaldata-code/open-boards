import { describe, expect, it } from 'vitest';
import { cardEligible, validateDefinitions } from '@open-boards/game';
import { basic, characters, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/jekyll-hyde/inventory.json';

function setup() {
  const defs = structuredClone({
    ...basic,
    characters: { ...basic.characters, ...neutral.characters },
    cards: { ...basic.cards, ...neutral.cards },
  });
  const h = deckHarness(defs, ['jekyll-hyde', 'vanguard']);
  // The first turn's optional transformation precedes actions.
  if (h.state.resolution.choice) h.choose('skip');
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}
function form(h: ReturnType<typeof setup>, name: 'jekyll' | 'hyde') {
  h.fighter().statuses = [{ id: `${name}-form`, stacks: 1 }];
}

describe('Jekyll & Hyde printed deck', () => {
  it('preserves all 30 copies, 13 designs, BOOSTs, printed clauses and form restrictions', () => {
    validateDefinitions(basic);
    expect(characters['jekyll-hyde']).toMatchObject({ hp: 16, movement: 2, attackType: 'melee' });
    expect(characters['jekyll-hyde'].ally).toBeUndefined();
    expect(deckDefinitions('jekyll-hyde')).toHaveLength(30);
    expect(characters['jekyll-hyde'].deck).toHaveLength(13);
    for (const c of inventory.cards) {
      expect(basic.cards[c.id]).toMatchObject({
        name: c.name,
        value: c.value,
        boost: c.boost,
        category: c.category,
      });
      expect(deckDefinitions('jekyll-hyde').filter((id) => id === c.id)).toHaveLength(c.count);
      for (const text of Object.values(c.sourceRules))
        expect(basic.cards[c.id].description).toContain(text);
      expect(basic.cards[c.id].requiresStatus).toBe(c.form ? `${c.form}-form` : undefined);
    }
  });
  it('starts as Jekyll, rejects all wrong-form card declarations without mutation and still permits BOOST', () => {
    const h = setup();
    expect(h.fighter().statuses).toEqual([{ id: 'jekyll-form', stacks: 1 }]);
    for (const c of inventory.cards) {
      expect(cardEligible(h.defs.cards[c.id], h.fighter())).toBe(c.form !== 'hyde');
      if (c.form !== 'hyde') continue;
      h.state.players[0].hand[0].definition = c.id;
      const before = structuredClone(h.state),
        card = h.state.players[0].hand[0].id;
      const command =
        c.category === 'action'
          ? { type: 'play-action' as const, fighter: 'p0:main', card }
          : { type: 'attack' as const, fighter: 'p0:main', target: 'p1:main', card };
      expect(h.run(command).ok).toBe(false);
      expect(h.state).toEqual(before);
    }
    h.apply({ type: 'maneuver' });
    const payment = h.state.players[0].hand.find(
      (c) => h.defs.cards[c.definition].requiresStatus === 'hyde-form',
    )!;
    h.apply({ type: 'boost-maneuver', card: payment.id });
    h.apply({ type: 'finish-maneuver' });
    expect(h.fighter().hp).toBe(16);
  });
  it('Hyde takes exactly one damage after each Maneuver including Stay, but not effect movement', () => {
    const h = setup();
    form(h, 'hyde');
    h.apply({ type: 'maneuver' });
    expect(h.fighter().hp).toBe(16);
    h.reconnect();
    h.apply({ type: 'finish-maneuver' });
    expect(h.fighter().hp).toBe(15);
    h.apply({ type: 'maneuver' });
    h.apply({ type: 'move', fighter: 'p0:main', path: [] });
    expect(h.fighter().hp).toBe(14);
  });
  it('Hyde rejects Jekyll defenses and schemes; the current form survives wrong-owner and forged Serum choices', () => {
    const h = setup();
    form(h, 'hyde');
    for (const c of inventory.cards)
      expect(cardEligible(h.defs.cards[c.id], h.fighter())).toBe(c.form !== 'jekyll');
    h.state.players[0].hand[0].definition = 'jekyll-hyde-calming-research';
    const before = structuredClone(h.state);
    expect(
      h.run({ type: 'play-action', fighter: 'p0:main', card: h.state.players[0].hand[0].id }).ok,
    ).toBe(false);
    expect(h.state).toEqual(before);
    h.attack('strike', 'p1:main', 'p0:main');
    h.state.players[0].hand[0].definition = 'jekyll-hyde-with-haste';
    const defense = structuredClone(h.state);
    expect(h.run({ type: 'defend', card: h.state.players[0].hand[0].id }, 'p0').ok).toBe(false);
    expect(h.state).toEqual(defense);
    const first = deckHarness(h.defs, ['jekyll-hyde', 'vanguard']);
    const c = first.state.resolution.choice!,
      initial = structuredClone(first.state);
    expect(first.run({ type: 'choose', choice: c.id, options: ['use'] }, 'p1').ok).toBe(false);
    expect(first.state).toEqual(initial);
    first.choose('use');
    first.choose('hyde');
    expect(first.fighter().statuses).toEqual([{ id: 'hyde-form', stacks: 1 }]);
  });
  it.each([
    ['jekyll', 'attacker', 3],
    ['hyde', 'attacker', 6],
    ['jekyll', 'defender', 6],
    ['hyde', 'defender', 3],
  ] as const)('Duality of Man as %s %s has value %i', (f, role, value) => {
    const h = setup();
    form(h, f);
    if (role === 'attacker') {
      h.attack('jekyll-hyde-duality-of-man');
      h.defend(null);
      expect(h.state.revealed?.damage).toBe(value);
    } else {
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend('jekyll-hyde-duality-of-man', 'p0');
      expect(h.state.revealed?.damage).toBe(Math.max(0, 4 - value));
    }
  });
  it('Distracted Triage heals only after winning, while Scientific Method draws actual received combat damage', () => {
    const h = setup();
    h.fighter().hp = 10;
    h.attack('jekyll-hyde-distracted-triage');
    h.defend(null);
    expect(h.fighter().hp).toBe(12);
    h.attack('strike', 'p1:main', 'p0:main');
    const before = h.state.players[0].hand.length;
    h.defend('jekyll-hyde-scientific-method', 'p0');
    expect(h.state.players[0].hand.length).toBe(before - 1 + 2);
  });
  it('Succumb moves before transforming, Madness Relents transforms, and Feint cancels a transformation', () => {
    const h = setup();
    h.attack('jekyll-hyde-succumb-to-compulsion');
    h.defend(null);
    expect(h.fighter().statuses[0].id).toBe('jekyll-form');
    h.choose('$stay');
    expect(h.fighter().statuses[0].id).toBe('hyde-form');
    h.attack('jekyll-hyde-madness-relents');
    h.defend(null);
    expect(h.fighter().statuses[0].id).toBe('jekyll-form');
    h.state.actions = 2;
    h.attack('jekyll-hyde-succumb-to-compulsion');
    h.defend('jekyll-hyde-feint');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.fighter().statuses[0].id).toBe('jekyll-form');
  });
  it('Forever Hyde privately offers only Jekyll cards and gains two per actual discarded instance', () => {
    const h = setup();
    form(h, 'hyde');
    h.state.players[0].hand[1].definition = 'jekyll-hyde-with-haste';
    h.state.players[0].hand[2].definition = 'jekyll-hyde-distracted-triage';
    h.state.players[0].hand[3].definition = 'jekyll-hyde-pure-evil';
    h.attack('jekyll-hyde-forever-hyde');
    h.defend('guard');
    const c = h.state.resolution.choice!;
    expect(c.options.every((o) => h.defs.cards[o.card!.definition].tags?.includes('jekyll'))).toBe(
      true,
    );
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    const selected = c.options.slice(0, 2).map((o) => o.id);
    h.reconnect();
    h.apply({ type: 'choose', choice: c.id, options: selected });
    expect(h.state.revealed?.damage).toBe(6);
  });
  it('Calming Research heals, draws a chosen count, keeps only one drawn card and privately orders the rest at bottom', () => {
    const h = setup();
    h.fighter().hp = 10;
    const original = h.state.players[0].hand.slice(1).map((c) => c.id),
      drawn = h.state.players[0].deck.slice(0, 3).map((c) => c.id);
    h.action('jekyll-hyde-calming-research');
    expect(h.fighter().hp).toBe(12);
    h.choose('3');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(drawn);
    const c = h.state.resolution.choice!,
      before = structuredClone(h.state);
    expect(h.run({ type: 'choose', choice: c.id, options: [original[0]] }).ok).toBe(false);
    expect(h.state).toEqual(before);
    h.choose(drawn[1]);
    h.reconnect();
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    h.choose(drawn[2]);
    expect(h.state.players[0].deck.slice(-2).map((c) => c.id)).toEqual([drawn[2], drawn[0]]);
    expect(h.state.players[0].hand.map((c) => c.id)).toEqual([...original, drawn[1]]);
  });
  it('Pure Evil places within the current zone and damages adjacent fighters; Strange Case reveals and transfers its exact card', () => {
    const h = setup();
    form(h, 'hyde');
    h.action('jekyll-hyde-pure-evil');
    h.choose('n0');
    expect(h.fighter('p1:main').hp).toBe(13);
    const top = structuredClone(h.state.players[0].deck[0]);
    const boost = h.defs.cards[top.definition].boost;
    const outcomes = h.action('jekyll-hyde-strange-case');
    expect(outcomes.some((o) => o.type === 'hand-revealed' && o.cards[0].id === top.id)).toBe(true);
    h.reconnect();
    h.choose('p1:main');
    expect(h.fighter('p1:main').hp).toBe(13 - boost);
    expect(h.state.players[0].hand.some((c) => c.id === top.id)).toBe(true);
  });
  it('Recoiling Blow places before reverting and With Haste offers up to four spaces', () => {
    const h = setup();
    form(h, 'hyde');
    h.attack('jekyll-hyde-recoiling-blow');
    h.defend(null);
    expect(h.fighter().statuses[0].id).toBe('hyde-form');
    h.choose('n0');
    expect(h.fighter().statuses[0].id).toBe('jekyll-form');
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('jekyll-hyde-with-haste', 'p0');
    expect(h.state.resolution.choice?.prompt).toContain('destination');
  });
});
