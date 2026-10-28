import { finishActions } from '../../../../tests/finish-actions';
import { completeDeckSelection } from '../../../../tests/complete-deck-selection';
import { describe, expect, it } from 'vitest';
import {
  createGame,
  deploymentSpaces,
  execute,
  validateDefinitions,
  type Command,
  type Definitions,
  type GameState,
  type Outcome,
} from '@open-boards/game';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { basic as content, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import inventory from '../../../../docs/characters/alice/inventory.json';

function setup(
  edit: (defs: Definitions) => void = () => {},
  roster = ['alice', 'vanguard'],
  keepStartChoice = false,
) {
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
    choose(option?: string | string[]) {
      h.reconnect();
      const c = state.resolution.choice!;
      const outcomes = h.apply(
        {
          type: 'choose',
          choice: c.id,
          options: Array.isArray(option) ? option : [option ?? c.options[0].id],
        },
        c.player,
      );
      while (state.phase.type === 'placing-allies') {
        const f = state.fighters.find((f) => f.position === null)!;
        h.apply(
          {
            type: 'place-ally',
            fighter: f.id,
            position: deploymentSpaces(state, f.id, defs.map)[0],
          },
          f.player,
        );
      }
      return outcomes;
    },
    action(slug: string, fighter = 'p0:main') {
      const card = state.players[0].hand[0];
      card.definition = `alice-${slug}`;
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
  if (!keepStartChoice) state = completeDeckSelection(state, defs);
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  if (!keepStartChoice)
    while (state.resolution.choice?.prompt.startsWith('Curiouser')) h.choose('big');
  return h;
}

function privateChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const c = h.state.resolution.choice!;
  const before = structuredClone(h.state);
  const opponent = c.player === 'p0' ? 'p1' : 'p0';
  expect(projectGame(h.state, opponent, false).choice).toBeNull();
  expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
  const command: Command = { type: 'choose', choice: c.id, options: [c.options[0].id] };
  expect(h.run(command, opponent)).toMatchObject({ ok: false, error: 'ILLEGAL' });
  expect(h.run({ ...command, options: ['$forged'] }, c.player).ok).toBe(false);
  expect(h.run({ ...command, options: [c.options[0].id, c.options[0].id] }, c.player).ok).toBe(
    false,
  );
  expect(execute(h.state, c.player, { id: 'stale', revision: -1, command }, h.defs)).toMatchObject({
    error: 'STALE',
  });
  expect(h.state).toEqual(before);
}

const prefix = 'alice-';
const id = (name: string) => prefix + name;

describe('complete Alice source deck', () => {
  it('preserves all printed copies, values, BOOSTs, tags and timed clauses', () => {
    validateDefinitions(content);
    expect(content.characters.alice).toMatchObject({
      hp: 13,
      movement: 2,
      attackType: 'melee',
      ally: { id: 'alice-jabberwock', count: 1, hp: 8, attackType: 'melee' },
    });
    expect(deckDefinitions('alice')).toHaveLength(30);
    expect(content.characters.alice.deck).toHaveLength(15);
    for (const source of inventory.deck.cards) {
      const card = content.cards[id(source.slug)];
      expect(card).toMatchObject({
        value: source.type === 'scheme' ? 0 : source.value,
        boost: source.boost,
        usableBy: ({ ANY: 'BOTH', ALICE: 'MAIN', JABBERWOCK: 'ALLY' } as Record<string, string>)[
          source.characterName
        ],
      });
      expect(deckDefinitions('alice').filter((c) => c === card.id)).toHaveLength(source.quantity);
      for (const clause of [
        source.basicText,
        source.immediateText,
        source.duringText,
        source.afterText,
      ])
        if (clause) expect(card.description).toContain(clause);
    }
  });
  it.each(['big', 'small'])(
    'offers the mandatory private starting size (%s) before opening hands, ally deployment and either player’s first turn',
    (size) => {
      const h = setup(() => {}, ['vanguard', 'alice'], true);
      expect(h.state.resolution.choice!.player).toBe('p1');
      privateChoice(h);
      expect(h.state.turn).toBe(0);
      expect(h.state.actions).toBe(2);
      expect(h.state.players.every((p) => p.hand.length === 0)).toBe(true);
      expect(h.fighter('p1:ally-1').position).toBeNull();
      expect(h.fighter('p1:main').statuses).toEqual([]);
      h.choose(size);
      expect(h.fighter('p1:main').statuses).toEqual([{ id: size, stacks: 1 }]);
      expect(h.state.phase.type).toBe('taking-actions');
      expect(h.state.turn).toBe(0);
    },
  );
  it('resolves four independently owned size choices in seat order through JSON recovery', () => {
    const h = setup(() => {}, ['alice', 'alice', 'alice', 'alice'], true);
    for (let i = 0; i < 4; i++) {
      expect(h.state.resolution.choice!.player).toBe(`p${i}`);
      h.choose(i % 2 ? 'small' : 'big');
    }
    expect(h.state.fighters.filter((f) => f.role === 'main').map((f) => f.statuses[0].id)).toEqual([
      'big',
      'small',
      'big',
      'small',
    ]);
    expect(h.state.fighters.filter((f) => f.role === 'ally').every((f) => !f.statuses.length)).toBe(
      true,
    );
    expect(h.state.phase.type).toBe('taking-actions');
  });
  it.each(['alice-feint', 'alice-momentous-shift'])(
    'BIG increases Alice’s ANY attacks even when effects are cancelled (%s)',
    (card) => {
      const h = setup();
      h.attack(card);
      h.defend('medusa-feint');
      expect(h.fighter('p1:main').hp).toBe(15 - (content.cards[card].value + 2 - 2));
    },
  );
  it('BIG does not benefit the Jabberwock or Alice’s defense', () => {
    const h = setup();
    h.attack(id('claws-that-catch'), 'p0:ally-1');
    h.defend();
    expect(h.fighter('p1:main').hp).toBe(10);
    const c = setup();
    c.attack('strike', 'p1:main', 'p0:main');
    c.defend(id('feint'), 'p0');
    expect(c.fighter().hp).toBe(11);
  });
  it.each([null, 'alice-feint', 'alice-looking-glass'])(
    'SMALL requires a defense card (%s)',
    (card) => {
      const h = setup(() => {}, undefined, true);
      h.choose('small');
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend(card, 'p0');
      expect(h.fighter().hp).toBe(card ? 12 : 9);
    },
  );
  it('size benefits survive card-only locks but obey a final ignored combat value', () => {
    const h = setup();
    h.attack(id('o-frabjous-day'));
    h.defend('invisible-man-impossible-to-see');
    // Impossible to See fixes card value at 0; the character special still adds 2.
    expect(h.fighter('p1:main').hp).toBe(15);
    const c = setup((defs) => {
      defs.cards.guard.abilities = [
        {
          id: 'ignore',
          name: 'Ignore',
          description: 'Ignore the opposing value.',
          trigger: 'combat-reveal',
          effects: [{ type: 'ignore-combat-value', target: 'opponent' }],
        },
      ];
    });
    c.attack(id('o-frabjous-day'));
    c.defend('guard');
    expect(c.fighter('p1:main').hp).toBe(15);
  });
  it.each(['drink-me', 'eat-me'])(
    'scheme %s resolves its first effect before changing size',
    (slug) => {
      const h = setup();
      h.action(slug);
      if (slug === 'eat-me') {
        expect(h.fighter().statuses[0].id).toBe('big');
        h.choose('$stay');
      } else expect(h.state.players[0].hand).toHaveLength(6);
      expect(h.fighter().statuses).toEqual([{ id: 'small', stacks: 1 }]);
      if (slug === 'eat-me') {
        h.action(slug);
        h.choose('$stay');
        expect(h.fighter().statuses).toEqual([{ id: 'big', stacks: 1 }]);
      }
      expect(h.fighter('p0:ally-1').statuses).toEqual([]);
    },
  );
  it.each([
    ['i-m-late-i-m-late', 5],
    ['the-other-side-of-the-mushroom', 3],
  ] as const)(
    '%s moves then changes size through a recovered destination choice',
    (slug, distance) => {
      const h = setup();
      h.attack(id(slug));
      h.defend();
      expect(h.fighter().statuses[0].id).toBe('big');
      privateChoice(h);
      expect(h.state.resolution.choice!.options.length).toBeGreaterThan(distance);
      h.choose('$stay');
      expect(h.fighter().statuses[0].id).toBe('small');
    },
  );
  it('O Frabjous Day changes size after damage; Feint cancels the change but preserves BIG’s bonus', () => {
    const h = setup();
    h.attack(id('o-frabjous-day'));
    h.defend();
    expect(h.fighter('p1:main').hp).toBe(9);
    expect(h.fighter().statuses[0].id).toBe('small');
    const c = setup();
    c.attack(id('o-frabjous-day'));
    c.defend('medusa-feint');
    expect(c.fighter('p1:main').hp).toBe(11);
    expect(c.fighter().statuses[0].id).toBe('big');
  });
  it('Mad as a Hatter moves both owned pieces once in chosen order before changing size', () => {
    const h = setup();
    h.attack(id('mad-as-a-hatter'));
    h.defend();
    privateChoice(h);
    h.choose('p0:ally-1');
    h.choose('$stay');
    expect(h.fighter().statuses[0].id).toBe('big');
    h.choose('p0:main');
    h.choose('$stay');
    expect(h.fighter().statuses[0].id).toBe('small');
    expect(h.state.resolution.choice).toBeNull();
  });
  it.each([true, false])(
    'Claws That Catch checks the exact opposing fighter’s role (hero=%s)',
    (hero) => {
      const h = setup(() => {}, ['alice', 'alice']);
      h.attack(id('claws-that-catch'), 'p0:ally-1', hero ? 'p1:main' : 'p1:ally-1');
      h.defend();
      expect(h.fighter(hero ? 'p1:main' : 'p1:ally-1').hp).toBe(hero ? 8 : 5);
    },
  );
  it.each([true, false])(
    'Manxome Foe adds the top card’s BOOST to its active combat field (attacking=%s)',
    (attacking) => {
      const h = setup();
      h.state.players[0].deck[0].definition = id('looking-glass');
      const top = h.state.players[0].deck[0].id;
      if (attacking) {
        h.attack(id('manxome-foe'));
        h.defend('guard');
        expect(h.fighter('p1:main').hp).toBe(9);
      } else {
        h.attack('strike', 'p1:main', 'p0:main');
        h.defend(id('manxome-foe'), 'p0');
        expect(h.fighter().hp).toBe(13);
      }
      expect(h.state.players[0].discard.some((c) => c.id === top)).toBe(true);
    },
  );
  it('Manxome Foe does not exhaust an empty deck and Feint prevents its discard', () => {
    const h = setup();
    h.state.players[0].deck = [];
    h.attack(id('manxome-foe'));
    h.defend();
    expect(h.fighter().hp).toBe(13);
    expect(h.fighter('p1:main').hp).toBe(10);
    const c = setup();
    const n = c.state.players[0].deck.length;
    c.attack(id('manxome-foe'));
    c.defend('medusa-feint');
    expect(c.state.players[0].deck).toHaveLength(n);
  });
  it.each([
    ['draw', 'heal'],
    ['heal', 'draw'],
    ['place', 'draw'],
    ['draw', 'place'],
    ['place', 'heal'],
    ['heal', 'place'],
  ])('Looking Glass resolves two distinct effects in submitted order (%s, %s)', (first, second) => {
    const h = setup();
    h.fighter().hp = 7;
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend(id('looking-glass'), 'p0');
    privateChoice(h);
    expect(h.state.resolution.choice).toMatchObject({ min: 2, max: 2 });
    const c = h.state.resolution.choice!;
    expect(h.run({ type: 'choose', choice: c.id, options: [first] }, 'p0').ok).toBe(false);
    h.choose([first, second]);
    if ([first, second].includes('place')) {
      privateChoice(h);
      expect(h.state.resolution.choice!.options.map((o) => o.id)).not.toContain(
        h.fighter().position,
      );
      expect(h.state.resolution.choice!.options.map((o) => o.id)).not.toContain('$stay');
      h.choose();
    }
    expect(h.fighter().hp).toBe([first, second].includes('heal') ? 8 : 5);
    expect(h.state.players[0].hand).toHaveLength([first, second].includes('draw') ? 6 : 4);
    expect(h.state.resolution.choice).toBeNull();
  });
  it('Looking Glass resolves even an ineffectual heal as a distinct chosen effect', () => {
    const h = setup((defs) => {
      defs.cards.strike.value = 0;
    });
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend(id('looking-glass'), 'p0');
    h.choose(['heal', 'draw']);
    expect(h.fighter().hp).toBe(13);
    expect(h.state.players[0].hand).toHaveLength(6);
  });
  it('Snicker-Snack privately inspects and discards an exact opposing card after a win', () => {
    const h = setup();
    h.attack(id('snicker-snack'));
    h.defend();
    privateChoice(h);
    const card = h.state.players[1].hand[2];
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toContain(card.id);
    h.choose(card.id);
    expect(h.state.players[1].discard.some((c) => c.id === card.id)).toBe(true);
    const c = setup((defs) => {
      defs.cards.guard.value = 7;
    });
    c.attack(id('snicker-snack'));
    c.defend('guard');
    expect(c.state.resolution.choice).toBeNull();
  });
  it.each(['p0:main', 'p1:main'])(
    'Jaws That Bite can damage an adjacent friendly or enemy fighter (%s)',
    (target) => {
      const h = setup();
      h.fighter().position = 'n9';
      h.attack(id('jaws-that-bite'), 'p0:ally-1');
      h.defend();
      privateChoice(h);
      expect(h.state.resolution.choice!.options.map((o) => o.id)).toContain(target);
      const hp = h.fighter(target).hp;
      h.choose(target);
      expect(h.fighter(target).hp).toBe(hp - 2);
    },
  );
  it('Momentous Shift keeps BIG’s additive bonus after printed replacement', () => {
    const h = setup();
    h.state.resolution.turnPositions['p0:main'] = 'n4';
    h.attack(id('momentous-shift'));
    h.defend();
    expect(h.fighter('p1:main').hp).toBe(8);
  });
  it.each(['p0:main', 'p0:ally-1'])(
    'rejects the other fighter’s restricted cards without mutation (%s)',
    (fighter) => {
      const h = setup();
      const card = h.state.players[0].hand[0];
      card.definition = id(fighter === 'p0:main' ? 'claws-that-catch' : 'o-frabjous-day');
      h.fighter(fighter).position = 'n0';
      h.fighter('p1:main').position = 'n1';
      const before = structuredClone(h.state);
      expect(h.run({ type: 'attack', fighter, target: 'p1:main', card: card.id }).ok).toBe(false);
      expect(h.state).toEqual(before);
    },
  );
  it.each([true, false])('Regroup draws two only after a win (win=%s)', (win) => {
    const h = setup();
    h.attack(id('regroup'));
    h.defend(win ? null : 'guard');
    expect(h.state.players[0].hand).toHaveLength(win ? 6 : 5);
  });
  it.each(['self', 'opponent'])(
    'Skirmish lets the winner move either exact combat fighter (%s)',
    (selected) => {
      const h = setup();
      h.attack(id('skirmish'));
      h.defend('guard');
      privateChoice(h);
      h.choose(selected);
      expect(h.state.resolution.choice!.source?.fighter).toBe('p0:main');
      h.choose('$stay');
      expect(h.state.resolution.choice).toBeNull();
      const c = setup((defs) => {
        defs.cards.guard.value = 9;
      });
      c.attack(id('skirmish'));
      c.defend('guard');
      expect(c.state.resolution.choice).toBeNull();
    },
  );
  it('the defeated Jabberwock still resolves its committed Jaws That Bite beside its final space', () => {
    const c = setup((defs) => {
      defs.cards.guard.abilities = [
        {
          id: 'retaliate',
          name: 'Retaliate',
          description: 'Damage the opposing fighter.',
          trigger: 'after-combat',
          effects: [{ type: 'damage', target: 'opponent', amount: 8 }],
        },
      ];
    });
    c.fighter().position = 'n9';
    c.attack(id('jaws-that-bite'), 'p0:ally-1');
    c.defend('guard');
    expect(c.fighter('p0:ally-1').defeated).toBe(true);
    privateChoice(c);
    c.choose('p0:main');
    expect(c.fighter().hp).toBe(11);
  });
});
