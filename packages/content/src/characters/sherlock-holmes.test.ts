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
import inventory from '../../../../docs/characters/drafts/sherlock-holmes/inventory.json';

function setup(
  edit: (defs: Definitions) => void = () => {},
  roster = ['sherlock-holmes', 'vanguard'],
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
    action(slug: string, fighter = 'p0:main') {
      const card = state.players[0].hand[0];
      card.definition = `sherlock-holmes-${slug}`;
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

describe('complete printed Sherlock Holmes deck', () => {
  it('preserves source stats, all 30 copies, 13 designs, restrictions, BOOSTs and printed clauses', () => {
    validateDefinitions(content);
    expect(deckDefinitions('sherlock-holmes')).toHaveLength(30);
    expect(content.characters['sherlock-holmes']).toMatchObject({
      hp: 16,
      movement: 2,
      attackType: 'melee',
      ally: { count: 1, hp: 8, attackType: 'ranged' },
      cardEffectProtection: { tags: ['MAIN', 'ALLY'] },
    });
    expect(content.characters['sherlock-holmes'].deck).toHaveLength(13);
    for (const source of inventory.cards) {
      const { id, name, category, usableBy, value, boost, count, sourceRules } = source;
      expect(content.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(deckDefinitions('sherlock-holmes').filter((c) => c === source.id)).toHaveLength(count);
      for (const text of Object.values(sourceRules))
        expect(content.cards[source.id].description).toContain(text);
    }
  });

  it.each(['MAIN', 'ALLY'] as const)(
    'enforces every %s restriction at attack, defense and action commitment',
    (tag) => {
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
    },
  );

  it.each(['p0:main', 'p0:ally-1'])(
    'protects named cards played by %s from enemy Feint in either combat role',
    (fighter) => {
      const h = setup();
      const slug = fighter.endsWith('main')
        ? 'sherlock-holmes-the-game-is-afoot'
        : 'sherlock-holmes-fixed-point-in-a-changing-age';
      if (fighter.endsWith('1')) {
        h.fighter().position = 'n5';
        h.fighter().hp = 12;
        h.fighter(fighter).hp = 6;
      }
      h.attack(slug, fighter);
      if (fighter.endsWith('1')) h.fighter().position = 'n5'; // n5 is adjacent to n0
      h.defend('sherlock-holmes-feint');
      if (fighter.endsWith('main')) {
        expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
        h.choose('$stay');
      } else {
        expect(h.fighter(fighter).hp).toBe(7);
        expect(h.fighter().hp).toBe(13);
      }
      const g = setup();
      g.fighter().hp = 12;
      g.fighter('p0:ally-1').hp = 6;
      g.attack('sherlock-holmes-feint', 'p1:main', fighter);
      if (fighter.endsWith('1')) g.fighter().position = 'n5';
      g.defend(
        fighter.endsWith('main')
          ? 'sherlock-holmes-counterpunch'
          : 'sherlock-holmes-fixed-point-in-a-changing-age',
        'p0',
      );
      if (fighter.endsWith('main')) expect(g.fighter('p1:main').hp).toBe(13);
      else expect(g.fighter(fighter).hp).toBe(7);
    },
  );

  it('allows ANY effects to be cancelled, including the opposing Feint, while its named opponent remains protected', () => {
    const h = setup();
    h.attack('sherlock-holmes-education-never-ends');
    h.defend('sherlock-holmes-feint');
    expect(h.state.players[1].hand).toHaveLength(4);
    const g = setup();
    g.attack('sherlock-holmes-feint');
    g.defend('sherlock-holmes-feint');
    expect(g.state.players[0].discard).toHaveLength(1);
  });

  it.each([false, true])(
    'Deduce Strategy optionally replaces only the opposing printed value (%s)',
    (use) => {
      const h = setup();
      h.attack('sherlock-holmes-deduce-strategy');
      h.defend('guard');
      privateChoice(h);
      h.choose(use ? 'use' : 'skip');
      expect(h.state.revealed?.damage).toBe(use ? 1 : 0);
      const g = setup();
      g.attack('strike', 'p1:main', 'p0:main');
      g.defend('sherlock-holmes-deduce-strategy', 'p0');
      g.choose(use ? 'use' : 'skip');
      expect(g.state.revealed?.damage).toBe(use ? 0 : 1);
    },
  );

  it.each([4, 3])(
    'Elementary predicts %i before revealing the attack, survives Feint and checks the printed value',
    (prediction) => {
      const h = setup();
      h.attack('strike', 'p1:main', 'p0:main');
      const attack = h.state.phase.type === 'awaiting-defense' ? h.state.phase.card : null;
      h.defend('sherlock-holmes-elementary', 'p0');
      privateChoice(h);
      for (const viewer of ['p0', 'p1', 'spectator']) {
        const view = projectGame(h.state, viewer, false);
        expect(view.observation?.cards[0].definition).toBe('sherlock-holmes-elementary');
        if (viewer !== 'p1') expect(JSON.stringify(view)).not.toContain(attack!.id);
      }
      expect(h.state.resolution.choice?.options).toHaveLength(101);
      h.choose(`value-${prediction}`);
      expect(h.state.revealed).toMatchObject({ damage: prediction === 4 ? 0 : 1, prediction });
      const g = setup();
      g.attack('sherlock-holmes-feint', 'p1:main', 'p0:main');
      g.defend('sherlock-holmes-elementary', 'p0');
      g.choose('value-2');
      expect(g.state.revealed?.damage).toBe(0);
      expect(g.fighter().hp).toBe(16);
    },
  );

  it('Elementary ignores uncancellable modifications and Excalibur’s surviving ability BOOST', () => {
    const h = setup(() => {}, ['sherlock-holmes', 'king-arthur']);
    h.state.players[1].hand[1].definition = 'king-arthur-excalibur';
    h.attack('king-arthur-excalibur', 'p1:main', 'p0:main');
    h.choose(h.state.players[1].hand[0].id);
    h.defend('sherlock-holmes-elementary', 'p0');
    h.choose('value-6');
    expect(h.state.revealed).toMatchObject({ damage: 0, boosts: [{ amount: 3 }] });
    const g = setup(() => {}, ['sherlock-holmes', 'sherlock-holmes']);
    g.attack('sherlock-holmes-deduce-strategy', 'p1:main', 'p0:main');
    g.defend('sherlock-holmes-elementary', 'p0');
    g.choose('value-3');
    g.choose('use');
    expect(g.state.revealed?.damage).toBe(0);
  });

  it('Study Methods privately inspects the losing owner’s full hand, including an ally combat, after reconnect', () => {
    const h = setup();
    h.attack('sherlock-holmes-study-methods', 'p0:ally-1');
    h.defend();
    privateChoice(h);
    expect(projectGame(h.state, 'p0', false).choice?.options.map((o) => o.card)).toEqual(
      h.state.players[1].hand,
    );
    expect(projectGame(h.state, 'p1', false).observation).toBeUndefined();
    h.choose();
    expect(h.state.resolution.frames).toEqual({});
    const g = setup();
    g.attack('sherlock-holmes-study-methods');
    g.defend('guard');
    expect(g.state.resolution.choice).toBeNull();
  });

  it.each([false, true])(
    'Education Never Ends draws for the exact winning/losing owner (%s)',
    (won) => {
      const h = setup();
      h.attack('sherlock-holmes-education-never-ends', 'p0:ally-1');
      h.defend(won ? null : 'guard');
      expect(h.state.players[0].hand).toHaveLength(won ? 4 : 6);
      expect(h.state.players[1].hand).toHaveLength(won ? 6 : 4);
    },
  );

  it('Counterpunch checks physical adjacency after movement and Fixed Point cannot heal from a defeated Watson', () => {
    const h = setup();
    h.attack('sherlock-holmes-counterpunch');
    h.defend();
    expect(h.fighter('p1:main').hp).toBe(10);
    const g = setup();
    g.fighter().hp = 12;
    g.fighter('p0:ally-1').hp = 1;
    g.attack('strike', 'p1:main', 'p0:ally-1');
    g.fighter().position = 'n5';
    g.defend('sherlock-holmes-fixed-point-in-a-changing-age', 'p0');
    expect(g.fighter('p0:ally-1').defeated).toBe(true);
    expect(g.fighter().hp).toBe(12);
  });

  it('Confirm Suspicion lets the affected owner choose only matching combat cards and damages their hero by BOOST', () => {
    const h = setup();
    h.state.players[1].hand.forEach((c, i) => {
      c.definition = i === 0 ? 'guard' : 'prepare';
    });
    const card = h.state.players[1].hand[0];
    h.action('confirm-suspicion');
    h.choose('p1');
    privateChoice(h);
    h.choose('value-3');
    privateChoice(h);
    expect(h.state.resolution.choice?.player).toBe('p1');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual([card.id]);
    h.choose(card.id);
    expect(h.fighter('p1:main').hp).toBe(13);
    expect(h.state.players[1].discard).toContainEqual(card);
    expect(h.state.resolution.frames).toEqual({});
  });

  it('Confirm Suspicion excludes schemes at zero and publishes only its required reveal to every viewer', () => {
    const h = setup();
    h.state.players[1].hand.forEach((c) => {
      c.definition = 'prepare';
    });
    h.action('confirm-suspicion');
    h.choose('p1');
    const outcomes = h.choose('value-0');
    h.reconnect();
    for (const viewer of ['p0', 'p1', 'spectator']) {
      expect(projectGame(h.state, viewer, false).observation?.cards).toEqual(
        h.state.players[1].hand,
      );
      expect(
        projectOutcomes(outcomes, viewer).filter((o) => o.type === 'hand-revealed'),
      ).toHaveLength(1);
    }
    h.choose();
    expect(h.fighter('p1:main').hp).toBe(15);
    const g = setup();
    g.state.players[1].hand = [];
    g.action('confirm-suspicion');
    g.choose('p1');
    g.choose('value-100');
    expect(g.state.resolution.choice).toBeNull();
  });

  it('Eliminate the Impossible privately gives Holmes all opposing cards and discards exactly his chosen instance', () => {
    const h = setup();
    const target = h.state.players[1].hand[2];
    h.action('eliminate-the-impossible');
    h.choose('p1');
    privateChoice(h);
    expect(h.state.resolution.choice?.options.map((o) => o.card)).toEqual(h.state.players[1].hand);
    h.choose(target.id);
    expect(h.state.players[1].discard).toContainEqual(target);
    expect(h.state.players[1].hand).toHaveLength(4);
  });

  it('Master of Disguise atomically exchanges the exact heroes, leaves allies in place and deals one damage', () => {
    const h = setup();
    const first = h.fighter().position,
      second = h.fighter('p1:main').position,
      watson = h.fighter('p0:ally-1').position;
    h.action('master-of-disguise');
    privateChoice(h);
    h.choose('p1');
    expect(h.fighter().position).toBe(second);
    expect(h.fighter('p1:main').position).toBe(first);
    expect(h.fighter('p0:ally-1').position).toBe(watson);
    expect(h.fighter('p1:main').hp).toBe(14);
    expect(h.state.resolution.frames).toEqual({});
  });

  it('Administer Aid places Watson adjacent to the current Holmes, then heals only Holmes and draws once', () => {
    const h = setup();
    h.fighter().position = 'n0';
    h.fighter().hp = 12;
    h.fighter('p0:ally-1').hp = 5;
    h.action('administer-aid', 'p0:ally-1');
    privateChoice(h);
    const ids = h.state.resolution.choice!.options.map((o) => o.id);
    expect(ids).toContain('n1');
    expect(ids).toContain('n5');
    expect(ids).not.toContain('$stay');
    expect(ids).not.toContain('n11');
    h.choose('n1');
    expect(h.fighter('p0:ally-1').position).toBe('n1');
    expect(h.fighter().hp).toBe(13);
    expect(h.fighter('p0:ally-1').hp).toBe(5);
    expect(h.state.players[0].hand).toHaveLength(5);
    const result = forfeit(h.state, 'p0', h.defs);
    expect(result.state.fighters.filter((f) => f.player === 'p0').every((f) => f.defeated)).toBe(
      true,
    );
  });

  it(
    'retains full ally counts across every supported two/four-seat deployment',
    { timeout: 300_000 },
    async () => {
      const ids = Object.keys(content.characters);
      for (const count of [2, 4])
        for (let n = 0; n < ids.length ** count; n++) {
          if (n % 256 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
          let code = n;
          const roster = Array.from({ length: count }, () => {
            const id = ids[code % ids.length];
            code = Math.floor(code / ids.length);
            return id;
          });
          if (!roster.includes('sherlock-holmes')) continue;
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
            const f = state.fighters.find((f) => !f.defeated && f.position === null)!;
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
          expect(
            state.fighters.every((f) =>
              f.role === 'ally' && content.characters[f.character].ally?.startsOffBoard
                ? f.defeated && f.position === null
                : f.position !== null,
            ),
          ).toBe(true);
        }
    },
  );
});

it('Counterpunch checks adjacency after the defending card moves its fighter away', () => {
  const h = setup((defs) => {
    defs.cards.guard.abilities = [
      {
        id: 'retreat',
        name: 'Retreat',
        description: 'Move after combat',
        trigger: 'after-combat',
        effects: [{ type: 'move', distance: 3 }],
      },
    ];
  });
  h.attack('sherlock-holmes-counterpunch');
  h.defend('guard');
  h.choose('n2');
  expect(h.fighter('p1:main').hp).toBe(15);
  expect(h.fighter('p1:main').position).toBe('n2');
});

it('Elementary predicts the printed value of Achilles’s bonus attack, independently of the original card', () => {
  const g = setup(() => {}, ['sherlock-holmes', 'achilles']);
  g.attack('achilles-test-for-weakness', 'p1:main', 'p0:main');
  g.defend('guard', 'p0');
  expect(g.state.phase.type).toBe('awaiting-defense');
  expect(g.state.revealed?.damage).toBe(0);
  g.defend('sherlock-holmes-elementary', 'p0');
  g.choose('value-3');
  expect(g.state.revealed).toMatchObject({ bonus: { value: 3 }, damage: 0, prediction: 3 });
});
