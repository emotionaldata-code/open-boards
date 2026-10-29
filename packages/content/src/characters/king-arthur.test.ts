import { finishActions } from '../../../../tests/finish-actions';
import { completeDeckSelection } from '../../../../tests/complete-deck-selection';
import { describe, expect, it } from 'vitest';
import {
  createGame,
  deploymentSpaces,
  execute,
  forfeit,
  validateDefinitions,
  type Command,
  type Definitions,
  type GameState,
  type Outcome,
} from '@open-boards/game';
import { projectGame, projectOutcomes } from '../../../../apps/server/src/transport/projection';
import { basic as content, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import inventory from '../../../../docs/characters/drafts/king-arthur/inventory.json';

function setup(edit: (defs: Definitions) => void = () => {}, roster = ['king-arthur', 'vanguard']) {
  const defs = structuredClone({
    ...content,
    characters: { ...content.characters, ...neutral.characters },
    cards: { ...content.cards, ...neutral.cards },
  });
  edit(defs);
  let state = createGame(
    roster.map((character, i) => ({
      id: `p${i}`,
      name: `Seat ${i}`,
      character,
      deck: defs.characters[character].deck
        .flatMap(({ card, count }) => Array<string>(count).fill(card))
        .map((definition, j) => ({ id: `p${i}-${j}`, definition })),
    })),
    defs,
    731,
  );
  const h = {
    defs,
    get state() {
      return state;
    },
    fighter(id = 'p0:main') {
      return state.fighters.find((f) => f.id === id)!;
    },
    reconnect() {
      state = JSON.parse(JSON.stringify(state)) as GameState;
    },
    finishTurn(actor = 'p0') {
      const result = finishActions(state, defs, actor);
      state = result.state;
      return result.outcomes;
    },
    run(command: Command, actor = 'p0') {
      return execute(
        state,
        actor,
        { id: `c-${state.revision}`, revision: state.revision, command },
        defs,
      );
    },
    apply(command: Command, actor = 'p0'): Outcome[] {
      const result = h.run(command, actor);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      return result.outcomes;
    },
    choose(option?: string) {
      h.reconnect();
      const c = state.resolution.choice!;
      return h.apply(
        { type: 'choose', choice: c.id, options: [option ?? c.options[0].id] },
        c.player,
      );
    },
    action(slug: string, fighter = 'p0:ally-1') {
      const card = state.players[0].hand[0];
      card.definition = `king-arthur-${slug}`;
      return h.apply({ type: 'play-action', fighter, card: card.id });
    },
    attack(slug: string, attacking = 'p0:main', defending = 'p1:main') {
      h.fighter(attacking).position = 'n0';
      h.fighter(defending).position = 'n1';
      const actor = h.fighter(attacking).player;
      state.turn = state.players.findIndex((p) => p.id === actor);
      const card = state.players[state.turn].hand[0];
      card.definition = slug;
      return h.apply(
        { type: 'attack', fighter: attacking, target: defending, card: card.id },
        actor,
      );
    },
    defend(slug: string | null = null, actor = 'p1') {
      const p = state.players.find((p) => p.id === actor)!;
      if (slug) p.hand[0].definition = slug;
      return h.apply({ type: 'defend', card: slug ? p.hand[0].id : null }, actor);
    },
  };
  state = completeDeckSelection(state, defs);
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => !f.defeated && f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  h.fighter('p0:ally-1').position = 'n5';
  return h;
}

function privateChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const choice = h.state.resolution.choice!;
  const snapshot = structuredClone(h.state);
  for (const viewer of ['p1', 'spectator']) {
    const view = projectGame(h.state, viewer, false);
    expect(view.choice).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/continuations|turnPositions|"random"/);
  }
  const command: Command = { type: 'choose', choice: choice.id, options: [choice.options[0].id] };
  expect(h.run(command, 'p1')).toMatchObject({ ok: false, error: 'ILLEGAL' });
  expect(h.run({ ...command, options: ['$forged'] })).toMatchObject({
    ok: false,
    error: 'ILLEGAL',
  });
  expect(h.run({ ...command, options: [choice.options[0].id, choice.options[0].id] }).ok).toBe(
    false,
  );
  expect(execute(h.state, 'p0', { id: 'stale', revision: -1, command }, h.defs)).toMatchObject({
    error: 'STALE',
  });
  expect(h.state).toEqual(snapshot);
}

