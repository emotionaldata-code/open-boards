import { describe, expect, it } from 'vitest';
import { maneuverMovement, movement, validateDefinitions, type Command } from '@open-boards/game';
import { basic, characters, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame, projectOutcomes } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/sinbad/inventory.json';

function setup() {
  const defs = structuredClone({
    ...basic,
    characters: { ...basic.characters, ...neutral.characters },
    cards: { ...basic.cards, ...neutral.cards },
  });
  const h = deckHarness(defs, ['sinbad', 'vanguard']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.fighter('p0:ally-1').position = 'n20';
  return h;
}
const voyages = inventory.cards.filter((c) => (c.tags as string[]).includes('voyage'));
function discard(h: ReturnType<typeof setup>, n: number, exclude?: string) {
  h.state.players[0].discard.push(
    ...voyages
      .filter((c) => c.id !== exclude)
      .slice(0, n)
      .map((c, i) => ({ id: `prior-${i}`, definition: c.id })),
  );
}
function privateChoice(h: ReturnType<typeof setup>) {
  const choice = h.state.resolution.choice!;
  expect(choice).toBeTruthy();
  const before = structuredClone(h.state);
  const other = choice.player === 'p0' ? 'p1' : 'p0';
  expect(projectGame(h.state, other, false).choice).toBeNull();
  expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
  const command: Command = { type: 'choose', choice: choice.id, options: [choice.options[0].id] };
  expect(h.run(command, other).ok).toBe(false);
  expect(h.run({ ...command, options: ['forged'] }, choice.player).ok).toBe(false);
  expect(
    h.run({ ...command, options: [choice.options[0].id, choice.options[0].id] }, choice.player).ok,
  ).toBe(false);
  expect(h.state).toEqual(before);
  h.reconnect();
}

describe('Sinbad printed source deck', () => {
  it('preserves 30 copies, sixteen designs, seven Voyages, all values, boosts, tags and timed clauses', () => {
    validateDefinitions(basic);
    expect(characters.sinbad).toMatchObject({
      hp: 15,
      movement: 2,
      attackType: 'melee',
      ally: { count: 1, hp: 6, attackType: 'melee' },
    });
    expect(deckDefinitions('sinbad')).toHaveLength(30);
    expect(characters.sinbad.deck).toHaveLength(16);
    expect(voyages).toHaveLength(7);
    for (const card of inventory.cards) {
      const { id, name, category, usableBy, value, boost, tags } = card;
      expect(basic.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(basic.cards[id].tags ?? []).toEqual(tags);
      expect(deckDefinitions('sinbad').filter((id) => id === card.id)).toHaveLength(card.count);
      for (const text of Object.values(card.sourceRules))
        expect(basic.cards[id].description).toContain(text);
    }
  });

  it.each(inventory.cards.filter((c) => c.usableBy !== 'BOTH'))(
    'rejects the wrong fighter for $name without mutation',
    (card) => {
      const h = setup(),
        fighter = card.usableBy === 'MAIN' ? 'p0:ally-1' : 'p0:main';
      h.fighter(fighter).position = 'n0';
      h.state.players[0].hand[0].definition = card.id;
      const instance = h.state.players[0].hand[0];
      const before = structuredClone(h.state);
      const command: Command =
        card.category === 'action'
          ? { type: 'play-action', fighter, card: instance.id }
          : { type: 'attack', fighter, target: 'p1:main', card: instance.id };
      expect(h.run(command).ok).toBe(false);
      expect(h.state).toEqual(before);
    },
  );

  it.each(voyages)(
    '$name gains one attack per other discarded Voyage; Feint cancels both clauses',
    (card) => {
      for (const cancelled of [false, true]) {
        const h = setup();
        discard(h, 3, card.id);
        h.attack(card.id);
        h.defend(cancelled ? 'sinbad-feint' : 'guard');
        expect(h.state.revealed?.damage).toBe(cancelled ? 0 : 2);
        if (cancelled) expect(h.state.resolution.choice).toBeNull();
      }
    },
  );

  it('7 Voyages increases both fighters, counts boosted Voyages immediately, and preserves a zero BOOST', () => {
    const h = setup();
    discard(h, 2, voyages.find((c) => c.boost === 0)!.id);
    h.state.players[1].discard.push({ id: 'enemy-voyage', definition: voyages[0].id });
    expect(movement(h.fighter(), h.defs, h.state)).toBe(4);
    expect(movement(h.fighter('p0:ally-1'), h.defs, h.state)).toBe(4);
    h.apply({ type: 'maneuver' });
    const card = h.state.players[0].hand[0];
    card.definition = voyages.find((c) => c.boost === 0)!.id;
    const outcomes = h.apply({ type: 'boost-maneuver', card: card.id });
    expect(outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'boost', amount: 0, purpose: 'maneuver' }),
      ]),
    );
    expect(maneuverMovement(h.state, h.fighter(), h.defs)).toBe(5);
    expect(
      maneuverMovement(projectGame(h.state, 'p0', false), h.fighter('p0:ally-1'), h.defs),
    ).toBe(5);
    h.reconnect();
    expect(maneuverMovement(h.state, h.fighter('p0:ally-1'), h.defs)).toBe(5);
  });

  it('Voyage Home returns every prior Voyage, excludes itself and unrelated cards, and reduces both fighters’ movement', () => {
    const h = setup();
    discard(h, 6, 'sinbad-voyage-home');
    h.state.players[0].discard.push({ id: 'ordinary', definition: 'sinbad-exploit' });
    const id = h.state.players[0].hand[0].id;
    h.attack('sinbad-voyage-home');
    h.reconnect();
    const outcomes = h.defend();
    expect(h.state.revealed?.damage).toBe(8);
    expect(h.state.players[0].hand.filter((c) => c.id.startsWith('prior-'))).toHaveLength(6);
    expect(h.state.players[0].discard.map((c) => c.id)).toEqual(['ordinary', id]);
    expect(h.state.resolution.choice).toBeNull();
    expect(movement(h.fighter(), h.defs, h.state)).toBe(3);
    expect(movement(h.fighter('p0:ally-1'), h.defs, h.state)).toBe(3);
    expect(projectOutcomes(outcomes, 'p1').some((o) => o.type === 'draw')).toBe(false);
  });

  it('Whale heals only Sinbad without exceeding printed health', () => {
    const h = setup();
    h.fighter().hp = 14;
    h.fighter('p0:ally-1').hp = 1;
    h.attack('sinbad-voyage-to-the-island-that-was-a-whale');
    h.defend();
    expect(h.fighter().hp).toBe(15);
    expect(h.fighter('p0:ally-1').hp).toBe(1);
  });
  it('Snakes privately inspects the actual combat opponent’s hand and survives reconnect', () => {
    const h = setup();
    h.attack('sinbad-voyage-to-the-valley-of-the-giant-snakes');
    h.defend();
    privateChoice(h);
    expect(h.state.resolution.choice!.options.flatMap((o) => (o.card ? [o.card.id] : []))).toEqual(
      h.state.players[1].hand.map((c) => c.id),
    );
    h.choose();
    expect(h.state.resolution.choice).toBeNull();
  });
  it('Coals discards one seeded random opposing card; empty hands do not prompt', () => {
    for (const empty of [false, true]) {
      const h = setup();
      if (empty) h.state.players[1].hand = [];
      const before = h.state.players[1].hand.length;
      h.attack('sinbad-voyage-to-the-creature-with-eyes-like-coals-of-fire');
      h.reconnect();
      h.defend();
      expect(h.state.players[1].hand).toHaveLength(Math.max(0, before - 1));
      expect(h.state.players[1].discard).toHaveLength(empty ? 0 : 1);
      expect(h.state.resolution.choice).toBeNull();
    }
  });
  it.each([
    ['sinbad-toil-and-danger', 3],
    ['sinbad-voyage-to-the-cannibals-with-the-root-of-madness', 2],
  ] as const)(
    '%s retains its exact move distance despite Voyage movement bonuses',
    (card, distance) => {
      const h = setup();
      discard(h, 6, card);
      h.attack(card);
      h.defend();
      privateChoice(h);
      const moves = Object.values(h.state.resolution.choice!.continuations)
        .flat()
        .filter(
          (t) =>
            t.type === 'operation' && t.operation.kind === 'move' && t.operation.path.length > 0,
        );
      expect(moves.length).toBeGreaterThan(0);
      expect(
        moves.every(
          (t) =>
            t.type === 'operation' &&
            t.operation.kind === 'move' &&
            t.operation.distance === distance &&
            t.operation.path.length <= distance,
        ),
      ).toBe(true);
      const position = h.fighter('p0:ally-1').position;
      h.choose('$stay');
      expect(h.fighter('p0:ally-1').position).toBe(position);
    },
  );
  it('Apes deals two additional damage even when the attack is blocked', () => {
    const h = setup();
    h.attack('sinbad-voyage-to-the-city-of-the-man-eating-apes');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(0);
    expect(h.fighter('p1:main').hp).toBe(13);
  });
  it.each([
    'sinbad-voyage-to-the-city-of-the-king-of-serendib',
    'sinbad-commanding-impact',
    'sinbad-exploit',
  ])('%s draws exactly one after combat', (card) => {
    const h = setup(),
      size = h.state.players[0].hand.length;
    h.attack(card);
    h.defend();
    expect(h.state.players[0].hand).toHaveLength(size);
  });
  it('Riches draws three for one action and cannot be played by the Porter', () => {
    const h = setup(),
      size = h.state.players[0].hand.length;
    h.action('sinbad-riches-beyond-compare');
    expect(h.state.players[0].hand).toHaveLength(size + 2);
    expect(h.state.actions).toBe(1);
  });
  it('By Fortune and Fate draws for the owner even when the attacking Porter is defeated', () => {
    const h = setup();
    h.fighter('p0:ally-1').position = 'n0';
    h.fighter('p0:ally-1').hp = 1;
    h.defs.cards.guard.abilities = [
      {
        id: 'retaliate',
        name: 'Retaliate',
        description: 'Deal damage',
        trigger: 'after-combat',
        effects: [{ type: 'damage', target: 'opponent', amount: 1 }],
      },
    ];
    const before = h.state.players[0].hand.length;
    h.attack('sinbad-by-fortune-and-fate', 'p0:ally-1');
    h.defend('guard');
    expect(h.fighter('p0:ally-1').defeated).toBe(true);
    expect(h.state.players[0].hand).toHaveLength(before + 1);
  });
  it.each([true, false])('Regroup draws two on a win and one otherwise (%s)', (won) => {
    const h = setup(),
      size = h.state.players[0].hand.length;
    h.attack('sinbad-regroup');
    h.defend(won ? null : 'guard');
    expect(h.state.players[0].hand).toHaveLength(size + (won ? 1 : 0));
  });
  it('Momentous Shift reads the exact acting fighter’s turn-start space', () => {
    for (const fighter of ['p0:main', 'p0:ally-1']) {
      const h = setup();
      h.fighter(fighter).position = 'n0';
      h.state.resolution.turnPositions[fighter] = 'n2';
      h.attack('sinbad-momentous-shift', fighter);
      h.defend();
      expect(h.state.revealed?.damage).toBe(5);
    }
  });
  it('Leap Away wins, chooses either exact combat fighter, and restores a private nested move', () => {
    for (const selected of ['p0:main', 'p1:main']) {
      const h = setup();
      h.attack('sinbad-leap-away');
      h.defend();
      privateChoice(h);
      h.choose(selected);
      privateChoice(h);
      h.choose('$stay');
      expect(h.state.resolution.choice).toBeNull();
    }
  });
  it('supports full counts in two and four seat matches with every registered rival', () => {
    for (const rival of Object.keys(characters))
      for (const roster of [
        ['sinbad', rival],
        ['sinbad', rival, 'sinbad', rival],
      ]) {
        const h = deckHarness(basic, roster);
        expect(h.state.fighters.every((f) => f.defeated || f.position !== null)).toBe(true);
        for (const [i, id] of roster.entries())
          expect(
            h.state.fighters.filter((f) => f.player === `p${i}` && f.role === 'ally'),
          ).toHaveLength(characters[id].ally?.count ?? 0);
      }
  });
});
