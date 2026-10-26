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
import inventory from '../../../../docs/characters/bruce-lee/inventory.json';

function setup(edit: (defs: Definitions) => void = () => {}, roster = ['bruce-lee', 'vanguard']) {
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
      card.definition = `bruce-lee-${slug}`;
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

const prefix = 'bruce-lee-';
const jkd = inventory.cards.filter((c) => c.id.includes('-jeet-kune-do-')).map((c) => c.id);

describe('complete printed Bruce Lee deck', () => {
  it('preserves 30 copies, 17 designs, source clauses, ANY tags and every BOOST', () => {
    validateDefinitions(content);
    expect(deckDefinitions('bruce-lee')).toHaveLength(30);
    expect(content.characters['bruce-lee']).toMatchObject({
      hp: 14,
      movement: 3,
      attackType: 'melee',
    });
    expect(content.characters['bruce-lee'].ally).toBeUndefined();
    expect(content.characters['bruce-lee'].deck).toHaveLength(17);
    for (const card of inventory.cards) {
      const { id, name, category, usableBy, value, boost, count } = card;
      expect(content.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(deckDefinitions('bruce-lee').filter((id) => id === card.id)).toHaveLength(count);
      for (const text of Object.values(card.sourceRules))
        expect(content.cards[id].description).toContain(text);
    }
  });

  it.each(jkd)(
    'recovers only eligible technique %s across a private JSON continuation',
    (definition) => {
      const h = setup();
      const eligible = { id: 'technique', definition };
      h.state.players[0].discard.push(eligible, { id: 'wrong', definition: prefix + 'feint' });
      h.action('hoo-whaaaaaa');
      privateChoice(h);
      expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual(['technique']);
      h.choose('technique');
      expect(h.state.players[0].hand).toContainEqual(eligible);
      expect(h.state.players[0].discard.map((c) => c.id)).toContain('wrong');
      expect(h.state.actions).toBe(2);
    },
  );

  it('Be Like Water recovers a prior technique after defense, and Feint cancels recovery', () => {
    for (const cancel of [false, true]) {
      const h = setup();
      h.state.players[0].discard.push({ id: 'old-technique', definition: jkd[0] });
      h.attack(cancel ? prefix + 'feint' : 'strike', 'p1:main', 'p0:main');
      h.defend(prefix + 'be-like-water', 'p0');
      if (cancel) expect(h.state.resolution.choice).toBeNull();
      else {
        privateChoice(h);
        h.choose('old-technique');
        expect(h.state.players[0].hand.some((c) => c.id === 'old-technique')).toBe(true);
      }
    }
  });

  it('an empty or ineligible discard still grants HOO its action without a prompt', () => {
    const h = setup();
    h.state.players[0].discard.push({ id: 'wrong', definition: prefix + 'feint' });
    h.action('hoo-whaaaaaa');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.actions).toBe(2);
  });

  it.each([0, 1])('Little Dragon checks %i remaining cards before drawing two', (remaining) => {
    const h = setup();
    h.state.players[0].hand.splice(remaining + 1);
    h.attack(prefix + 'little-dragon');
    h.defend();
    expect(h.state.revealed?.damage).toBe(remaining ? 2 : 6);
    expect(h.state.players[0].hand).toHaveLength(remaining + 2);
  });

  it.each([4, 5, 6])('Taste of Blood checks remaining HP %i after combat', (hp) => {
    const h = setup();
    h.fighter().hp = hp + 1;
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend(prefix + 'taste-of-blood', 'p0');
    expect(h.fighter().hp).toBe(hp);
    expect(h.state.players[0].hand).toHaveLength(hp <= 5 ? 7 : 4);
  });

  it.each(['self', 'opponent', 'neither'])(
    'High Straight Lead checks start spaces for %s',
    (moved) => {
      const h = setup();
      h.state.resolution.turnPositions['p0:main'] = moved === 'self' ? 'n5' : 'n0';
      h.state.resolution.turnPositions['p1:main'] = moved === 'opponent' ? 'n2' : 'n1';
      h.attack(jkd[0]);
      h.defend();
      expect(h.state.revealed?.damage).toBe(moved === 'neither' ? 3 : 5);
      expect(h.state.actions).toBe(2);
    },
  );

  it('Downward Side Kick randomly discards for the exact opposing fighter’s owner', () => {
    const h = setup();
    const before = structuredClone(h.state.players[1].hand);
    h.attack(prefix + 'jeet-kune-do-downward-side-kick');
    h.defend();
    expect(h.state.players[1].hand).toHaveLength(4);
    expect(h.state.players[1].discard).toHaveLength(1);
    expect(before).toContainEqual(h.state.players[1].discard[0]);
    expect(h.state.actions).toBe(2);
    expect(h.state.resolution.choice).toBeNull();
  });

  it('Wrist Lock draws and refunds an action; Corkscrew deals exactly one extra damage', () => {
    const h = setup();
    h.attack(prefix + 'jeet-kune-do-wrist-lock');
    h.defend();
    expect(h.state.players[0].hand).toHaveLength(5);
    expect(h.state.actions).toBe(2);
    const g = setup();
    g.attack(prefix + 'jeet-kune-do-corkscrew-finger-jab');
    g.defend('guard');
    expect(g.fighter('p1:main').hp).toBe(14);
    expect(g.state.actions).toBe(2);
  });

  it.each(jkd)('Feint cancels every timed clause and action gain of %s', (card) => {
    const h = setup();
    h.attack(card);
    h.defend(prefix + 'feint');
    expect(h.state.revealed?.damage).toBe(1);
    expect(h.state.actions).toBe(1);
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.players[0].hand).toHaveLength(4);
    expect(h.state.players[1].hand).toHaveLength(4);
  });

  it('Intercepting Fist cancels defense effects before preserving its own extra action', () => {
    const h = setup();
    h.attack(prefix + 'jeet-kune-do-intercepting-fist');
    h.defend(prefix + 'little-dragon');
    expect(h.state.players[1].hand).toHaveLength(4);
    expect(h.state.actions).toBe(2);
    expect(h.state.revealed?.damage).toBe(1);
  });

  it.each(['swap', 'stay'])(
    'Short Lead Hook offers optional %s then refunds one action',
    (option) => {
      const h = setup();
      h.attack(prefix + 'jeet-kune-do-short-lead-hook');
      h.defend('guard');
      privateChoice(h);
      h.choose(option);
      expect(h.fighter().position).toBe(option === 'swap' ? 'n1' : 'n0');
      expect(h.fighter('p1:main').position).toBe(option === 'swap' ? 'n0' : 'n1');
      expect(h.state.actions).toBe(2);
    },
  );

  it('Bring It On chooses only an opposing fighter in the zone, then mandatory adjacent placement', () => {
    const h = setup();
    h.fighter().position = 'n0';
    h.fighter('p1:main').position = 'n9';
    h.action('bring-it-on');
    privateChoice(h);
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual(['p1:main']);
    h.choose('p1:main');
    privateChoice(h);
    const options = h.state.resolution.choice!.options.map((o) => o.id);
    expect(options).toContain('n1');
    expect(options).not.toContain('$stay');
    expect(options).not.toContain('n0');
    h.choose('n1');
    expect(h.fighter('p1:main').position).toBe('n1');
    expect(h.state.actions).toBe(2);
  });

  it('Bring It On may leave an already adjacent target in its current space', () => {
    const h = setup();
    h.fighter().position = 'n0';
    h.fighter('p1:main').position = 'n1';
    h.action('bring-it-on');
    h.choose('p1:main');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain('n1');
    h.choose('n1');
    expect(h.state.actions).toBe(2);
  });

  it.each([1, 2, 3])(
    'One-Inch Punch at %i HP returns only the exact source instance on a direct defeat',
    (hp) => {
      const h = setup(() => {}, ['bruce-lee', 'medusa']);
      h.fighter().position = 'n0';
      h.fighter('p1:main').position = 'n20';
      h.fighter('p1:ally-1').position = 'n1';
      h.fighter('p1:ally-1').hp = hp;
      const card = { ...h.state.players[0].hand[0], definition: prefix + 'one-inch-punch' };
      h.state.players[0].discard.push({ id: 'other-punch', definition: card.definition });
      h.action('one-inch-punch');
      privateChoice(h);
      h.choose('p1:ally-1');
      expect(h.fighter('p1:ally-1').defeated).toBe(hp <= 2);
      expect(h.state.players[0].hand.some((c) => c.id === card.id)).toBe(hp <= 2);
      expect(h.state.players[0].discard.some((c) => c.id === 'other-punch')).toBe(true);
      expect(h.state.resolution.frames).toEqual({});
    },
  );

  it('One-Inch Punch may damage a friendly adjacent fighter without inferring enemy-only', () => {
    const h = setup((d) => {
      d.characters['bruce-lee'].ally = {
        id: 'helper',
        name: 'Helper',
        hp: 2,
        count: 1,
        attackType: 'melee',
      };
    });
    h.fighter().position = 'n0';
    h.fighter('p0:ally-1').position = 'n1';
    h.action('one-inch-punch');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain('p0:ally-1');
    h.choose('p0:ally-1');
    expect(h.fighter('p0:ally-1').defeated).toBe(true);
    expect(h.state.players[0].hand.some((c) => c.definition === prefix + 'one-inch-punch')).toBe(
      true,
    );
  });

  it.each([false, true])(
    'One-Inch Punch respects damage prevention (%s) and its discard hooks',
    (prevent) => {
      const h = setup((d) => {
        d.characters['bruce-lee'].counters = { discards: { initial: 0, max: 100 } };
        d.characters['bruce-lee'].abilities = [
          {
            id: 'observe',
            name: 'Observe',
            description: 'Count discarded cards',
            trigger: 'card-discarded',
            effects: [{ type: 'counter', name: 'discards', amount: 1 }],
          },
        ];
        if (prevent)
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
      h.fighter('p1:main').hp = 2;
      h.action('one-inch-punch');
      h.choose('p1:main');
      expect(h.fighter('p1:main').hp).toBe(prevent ? 2 : 0);
      expect(h.fighter().counters.discards).toBe(prevent ? 1 : 0);
      expect(h.state.players[0].hand.some((c) => c.definition === prefix + 'one-inch-punch')).toBe(
        !prevent,
      );
    },
  );

  it('two Nunchaku stack, preserve the changed printed value and expire after the end step', () => {
    const h = setup();
    h.action('nunchaku');
    h.action('nunchaku');
    expect(h.fighter().statuses).toEqual([{ id: 'attack-up', stacks: 2, turns: 1 }]);
    h.state.resolution.turnPositions['p0:main'] = 'n5';
    h.attack(prefix + 'momentous-shift');
    h.defend();
    expect(h.state.revealed?.damage).toBe(7);
    h.state.actions = 1;
    h.apply({ type: 'maneuver' });
    h.apply({ type: 'finish-maneuver' });
    privateChoice(h);
    expect(h.fighter().statuses).toHaveLength(1);
    h.choose('$stay');
    expect(h.fighter().statuses).toEqual([]);
    expect(h.state.turn).toBe(1);
  });

  it('Skirmish moves either exact combatant only on a win', () => {
    for (const chosen of ['self', 'opponent']) {
      const h = setup();
      h.attack(prefix + 'skirmish');
      h.defend('guard');
      privateChoice(h);
      h.choose(chosen);
      privateChoice(h);
      h.choose('n5');
      expect(h.fighter(chosen === 'self' ? 'p0:main' : 'p1:main').position).toBe('n5');
    }
    const h = setup();
    h.attack(prefix + 'regroup', 'p1:main', 'p0:main');
    h.defend(prefix + 'skirmish', 'p0');
    h.choose('self');
    h.choose('$stay');
    expect(h.state.resolution.choice).toBeNull();
  });

  it.each([false, true])('Regroup draws one or two after a combat win=%s', (win) => {
    const h = setup();
    h.attack(prefix + 'regroup');
    h.defend(win ? null : 'guard');
    expect(h.state.players[0].hand).toHaveLength(win ? 6 : 5);
  });

  it.each(['$stay', 'n1'])(
    'the end step may choose %s before hand limit and turn change',
    (option) => {
      const h = setup();
      h.fighter().position = 'n0';
      h.fighter('p1:main').position = 'n20';
      h.state.actions = 1;
      h.apply({ type: 'maneuver' });
      h.apply({ type: 'finish-maneuver' });
      privateChoice(h);
      expect(h.state.turn).toBe(0);
      h.choose(option);
      expect(h.fighter().position).toBe(option === '$stay' ? 'n0' : 'n1');
      expect(h.state.turn).toBe(1);
    },
  );
});

it(
  'deploys every two/four-seat roster containing Bruce Lee at full ally counts',
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
        if (!roster.includes('bruce-lee')) continue;
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
          const r = execute(
            state,
            f.player,
            {
              id: `d-${state.revision}`,
              revision: state.revision,
              command: { type: 'place-ally', fighter: f.id, position },
            },
            content,
          );
          if (!r.ok) throw new Error(r.message);
          state = r.state;
        }
        expect(state.fighters.every((f) => f.position !== null)).toBe(true);
      }
  },
);