describe('complete printed King Arthur deck', () => {
  it('preserves all source quantities, values, tags, clauses and original artwork', () => {
    expect(() => validateDefinitions(content)).not.toThrow();
    expect(deckDefinitions('king-arthur')).toHaveLength(30);
    expect(content.characters['king-arthur'].deck).toHaveLength(16);
    expect(content.characters['king-arthur']).toMatchObject({
      hp: 18,
      movement: 2,
      attackType: 'melee',
      ally: { hp: 7, count: 1, attackType: 'ranged' },
    });
    for (const source of inventory.cards) {
      const card = content.cards[source.id];
      expect(card).toMatchObject({
        name: source.name,
        usableBy: source.usableBy,
        category: source.category,
        value: source.value,
        boost: source.boost,
      });
      expect(deckDefinitions('king-arthur').filter((id) => id === source.id)).toHaveLength(
        source.count,
      );
      for (const text of Object.values(source.sourceRules))
        expect(card.description).toContain(text);
      expect(
        card.category === 'action'
          ? card.effects?.length
          : card.id.endsWith('excalibur') || card.abilities?.length,
      ).toBeTruthy();
    }
  });

  it.each(['MAIN', 'ALLY'] as const)(
    'enforces every %s restriction for attacks, defense and schemes',
    (tag) => {
      for (const source of inventory.cards.filter((c) => c.usableBy === tag)) {
        const h = setup();
        const wrong = tag === 'MAIN' ? 'p0:ally-1' : 'p0:main';
        const card = h.state.players[0].hand[0];
        card.definition = source.id;
        const before = structuredClone(h.state);
        if (source.category === 'action')
          expect(h.run({ type: 'play-action', fighter: wrong, card: card.id }).ok).toBe(false);
        else if (source.category !== 'defense') {
          h.fighter(wrong).position = 'n0';
          h.fighter('p1:main').position = 'n1';
          expect(
            h.run({ type: 'attack', fighter: wrong, target: 'p1:main', card: card.id }).ok,
          ).toBe(false);
        } else {
          h.attack('strike', 'p1:main', wrong);
          expect(h.run({ type: 'defend', card: card.id }).ok).toBe(false);
        }
        expect(h.state.players[0].hand).toEqual(before.players[0].hand);
      }
    },
  );

  it('commits two independent BOOSTs privately then publicly, consumes each once and ignores payment effects', () => {
    const h = setup();
    h.state.players[0].hand[1].definition = 'king-arthur-the-aid-of-morgana';
    h.state.players[0].hand[2].definition = 'king-arthur-prophecy';
    h.attack('king-arthur-noble-sacrifice');
    privateChoice(h);
    const first = h.state.players[0].hand[0].id;
    h.choose(first);
    expect(projectGame(h.state, 'p1', false).revealed).toBeNull();
    expect(h.state.players[0].discard.some((c) => c.id === first)).toBe(false);
    h.defend();
    privateChoice(h);
    const second = h.state.players[0].hand[0].id;
    const outcomes = h.choose(second);
    expect(h.state.revealed).toMatchObject({
      damage: 6,
      boosts: [
        { card: { id: first }, amount: 2 },
        { card: { id: second }, amount: 2 },
      ],
    });
    expect(h.state.players[0].hand).toHaveLength(2);
    expect(h.state.players[0].discard.filter((c) => [first, second].includes(c.id))).toHaveLength(
      2,
    );
    expect(outcomes.filter((o) => o.type === 'draw')).toHaveLength(0);
    expect(h.state.resolution.frames).toEqual({});
  });

  it.each([
    ['king-arthur-noble-sacrifice', 0, 0],
    ['king-arthur-excalibur', 3, 7],
  ])(
    'Feint cancels real effects and the sensitive payment, preserving effectless %s',
    (attack, bonus, damage) => {
      const h = setup();
      h.state.players[0].hand[1].definition = 'king-arthur-excalibur';
      h.attack(attack as string);
      h.choose();
      const outcomes = h.defend('king-arthur-feint');
      expect(h.state.revealed).toMatchObject({ damage, boosts: [{ amount: bonus }] });
      expect(outcomes.filter((o) => o.type === 'boost')).toMatchObject([{ amount: bonus }]);
      expect(h.state.phase.type).toBe('taking-actions');
    },
  );

  it.each(['before-attack', 'card-played'] as const)(
    'sensitive BOOST checks pending effects at %s rather than just card text',
    (trigger) => {
      const h = setup((defs) => {
        defs.cards.strike.abilities = [
          {
            id: 'draw',
            name: 'Draw',
            description: 'Draw one',
            trigger,
            effects: [{ type: 'draw', count: 1 }],
          },
        ];
      });
      h.state.players[0].hand[1].definition = 'king-arthur-excalibur';
      h.attack('strike');
      h.choose();
      h.defend('king-arthur-feint');
      expect(h.state.revealed?.boosts[0].amount).toBe(trigger === 'before-attack' ? 3 : 0);
      expect(h.state.revealed?.damage).toBe(trigger === 'before-attack' ? 5 : 2);
      expect(h.state.players[0].hand).toHaveLength(trigger === 'before-attack' ? 4 : 3);
    },
  );

  it('can skip the special and use Noble Sacrifice later; Merlin receives no special grant', () => {
    const h = setup();
    h.attack('king-arthur-noble-sacrifice');
    h.choose('$skip');
    h.defend();
    expect(h.state.resolution.choice?.prompt).toBe('Boost attack');
    h.choose();
    expect(h.state.revealed?.boosts).toHaveLength(1);
    const m = setup();
    m.attack('king-arthur-aid-the-chosen-one', 'p0:ally-1');
    expect(m.state.phase.type).toBe('awaiting-defense');
  });

  it.each([1, 4, 5, 0])(
    'sets the Grail to exactly eight from post-combat HP %i only while alive and wounded',
    (hp) => {
      const h = setup((defs) => {
        defs.characters['king-arthur'].abilities!.push({
          id: 'healing-tax',
          name: 'Tax',
          description: 'Reduce healing',
          trigger: 'before-heal',
          effects: [{ type: 'cancel' }],
        });
      });
      h.fighter().hp = hp || 1;
      h.attack('strike', 'p1:main', 'p0:main');
      // 4 attack against 1 defense: start three above the desired post-combat HP.
      h.fighter().hp = hp ? hp + 3 : 3;
      h.defend('king-arthur-the-holy-grail', 'p0');
      expect(h.fighter().hp).toBe(hp && hp <= 4 ? 8 : hp);
      expect(h.fighter().defeated).toBe(hp === 0);
    },
  );

  it.each(['deck', 'discard'] as const)(
    'recovers Excalibur from %s with conditional deterministic shuffle',
    (zone) => {
      const h = setup();
      const p = h.state.players[0];
      for (const c of [...p.hand, ...p.deck])
        if (c.definition === 'king-arthur-excalibur') c.definition = 'king-arthur-feint';
      const sword = { id: 'sword', definition: 'king-arthur-excalibur' };
      p[zone].push(sword);
      const before = p.deck.map((c) => c.id);
      const seed = h.state.resolution.random;
      h.action('the-lady-of-the-lake', 'p0:main');
      privateChoice(h);
      const saved = structuredClone(h.state),
        choice = h.state.resolution.choice!;
      h.choose(zone);
      expect(h.state.players[0].hand).toContainEqual(sword);
      const replay = execute(
        saved,
        'p0',
        {
          id: 'replay',
          revision: saved.revision,
          command: { type: 'choose', choice: choice.id, options: [zone] },
        },
        h.defs,
      );
      expect(replay.ok && replay.state.players[0].deck).toEqual(h.state.players[0].deck);
      if (zone === 'deck') expect(h.state.resolution.random).not.toBe(seed);
      else expect(h.state.players[0].deck.map((c) => c.id)).toEqual(before);
    },
  );

  it('continues from an empty discard search into the deck instead of losing the target', () => {
    const h = setup();
    const sword = h.state.players[0].deck.find((c) => c.definition === 'king-arthur-excalibur')!;
    h.action('the-lady-of-the-lake', 'p0:main');
    h.choose('discard');
    expect(h.state.players[0].hand).toContainEqual(sword);
    expect(h.state.resolution.random).not.toBe(731);
  });

  it('handles an absent search target without duplication and still shuffles a searched deck', () => {
    const h = setup();
    for (const c of h.state.players[0].deck)
      if (c.definition.endsWith('excalibur')) c.definition = 'king-arthur-feint';
    const before = h.state.players[0].hand.length;
    h.action('the-lady-of-the-lake', 'p0:main');
    h.choose('deck');
    expect(h.state.players[0].hand).toHaveLength(before - 1);
    expect(h.state.resolution.random).not.toBe(731);
  });

  it.each([0, 1, 2, 3, 4])(
    'Prophecy privately inspects a %i-card deck, takes up to two and orders the rest',
    (size) => {
      const h = setup();
      h.state.players[0].deck = h.state.players[0].deck.slice(0, size);
      const cards = [...h.state.players[0].deck];
      const outcomes = [...h.action('prophecy')];
      if (size) {
        privateChoice(h);
        expect(projectGame(h.state, 'p0', false).choice?.options.map((o) => o.card)).toEqual(cards);
        outcomes.push(...h.choose(cards.at(-1)!.id));
        if (size > 1) {
          privateChoice(h);
          outcomes.push(...h.choose(cards[0].id));
        }
        if (size > 3) {
          privateChoice(h);
          outcomes.push(...h.choose(cards[2].id));
        }
      }
      const p = h.state.players[0];
      expect(p.hand).toHaveLength(4 + Math.min(size, 2));
      expect(p.deck.map((c) => c.id)).toEqual(
        size === 4 ? [cards[2].id, cards[1].id] : size === 3 ? [cards[1].id] : [],
      );
      expect(projectOutcomes(outcomes, 'p1').filter((o) => o.type === 'draw')).toEqual([]);
      expect(h.fighter().hp).toBe(18); // inspection is not an exhaustion draw
    },
  );

  it('Bewilderment prevents combat and nested effect damage, then permits optional placement and expires', () => {
    const h = setup((defs) => {
      defs.cards.strike.abilities = [
        {
          id: 'damage',
          name: 'Damage',
          description: 'After damage',
          trigger: 'after-combat',
          effects: [{ type: 'damage', target: 'opponent', amount: 2 }],
        },
      ];
    });
    h.attack('strike', 'p1:main', 'p0:ally-1');
    h.defend('king-arthur-bewilderment', 'p0');
    expect(h.fighter('p0:ally-1').hp).toBe(7);
    expect(h.state.revealed?.damage).toBe(0);
    h.choose('$stay');
    expect(h.fighter('p0:ally-1').hp).toBe(7);
    expect(h.state.resolution.frames).toEqual({});
    h.state.actions = 2;
    h.attack('strike', 'p1:main', 'p0:ally-1');
    h.defend(null, 'p0');
    expect(h.fighter('p0:ally-1').hp).toBe(1);
  });

  it('Feint suppresses Bewilderment prevention and teleport', () => {
    const h = setup();
    h.attack('king-arthur-feint', 'p1:main', 'p0:ally-1');
    h.defend('king-arthur-bewilderment', 'p0');
    expect(h.fighter('p0:ally-1').hp).toBe(5);
    expect(h.state.resolution.choice).toBeNull();
  });

  it.each([false, true])(
    'Restless Spirits hits exact spaces and draws once only on its own defeat (%s)',
    (defeat) => {
      const h = setup(() => {}, ['king-arthur', 'medusa']);
      while (h.state.resolution.choice) h.choose('skip');
      h.fighter('p0:ally-1').position = 'n0';
      h.fighter('p1:main').position = 'n1';
      h.fighter('p1:main').hp = defeat ? 2 : 16;
      h.fighter('p1:ally-1').position = 'n5';
      h.fighter('p1:ally-2').position = 'n9';
      h.fighter('p1:ally-3').position = 'n10';
      const hand = h.state.players[0].hand.length;
      h.action('restless-spirits');
      privateChoice(h);
      h.choose('n1');
      privateChoice(h);
      const options = h.state.resolution.choice!.options.map((o) => o.id);
      expect(options).toContain('n0');
      expect(options).not.toContain('n11'); // portals are not physical adjacency
      h.choose('n0');
      expect(h.fighter().hp).toBe(18);
      expect(h.fighter('p0:ally-1').hp).toBe(7);
      expect(h.fighter('p1:main').hp).toBe(defeat ? 0 : 14);
      expect(h.state.players[0].hand).toHaveLength(hand - 1 + Number(defeat));
      expect(h.fighter('p1:ally-1').hp).toBe(defeat ? 0 : 1);
    },
  );

  it('does not credit Restless Spirits for a defeat caused by a separate damage reaction', () => {
    const h = setup((defs) => {
      defs.characters.vanguard.abilities = [
        {
          id: 'retaliation',
          name: 'Retaliation',
          description: 'Damage an ally after being hit',
          trigger: 'after-damage',
          effects: [{ type: 'damage', target: 'self', amount: 20 }],
        },
      ];
    });
    h.fighter('p0:ally-1').position = 'n0';
    h.fighter('p1:main').position = 'n1';
    const hand = h.state.players[0].hand.length;
    h.action('restless-spirits');
    h.choose('n1');
    h.choose('n0');
    expect(h.fighter('p1:main').defeated).toBe(true);
    expect(h.state.players[0].hand).toHaveLength(hand - 1);
  });

  it('Restless Spirits permits empty spaces and multiple defeats produce one draw', () => {
    const h = setup(() => {}, ['king-arthur', 'medusa']);
    h.fighter('p0:ally-1').position = 'n0';
    h.fighter('p1:ally-1').position = 'n1';
    h.fighter('p1:ally-2').position = 'n5';
    const hand = h.state.players[0].hand.length;
    h.action('restless-spirits');
    h.choose('n1');
    h.choose('n5');
    expect(h.state.players[0].hand).toHaveLength(hand);
    expect(h.fighter('p1:ally-1').defeated).toBe(true);
    expect(h.fighter('p1:ally-2').defeated).toBe(true);
  });

  it.each(['p0:main', 'p0:ally-1'])(
    'Momentous Shift replaces printed value for %s while preserving BOOST/modifiers',
    (fighter) => {
      const h = setup((defs) => {
        defs.statuses!.focus = {
          id: 'focus',
          name: 'Focus',
          maxStacks: 1,
          modifiers: { attack: 1 },
        };
      });
      h.state.resolution.turnPositions[fighter] = 'n5';
      h.fighter(fighter).statuses.push({ id: 'focus', stacks: 1 });
      h.attack('king-arthur-momentous-shift', fighter);
      if (fighter === 'p0:main') h.choose();
      h.defend();
      expect(h.state.revealed?.damage).toBe(fighter === 'p0:main' ? 7 : 6);
    },
  );

  it('Momentous Shift works on defense, fails after returning, and captures the whole board before turn hooks', () => {
    const h = setup();
    h.state.resolution.turnPositions['p0:main'] = 'n5';
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('king-arthur-momentous-shift', 'p0');
    expect(h.state.revealed?.damage).toBe(0);
    h.state.actions = 2;
    h.state.resolution.turnPositions['p0:main'] = 'n1';
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('king-arthur-momentous-shift', 'p0');
    expect(h.state.revealed?.damage).toBe(1);
    h.finishTurn('p1');
    expect(h.state.resolution.turnPositions).toEqual(
      Object.fromEntries(h.state.fighters.map((f) => [f.id, f.position])),
    );
  });

  it('remaining cards resolve exact fighter movement, draw branches and both combat participants', () => {
    for (const [slug, expected] of [
      ['the-aid-of-morgana', 6],
      ['regroup', 6],
      ['aid-the-chosen-one', 6],
    ] as const) {
      const h = setup();
      const ally = slug === 'aid-the-chosen-one';
      h.attack(`king-arthur-${slug}`, ally ? 'p0:ally-1' : 'p0:main');
      if (!ally) h.choose('$skip');
      h.defend();
      expect(h.state.players[0].hand).toHaveLength(expected);
    }
    for (const slug of ['divine-intervention', 'swift-strike']) {
      const h = setup();
      h.attack(`king-arthur-${slug}`);
      h.choose('$skip');
      h.defend();
      expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
      const allyPosition = h.fighter('p0:ally-1').position;
      h.choose('$stay');
      expect(h.fighter('p0:ally-1').position).toBe(allyPosition);
    }
    const h = setup();
    h.attack('king-arthur-skirmish');
    h.choose('$skip');
    h.defend();
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual(['self', 'opponent']);
    h.choose('opponent');
    h.choose('$stay');
    const g = setup();
    g.action('command-the-storms');
    const moved: string[] = [];
    while (g.state.resolution.choice) {
      const c = g.state.resolution.choice;
      if (c.prompt === 'Choose the next fighter') {
        moved.push(c.options[0].id);
        g.choose();
      } else g.choose('$stay');
    }
    expect(new Set(moved)).toEqual(new Set(g.state.fighters.map((f) => f.id)));
  });

  it('forfeit consumes hidden BOOST once and cancels private inspection without revealing it', () => {
    const h = setup();
    h.attack('king-arthur-excalibur');
    h.choose();
    const result = forfeit(h.state, 'p1', h.defs);
    expect(result.state.players[0].discard).toHaveLength(2);
    const p = setup();
    p.action('prophecy');
    const cancelled = forfeit(p.state, 'p0', p.defs);
    expect(cancelled.state.resolution.choice).toBeNull();
    expect(projectOutcomes(cancelled.outcomes, 'p1').some((o) => o.type === 'draw')).toBe(false);
  });
});
