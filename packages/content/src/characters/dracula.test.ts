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
import inventory from '../../../../docs/characters/dracula/inventory.json';

function setup(edit: (defs: Definitions) => void = () => {}, roster = ['dracula', 'vanguard']) {
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
      return h.apply(
        {
          type: 'choose',
          choice: c.id,
          options: Array.isArray(option) ? option : [option ?? c.options[0].id],
        },
        c.player,
      );
    },
    action(slug: string, fighter = 'p0:main') {
      const card = state.players[0].hand[0];
      card.definition = `dracula-${slug}`;
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
    const f = state.fighters.find((f) => f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  if (state.resolution.choice?.prompt === 'Bloodthirsty') h.choose('skip');
  for (let i = 1; i <= 3; i++) h.fighter(`p0:ally-${i}`).position = `n${20 + i}`;
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

describe('complete printed Dracula deck', () => {
  it('preserves all 30 copies, 13 designs, stats, restrictions, BOOSTs and source clauses', () => {
    validateDefinitions(content);
    expect(deckDefinitions('dracula')).toHaveLength(30);
    expect(content.characters.dracula).toMatchObject({
      hp: 13,
      movement: 2,
      attackType: 'melee',
      ally: { count: 3, hp: 1, attackType: 'melee' },
    });
    expect(content.characters.dracula.deck).toHaveLength(13);
    for (const card of inventory.cards) {
      const { id, name, category, usableBy, value, boost, count } = card;
      expect(content.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(deckDefinitions('dracula').filter((id) => id === card.id)).toHaveLength(count);
      for (const text of Object.values(card.sourceRules))
        expect(content.cards[id].description).toContain(text);
    }
  });

  it.each(['MAIN', 'ALLY'] as const)('enforces each %s restriction without mutation', (tag) => {
    for (const card of inventory.cards.filter((c) => c.usableBy === tag)) {
      const h = setup(),
        wrong = tag === 'MAIN' ? 'p0:ally-1' : 'p0:main';
      const instance = h.state.players[0].hand[0];
      instance.definition = card.id;
      if (card.category === 'action') {
        const before = structuredClone(h.state);
        expect(h.run({ type: 'play-action', fighter: wrong, card: instance.id }).ok).toBe(false);
        expect(h.state).toEqual(before);
      } else {
        if (card.category !== 'defense') {
          h.fighter(wrong).position = 'n0';
          h.fighter('p1:main').position = 'n1';
          const before = structuredClone(h.state);
          expect(
            h.run({ type: 'attack', fighter: wrong, target: 'p1:main', card: instance.id }).ok,
          ).toBe(false);
          expect(h.state).toEqual(before);
        }
        if (card.category !== 'attack') {
          h.attack('strike', 'p1:main', wrong);
          const before = structuredClone(h.state);
          expect(h.run({ type: 'defend', card: instance.id }).ok).toBe(false);
          expect(h.state).toEqual(before);
        }
      }
    }
  });

  it.each(['p0:ally-1', 'p1:main'])(
    'Bloodthirsty damages the exact friendly/enemy fighter %s before drawing',
    (target) => {
      const h = setup();
      h.fighter().position = 'n0';
      h.fighter(target).position = 'n1';
      // End the rival turn to invoke the actual turn-start hook.
      h.state.turn = 1;
      h.state.actions = 1;
      h.apply({ type: 'maneuver' }, 'p1');
      h.apply({ type: 'finish-maneuver' }, 'p1');
      privateChoice(h);
      h.choose('use');
      privateChoice(h);
      expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain(target);
      const before = h.state.players[0].hand.length;
      h.choose(target);
      expect(h.fighter(target).hp).toBe(target.includes('ally') ? 0 : 14);
      expect(h.state.players[0].hand).toHaveLength(before + 1);
    },
  );

  it('Bloodthirsty draws nothing when damage is prevented, and permits skipping without a target', () => {
    const h = setup((d) => {
      d.characters.vanguard.abilities = [
        {
          id: 'ward',
          name: 'Ward',
          description: 'Cancel damage',
          trigger: 'before-damage',
          effects: [{ type: 'cancel' }],
        },
      ];
    });
    h.fighter().position = 'n0';
    h.fighter('p1:main').position = 'n1';
    h.state.turn = 1;
    h.state.actions = 1;
    h.apply({ type: 'maneuver' }, 'p1');
    h.apply({ type: 'finish-maneuver' }, 'p1');
    h.choose('use');
    const hand = h.state.players[0].hand.length;
    h.choose('p1:main');
    expect(h.fighter('p1:main').hp).toBe(15);
    expect(h.state.players[0].hand).toHaveLength(hand);
  });

  it.each([0, 1, 3])(
    'Feeding Frenzy counts %i living owned Sisters sharing any opposing zone once',
    (count) => {
      const h = setup();
      h.attack('dracula-feeding-frenzy');
      h.state.fighters
        .filter((f) => f.player === 'p0' && f.role === 'ally')
        .forEach((f, i) => {
          f.position = i < count ? ['n2', 'n3', 'n4'][i] : 'n22';
        });
      h.defend();
      expect(h.state.revealed?.damage).toBe(2 + count);
    },
  );

  it('Feeding Frenzy ignores a defeated Sister and opposing Sisters', () => {
    const h = setup(() => {}, ['dracula', 'dracula']);
    h.attack('dracula-feeding-frenzy');
    h.fighter('p0:ally-1').position = 'n2';
    h.fighter('p0:ally-1').defeated = true;
    h.fighter('p0:ally-1').hp = 0;
    h.fighter('p1:ally-1').position = 'n3';
    h.defend();
    expect(h.state.revealed?.damage).toBe(2);
  });

  it.each([0, 2, 4])(
    'Beastform privately discards exactly %i chosen cards after reveal and survives reconnect',
    (count) => {
      const h = setup();
      h.attack('dracula-beastform');
      h.defend();
      privateChoice(h);
      expect(h.state.resolution.choice).toMatchObject({ min: 0, max: 4 });
      const cards = h.state.players[0].hand.slice(0, count).map((c) => c.id);
      h.choose(cards);
      expect(h.state.players[0].hand).toHaveLength(4 - count);
      expect(h.state.revealed?.damage).toBe(6 + count);
      expect(h.state.players[0].discard).toHaveLength(count + 1);
      expect(h.state.resolution.frames).toEqual({});
    },
  );

  it('Feint cancels Beastform before payment and cancels Ambush before its random discard', () => {
    for (const card of ['beastform', 'ambush']) {
      const h = setup();
      h.attack(`dracula-${card}`);
      h.defend('dracula-feint');
      expect(h.state.resolution.choice).toBeNull();
      expect(h.state.players[0].hand).toHaveLength(4);
      expect(h.state.players[1].hand).toHaveLength(4);
      expect(h.state.revealed?.damage).toBe(card === 'beastform' ? 4 : 0);
    }
  });

  it('Ambush discards one seeded random card and adds its explicit BOOST; an empty hand adds zero', () => {
    const h = setup();
    h.state.players[1].hand.forEach((c) => (c.definition = 'dracula-beastform'));
    h.attack('dracula-ambush');
    h.defend();
    expect(h.state.players[1].hand).toHaveLength(4);
    expect(h.state.revealed?.damage).toBe(6);
    const g = setup();
    g.state.players[1].hand = [];
    g.attack('dracula-ambush');
    g.defend();
    expect(g.state.revealed?.damage).toBe(2);
  });

  it('Look Into My Eyes adds the attack card BOOST to defense and Feint suppresses it', () => {
    const h = setup();
    h.attack('dracula-beastform', 'p1:main', 'p0:main');
    h.defend('dracula-look-into-my-eyes', 'p0');
    h.choose([]);
    expect(h.state.revealed?.damage).toBe(1);
    const g = setup();
    g.attack('dracula-feint', 'p1:main', 'p0:main');
    g.defend('dracula-look-into-my-eyes', 'p0');
    expect(g.state.revealed?.damage).toBe(1);
  });

  it.each([false, true])(
    'Do My Bidding returns the original attack and privately selects a legal replacement (same=%s)',
    (same) => {
      const h = setup();
      h.state.players[1].hand[1].definition = 'dracula-exploit';
      h.state.players[1].hand[2].definition = 'dracula-mistform';
      h.state.players[1].hand[3].definition = 'dracula-thirst-for-sustenance';
      const original = h.state.players[1].hand[0],
        replacement = h.state.players[1].hand[1];
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend('dracula-do-my-bidding', 'p0');
      privateChoice(h);
      expect(h.state.players[1].hand).toContainEqual(original);
      expect(h.state.players[1].discard).not.toContainEqual(original);
      expect(h.state.resolution.choice?.options).toHaveLength(5);
      h.choose();
      privateChoice(h);
      expect(h.state.resolution.choice?.options.map((o) => o.card?.definition)).not.toContain(
        'dracula-mistform',
      );
      expect(h.state.resolution.choice?.options.map((o) => o.card?.definition)).not.toContain(
        'dracula-thirst-for-sustenance',
      );
      h.choose(same ? original.id : replacement.id);
      expect(h.state.revealed?.attack.id).toBe(same ? original.id : replacement.id);
      expect(h.state.revealed?.damage).toBe(1);
      expect(h.state.players[1].discard).toHaveLength(1);
      expect(h.state.players[1].hand).toHaveLength(same ? 4 : 5); // Exploit's new after-combat effect draws.
      expect(h.state.resolution.frames).toEqual({});
    },
  );

  it('a replacement Feint resolves immediately without undoing the completed replacement', () => {
    const h = setup();
    h.state.players[1].hand[1].definition = 'dracula-feint';
    const replacement = h.state.players[1].hand[1];
    h.attack('dracula-ambush', 'p1:main', 'p0:main');
    h.defend('dracula-do-my-bidding', 'p0');
    h.choose();
    h.choose(replacement.id);
    expect(h.state.revealed).toMatchObject({ attack: replacement, damage: 0 });
    expect(h.state.players[0].hand).toHaveLength(4);
  });

  it('replacement removes the old immediate effects and never repeats before-attack effects', () => {
    const h = setup((d) => {
      d.cards.strike.abilities = [
        {
          id: 'old',
          name: 'Old',
          description: 'Old',
          trigger: 'combat-reveal',
          effects: [{ type: 'damage', target: 'opponent', amount: 7 }],
        },
      ];
    });
    h.state.players[1].hand[1].definition = 'dracula-exploit';
    const replacement = h.state.players[1].hand[1];
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('dracula-do-my-bidding', 'p0');
    h.choose();
    h.choose(replacement.id);
    expect(h.fighter().hp).toBe(12);
  });

  it('Do My Bidding preserves the separately committed Arthur BOOST and excludes it from hand inspection', () => {
    const h = setup(() => {}, ['dracula', 'king-arthur']);
    const p = h.state.players[1];
    p.hand[1].definition = 'king-arthur-excalibur';
    p.hand[2].definition = 'king-arthur-skirmish';
    const boost = p.hand[1],
      replacement = p.hand[2];
    h.attack('king-arthur-excalibur', 'p1:main', 'p0:main');
    h.choose(boost.id);
    h.defend('dracula-do-my-bidding', 'p0');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain(boost.id);
    h.choose();
    h.choose(replacement.id);
    expect(h.state.revealed).toMatchObject({
      attack: replacement,
      damage: 4,
      boosts: [{ card: boost, amount: 3 }],
    });
    if (h.state.resolution.choice) {
      h.choose('self');
      h.choose('$stay');
    }
    expect(h.state.players[1].discard.filter((c) => c.id === boost.id)).toHaveLength(1);
  });

  it('Mistform requires an empty destination, places only Dracula and refunds exactly one action', () => {
    const h = setup();
    const sister = h.fighter('p0:ally-1').position;
    h.action('mistform');
    privateChoice(h);
    expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain('$stay');
    h.choose('n10');
    expect(h.fighter().position).toBe('n10');
    expect(h.fighter('p0:ally-1').position).toBe(sister);
    expect(h.state.actions).toBe(2);
  });

  it('Prey Upon damages only adjacent enemies, totals successful damage and heals after all hits', () => {
    const h = setup(() => {}, ['dracula', 'medusa']);
    h.fighter().position = 'n0';
    h.fighter().hp = 7;
    h.fighter('p1:main').position = 'n1';
    h.fighter('p1:ally-1').position = 'n5';
    h.fighter('p1:ally-2').position = 'n13';
    h.fighter('p1:ally-3').position = 'n18';
    const outcomes = h.action('prey-upon');
    expect(h.fighter().hp).toBe(9);
    expect(h.fighter('p1:main').hp).toBe(15);
    expect(h.fighter('p1:ally-1').defeated).toBe(true);
    expect(h.fighter('p1:ally-2').hp).toBe(1);
    const hits = outcomes.filter((o) => o.type === 'damage');
    expect(hits).toHaveLength(2);
    expect(outcomes.findIndex((o) => o.type === 'heal')).toBeGreaterThan(
      outcomes.findLastIndex((o) => o.type === 'damage'),
    );
  });

  it('Prey Upon gains no health from prevented damage and respects maximum HP', () => {
    const h = setup((d) => {
      d.characters.vanguard.abilities = [
        {
          id: 'ward',
          name: 'Ward',
          description: 'Ward',
          trigger: 'before-damage',
          effects: [{ type: 'cancel' }],
        },
      ];
    });
    h.fighter().position = 'n0';
    h.fighter('p1:main').position = 'n1';
    h.fighter().hp = 10;
    h.action('prey-upon');
    expect(h.fighter().hp).toBe(10);
    const g = setup();
    g.fighter().position = 'n0';
    g.fighter('p1:main').position = 'n1';
    g.action('prey-upon');
    expect(g.fighter().hp).toBe(13);
  });

  it('Baptism heals Dracula and revives the selected numbered Sister in his zone at full HP', () => {
    const h = setup();
    h.fighter().hp = 8;
    h.fighter('p0:ally-2').defeated = true;
    h.fighter('p0:ally-2').hp = 0;
    h.fighter('p0:ally-2').statuses = [{ id: 'burn', stacks: 1 }];
    h.action('baptism-of-blood');
    privateChoice(h);
    h.choose('p0:ally-2');
    privateChoice(h);
    h.choose();
    expect(h.fighter().hp).toBe(10);
    expect(h.fighter('p0:ally-2')).toMatchObject({ defeated: false, hp: 1, statuses: [] });
    expect(h.state.resolution.frames).toEqual({});
  });

  it('Baptism still heals with no defeated Sisters', () => {
    const h = setup();
    h.fighter().hp = 12;
    h.action('baptism-of-blood');
    expect(h.fighter().hp).toBe(13);
    expect(h.state.resolution.choice).toBeNull();
  });

  it.each([false, true])(
    'Thirst places Dracula beside the opposing fighter, including its retained defeated space (%s)',
    (defeated) => {
      const h = setup(() => {}, ['dracula', 'medusa']);
      h.fighter().position = 'n13';
      const target = defeated ? 'p1:ally-1' : 'p1:main';
      h.attack('dracula-thirst-for-sustenance', 'p0:ally-1', target);
      h.defend();
      privateChoice(h);
      expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain('n2');
      expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain('$stay');
      h.choose('n2');
      expect(h.fighter().position).toBe('n2');
      expect(h.fighter('p0:ally-1').position).toBe('n0');
    },
  );

  it('a blocked Thirst does not place Dracula; Feint cancels a Sister’s Dash', () => {
    const h = setup();
    h.attack('dracula-thirst-for-sustenance', 'p0:ally-1');
    h.defend('guard');
    expect(h.state.resolution.choice).toBeNull();
    const g = setup();
    g.attack('dracula-dash', 'p0:ally-1');
    g.defend('dracula-feint');
    expect(g.state.resolution.choice).toBeNull();
  });

  it.each(['p0:main', 'p1:main', 'p0:ally-1'])(
    'Ravening Seduction moves %s and then counts owned Sisters at its new position',
    (target) => {
      const h = setup();
      h.fighter(target).position = 'n0';
      h.fighter('p0:ally-2').position = 'n2';
      h.fighter('p0:ally-3').position = 'n5';
      h.action('ravening-seduction', 'p0:ally-1');
      privateChoice(h);
      h.choose(target);
      privateChoice(h);
      h.choose('n1');
      expect(h.fighter(target).position).toBe('n1');
      expect(h.fighter(target).hp).toBe(target === 'p0:main' ? 11 : target === 'p1:main' ? 13 : 0);
    },
  );

  it('Ravening can Stay and damage from the final adjacency, without counting defeated Sisters', () => {
    const h = setup();
    h.fighter('p1:main').position = 'n1';
    h.fighter('p0:ally-2').position = 'n2';
    h.fighter('p0:ally-3').position = 'n5';
    h.fighter('p0:ally-3').hp = 0;
    h.fighter('p0:ally-3').defeated = true;
    h.action('ravening-seduction', 'p0:ally-1');
    h.choose('p1:main');
    h.choose('$stay');
    expect(h.fighter('p1:main').hp).toBe(14);
  });

  it('Dash moves only the playing Sister and Exploit draws for her owner after defeat', () => {
    const h = setup();
    h.attack('dracula-dash', 'p0:ally-1');
    h.defend();
    h.choose('n5');
    expect(h.fighter('p0:ally-1').position).toBe('n5');
    const g = setup();
    g.attack('strike', 'p1:main', 'p0:ally-1');
    const before = g.state.players[0].hand.length;
    g.defend('dracula-exploit', 'p0');
    expect(g.fighter('p0:ally-1').defeated).toBe(false);
    expect(g.state.players[0].hand).toHaveLength(before);
    const k = setup((d) => {
      d.cards.strike.value = 7;
    });
    k.attack('strike', 'p1:main', 'p0:ally-1');
    k.defend('dracula-exploit', 'p0');
    expect(k.fighter('p0:ally-1').defeated).toBe(true);
    expect(k.state.players[0].hand).toHaveLength(5);
  });
});

describe('Dracula roster deployment', () => {
  it(
    'retains full ally counts across every supported two/four-seat deployment',
    { timeout: 120_000 },
    () => {
      const ids = Object.keys(content.characters);
      for (const count of [2, 4])
        for (let n = 0; n < ids.length ** count; n++) {
          let code = n;
          const roster = Array.from({ length: count }, () => {
            const id = ids[code % ids.length];
            code = Math.floor(code / ids.length);
            return id;
          });
          if (!roster.includes('dracula')) continue;
          let state = createGame(
            roster.map((character, i) => ({
              id: `p${i}`,
              name: `Seat ${i}`,
              character,
              deck: deckDefinitions(character).map((definition, j) => ({
                id: `p${i}-${j}`,
                definition,
              })),
            })),
            content,
          );
          state = completeDeckSelection(state, content);
          while (state.phase.type === 'placing-allies') {
            const f = state.fighters.find((f) => f.position === null)!;
            const position = deploymentSpaces(state, f.id, content.map)[0];
            expect(position).toBeDefined();
            const result = execute(
              state,
              f.player,
              {
                id: `deploy-${state.revision}`,
                revision: state.revision,
                command: { type: 'place-ally', fighter: f.id, position },
              },
              content,
            );
            if (!result.ok) throw new Error(result.message);
            state = result.state;
          }
          expect(state.fighters.every((f) => f.position !== null)).toBe(true);
        }
    },
  );
});

it('Mistform can choose Dracula’s current space and still grants its action', () => {
  const h = setup();
  const origin = h.fighter().position!;
  h.action('mistform');
  expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain(origin);
  h.choose(origin);
  expect(h.fighter().position).toBe(origin);
  expect(h.state.actions).toBe(2);
});

it('Do My Bidding leaves an effectless bonus without a fresh physical card unchanged', () => {
  const h = setup(() => {}, ['dracula', 'achilles']);
  h.attack('achilles-test-for-weakness', 'p1:main', 'p0:main');
  h.defend('guard', 'p0');
  expect(h.state.phase).toMatchObject({ type: 'awaiting-defense', bonus: { value: 3 } });
  h.defend('dracula-do-my-bidding', 'p0');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.revealed).toMatchObject({ bonus: { value: 3 }, damage: 0 });
  expect(
    h.state.players[1].discard.filter((c) => c.definition === 'achilles-test-for-weakness'),
  ).toHaveLength(1);
});
