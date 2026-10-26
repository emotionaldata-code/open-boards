import { finishActions } from '../../../tests/finish-actions';
import { describe, expect, it } from 'vitest';
import { basic as content, deckDefinitions } from '../../../tests/fighters-fixture';
import {
  canAttack,
  cardEligible,
  createGame,
  deploymentSpaces,
  execute,
  fighterById,
  forfeit,
  mainFighter,
  movement,
  ownedFighters,
  reachablePaths,
  validPath,
  validateDefinitions,
  type Ability,
  type Command,
  type Definitions,
  type GameState,
} from './index';
import { projectGame, projectOutcomes } from '../../../apps/server/src/transport/projection';

function setup(count = 3, seats: 2 | 4 = 2, edit?: (defs: Definitions) => void) {
  const defs = structuredClone(content);
  defs.characters.leader.ally!.count = count;
  if (count === 0) delete defs.characters.leader.ally;
  edit?.(defs);
  const state = createGame(
    Array.from({ length: seats }, (_, i) => ({
      id: `p${i}`,
      name: `Rival ${i}`,
      character: 'leader',
      deck: deckDefinitions('leader').map((definition, j) => ({
        id: `p${i}-${j}`,
        definition,
      })),
    })),
    defs,
  );
  return { state, defs };
}
let serial = 0;
function run(state: GameState, defs: Definitions, actor: string, command: Command) {
  return execute(
    state,
    actor,
    { id: `fighter-test-${++serial}`, revision: state.revision, command },
    defs,
  );
}
function apply(state: GameState, defs: Definitions, actor: string, command: Command) {
  const result = run(state, defs, actor, command);
  if (!result.ok) throw new Error(result.message);
  return result.state;
}
function reject(state: GameState, defs: Definitions, actor: string, command: Command) {
  const before = structuredClone(state);
  expect(run(state, defs, actor, command)).toMatchObject({ ok: false, error: 'ILLEGAL' });
  expect(state).toEqual(before);
}
function deploy(state: GameState, defs: Definitions): GameState {
  while (state.phase.type === 'placing-allies') {
    const f = ownedFighters(state, state.phase.player).find((f) => f.position === null)!;
    state = apply(state, defs, f.player, {
      type: 'place-ally',
      fighter: f.id,
      position: deploymentSpaces(state, f.id, defs.map)[0],
    });
  }
  return state;
}
function hand(state: GameState, player: string, ...definitions: string[]) {
  state.players.find((p) => p.id === player)!.hand = definitions.map((definition, i) => ({
    id: `${player}-test-${i}`,
    definition,
  }));
}
const passive = (
  id: string,
  trigger: Ability['trigger'],
  effects: Ability['effects'],
): Ability => ({ id, name: id, description: id, trigger, effects });

describe('fighter setup and public state', () => {
  it.each([0, 1, 3])(
    'creates and deploys %i allies per player with no duplicate physical player state',
    (count) => {
      const { state, defs } = setup(count);
      expect(state.fighters).toHaveLength(2 * (count + 1));
      expect(new Set(state.fighters.map((f) => f.id)).size).toBe(state.fighters.length);
      expect(state.players[0]).not.toHaveProperty('hp');
      expect(state.players[0]).not.toHaveProperty('position');
      expect(state.players[0]).not.toHaveProperty('statuses');
      expect(state.phase.type).toBe(count ? 'placing-allies' : 'taking-actions');
      expect(deploy(state, defs).phase.type).toBe('taking-actions');
    },
  );
  it('deploys in seat order, validates ownership and preserves setup after JSON reconnect', () => {
    const { state, defs } = setup();
    reject(state, defs, 'p1', { type: 'place-ally', fighter: 'p1:ally-1', position: 'n1' });
    reject(state, defs, 'p0', { type: 'place-ally', fighter: 'p0:main', position: 'n1' });
    reject(state, defs, 'p0', { type: 'place-ally', fighter: 'p0:ally-1', position: 'n0' });
    reject(state, defs, 'p0', { type: 'place-ally', fighter: 'p0:ally-1', position: 'n13' });
    reject(state, defs, 'p0', { type: 'maneuver' });
    let s = apply(state, defs, 'p0', { type: 'place-ally', fighter: 'p0:ally-2', position: 'n1' });
    reject(s, defs, 'p0', { type: 'place-ally', fighter: 'p0:ally-1', position: 'n1' });
    s = JSON.parse(JSON.stringify(s)) as GameState;
    const view = projectGame(s, 'p1', false);
    expect(view.fighters).toEqual(s.fighters);
    expect(view.phase).toEqual({ type: 'placing-allies', player: 'p0' });
    expect(view.hand.every((c) => c.id.startsWith('p1'))).toBe(true);
    expect(deploy(s, defs).revision).toBe(6);
  });
  it('delays the first turn hook until every player has deployed, then delivers it once per owned fighter', () => {
    const { state, defs } = setup(1, 2, (d) => {
      const character = d.characters.leader;
      character.counters = { turns: { initial: 0, max: 10 } };
      character.ally!.counters = { turns: { initial: 0, max: 10 } };
      character.abilities = [
        passive('start', 'turn-start', [{ type: 'counter', name: 'turns', amount: 1 }]),
      ];
      character.ally!.abilities = character.abilities;
    });
    expect(state.fighters.map((f) => f.counters.turns)).toEqual([0, 0, 0, 0]);
    expect(deploy(state, defs).fighters.map((f) => f.counters.turns)).toEqual([1, 1, 0, 0]);
  });
  it('rejects impossible rosters and placements that strand a later seat in overlapping starting zones', () => {
    const edit = (d: Definitions) => {
      d.map = {
        id: 'tiny',
        name: 'Tiny',
        nodes: ['a', 'b', 'c', 'd'],
        zones: { a: ['x', 'y'], b: ['y'], c: ['x', 'y'], d: ['x'] },
        edges: [
          ['a', 'd'],
          ['b', 'c'],
        ],
        spawns: { 2: ['a', 'b'], 4: ['a', 'b', 'c', 'd'] },
      };
    };
    expect(() => setup(2, 2, edit)).toThrow('cannot deploy');
    const { state, defs } = setup(1, 2, edit);
    expect(deploymentSpaces(state, 'p0:ally-1', defs.map)).toEqual(['d']);
    reject(state, defs, 'p0', { type: 'place-ally', fighter: 'p0:ally-1', position: 'c' });
    expect(deploy(state, defs).fighters.map((f) => f.position)).toEqual(['a', 'd', 'b', 'c']);
    expect(() => setup(3, 4)).not.toThrow();
  });
  it('strictly validates ally fields, card tags, counters and quantities', () => {
    for (const value of [0, -1, 101, 1.5]) {
      const defs = structuredClone(content);
      defs.characters.leader.ally!.count = value;
      expect(() => validateDefinitions(defs)).toThrow();
    }
    const defs = structuredClone(content);
    delete (defs.cards.guard as Partial<typeof defs.cards.guard>).usableBy;
    expect(() => validateDefinitions(defs)).toThrow();
    defs.cards.guard.usableBy = 'BOTH';
    defs.characters.leader.ally!.counters = { energy: { initial: 3, max: 2 } };
    expect(() => validateDefinitions(defs)).toThrow('initial exceeds max');
  });
});

describe('shared Maneuver and exact movement', () => {
  it('draws once, spends one action, allows any movement order, rejects repeats and finishes all remaining through hooks', () => {
    const { state, defs } = setup(3, 2, (d) => {
      const c = d.characters.leader;
      c.counters = c.ally!.counters = { moves: { initial: 0, max: 10 } };
      c.abilities = c.ally!.abilities = [
        passive('moved', 'after-move', [{ type: 'counter', name: 'moves', amount: 1 }]),
      ];
    });
    let s = apply(deploy(state, defs), defs, 'p0', { type: 'maneuver' });
    expect(s.actions).toBe(1);
    expect(s.players[0].hand).toHaveLength(6);
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:ally-3', path: [] });
    expect(s.maneuver!.remaining).toEqual(['p0:main', 'p0:ally-1', 'p0:ally-2']);
    reject(s, defs, 'p0', { type: 'move', fighter: 'p0:ally-3', path: [] });
    reject(s, defs, 'p1', { type: 'move', fighter: 'p1:main', path: [] });
    reject(s, defs, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
      target: 'p1:main',
    });
    s = apply(s, defs, 'p0', { type: 'finish-maneuver' });
    expect(s.phase.type).toBe('taking-actions');
    expect(s.maneuver).toBeNull();
    expect(ownedFighters(s, 'p0').map((f) => f.counters.moves)).toEqual([1, 1, 1, 1]);
    expect(s.players[0].hand).toHaveLength(6);
  });
  it('crosses friends and friendly portals, cannot stop on them, and cannot cross enemies', () => {
    const { state, defs } = setup(1);
    const s = deploy(state, defs),
      hero = mainFighter(s, 'p0'),
      companion = fighterById(s, 'p0:ally-1')!,
      enemy = mainFighter(s, 'p1');
    hero.position = 'n0';
    companion.position = 'n1';
    enemy.position = 'n13';
    expect(validPath(s, hero, ['n1', 'n2'], defs.map, 2)).toBe(true);
    expect(reachablePaths(s, hero, defs.map, 2).n2).toEqual(['n1', 'n2']);
    expect(reachablePaths(s, hero, defs.map, 2)).not.toHaveProperty('n1');
    enemy.position = 'n1';
    companion.position = 'n13';
    expect(validPath(s, hero, ['n1', 'n2'], defs.map, 2)).toBe(false);
    enemy.position = 'n13';
    companion.position = 'n1';
    expect(reachablePaths(s, hero, defs.map, 2).n21).toEqual(['n1', 'n21']);
    expect(validPath(s, hero, ['n1'], defs.map, 2)).toBe(false);
  });
  it('preserves remaining fighters and finishing intent through private nested movement reactions and reconnect', () => {
    const { state, defs } = setup(1, 2, (d) => {
      d.characters.leader.ally!.abilities = [
        {
          ...passive('reaction', 'after-move', [{ type: 'move', distance: 1 }]),
          optional: true,
          limit: { scope: 'turn', count: 1 },
        },
      ];
    });
    let s = apply(deploy(state, defs), defs, 'p0', { type: 'maneuver' });
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:ally-1', path: [] });
    expect(s.phase.type).toBe('ability-choice');
    expect(s.maneuver!.remaining).toEqual(['p0:main']);
    expect(projectGame(s, 'p1', false).choice).toBeNull();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    s = apply(s, defs, 'p0', { type: 'choose', choice: s.resolution.choice!.id, options: ['use'] });
    s = apply(s, defs, 'p0', {
      type: 'choose',
      choice: s.resolution.choice!.id,
      options: ['$stay'],
    });
    expect(s.phase.type).toBe('choosing-movement');
    expect(s.maneuver!.remaining).toEqual(['p0:main']);
    s = apply(s, defs, 'p0', { type: 'finish-maneuver' });
    expect(s.maneuver).toBeNull();
    // In a new turn, finish-maneuver itself suspends on the ally and resumes automatically.
    s = finishActions(s, defs, 'p0').state;
    s = finishActions(s, defs, 'p1').state;
    s = apply(s, defs, 'p1', {
      type: 'choose',
      choice: s.resolution.choice!.id,
      options: ['skip'],
    });
    s = finishActions(s, defs, 'p1').state;
    s = apply(s, defs, 'p0', { type: 'maneuver' });
    s = apply(s, defs, 'p0', { type: 'finish-maneuver' });
    expect(s.maneuver!.finishing).toBe(true);
    s = apply(s, defs, 'p0', {
      type: 'choose',
      choice: s.resolution.choice!.id,
      options: ['skip'],
    });
    expect(s.maneuver).toBeNull();
    expect(s.phase.type).toBe('taking-actions');
  });
  it('uses independent statuses for movement and expires each piece only at its owner’s turn ending', () => {
    const { state, defs } = setup(1, 2, (d) => {
      d.statuses!.slow = { id: 'slow', name: 'Slow', maxStacks: 2, modifiers: { movement: -1 } };
    });
    let s = deploy(state, defs);
    const companion = fighterById(s, 'p0:ally-1')!;
    companion.statuses.push({ id: 'slow', stacks: 1, turns: 1 });
    fighterById(s, 'p1:ally-1')!.statuses.push({ id: 'slow', stacks: 2, turns: 1 });
    expect(movement(companion, defs)).toBe(1);
    expect(movement(mainFighter(s, 'p0'), defs)).toBe(2);
    s = finishActions(s, defs, 'p0').state;
    expect(fighterById(s, companion.id)!.statuses).toEqual([]);
    expect(fighterById(s, 'p1:ally-1')!.statuses).toHaveLength(1);
  });
});

describe('card users and combat ownership', () => {
  it.each(['MAIN', 'ALLY', 'BOTH'] as const)(
    'enforces %s on attack, action, and defense atomically for each role',
    (tag) => {
      for (const role of ['main', 'ally'] as const) {
        const { state, defs } = setup(1);
        defs.cards['strike'].usableBy = tag;
        defs.cards['heal'].usableBy = tag;
        defs.cards.guard.usableBy = tag;
        const s = deploy(state, defs),
          id = `p0:${role}${role === 'ally' ? '-1' : ''}`,
          f = fighterById(s, id)!;
        const eligible = tag === 'BOTH' || tag === role.toUpperCase();
        expect(cardEligible(defs.cards.guard, f)).toBe(eligible);
        f.position = 'n10';
        mainFighter(s, 'p1').position = 'n9';
        hand(s, 'p0', 'strike', 'heal');
        const attack: Command = {
          type: 'attack',
          fighter: id,
          card: s.players[0].hand[0].id,
          target: 'p1:main',
        };
        const action: Command = { type: 'play-action', fighter: id, card: s.players[0].hand[1].id };
        if (eligible) {
          expect(run(s, defs, 'p0', attack).ok).toBe(true);
          expect(run(s, defs, 'p0', action).ok).toBe(true);
        } else {
          reject(s, defs, 'p0', attack);
          reject(s, defs, 'p0', action);
        }
        // Opponent attacks the fixed piece. Defending is an owner action with no fighter parameter.
        s.turn = 1;
        hand(s, 'p1', 'adapt');
        hand(s, 'p0', 'guard');
        const pending = apply(s, defs, 'p1', {
          type: 'attack',
          fighter: 'p1:main',
          card: s.players[1].hand[0].id,
          target: id,
        });
        const defense: Command = { type: 'defend', card: pending.players[0].hand[0].id };
        expect(pending.actions).toBe(1);
        if (eligible) expect(apply(pending, defs, 'p0', defense).actions).toBe(1);
        else reject(pending, defs, 'p0', defense);
      }
    },
  );
  it('uses the acting fighter’s range, heals that piece and draws for its owner', () => {
    const { state, defs } = setup(1);
    let s = deploy(state, defs);
    const companion = fighterById(s, 'p0:ally-1')!,
      hero = mainFighter(s, 'p0'),
      rival = mainFighter(s, 'p1');
    companion.position = 'n0';
    hero.position = 'n1';
    rival.position = 'n11';
    expect(canAttack(companion, rival, defs)).toBe(false);
    expect(canAttack(hero, rival, defs)).toBe(true);
    companion.hp = 1;
    hero.hp = 10;
    hand(s, 'p0', 'heal', 'advance');
    s = apply(s, defs, 'p0', {
      type: 'play-action',
      fighter: companion.id,
      card: s.players[0].hand[0].id,
    });
    expect(fighterById(s, companion.id)!.hp).toBe(2);
    expect(mainFighter(s, 'p0').hp).toBe(10);
    s = apply(s, defs, 'p0', {
      type: 'play-action',
      fighter: companion.id,
      card: s.players[0].hand[0].id,
    });
    expect(s.resolution.choice!.player).toBe('p0');
    s = apply(s, defs, 'p0', {
      type: 'choose',
      choice: s.resolution.choice!.id,
      options: ['$stay'],
    });
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.turn).toBe(1);
  });
  it('keeps ally commitments owner-private, validates fighter ownership and survival', () => {
    const { state, defs } = setup(1);
    let s = deploy(state, defs);
    fighterById(s, 'p0:ally-1')!.position = 'n10';
    mainFighter(s, 'p1').position = 'n9';
    hand(s, 'p0', 'ally-strike');
    reject(s, defs, 'p0', {
      type: 'attack',
      fighter: 'p1:main',
      card: s.players[0].hand[0].id,
      target: 'p1:ally-1',
    });
    s = apply(s, defs, 'p0', {
      type: 'attack',
      fighter: 'p0:ally-1',
      card: s.players[0].hand[0].id,
      target: 'p1:main',
    });
    expect(projectGame(s, 'p0', false).phase).toHaveProperty('committedCard');
    expect(projectGame(s, 'p1', false).phase).not.toHaveProperty('committedCard');
    expect(s.revealed).toBeNull();
  });
  it('binds each Companion’s passive use independently while the hero draws at most once per turn', () => {
    const { state, defs } = setup(3);
    let s = deploy(state, defs);
    for (const [index, f] of ownedFighters(s, 'p0').entries())
      f.position = ['n26', 'n11', 'n27', 'n9'][index];
    mainFighter(s, 'p1').position = 'center';
    hand(s, 'p0', 'ally-strike', 'ally-strike', 'strike', 'strike');
    s.actions = 4;
    for (const id of ['p0:ally-1', 'p0:ally-2', 'p0:main', 'p0:main']) {
      const card = s.players[0].hand.find(
        (c) => c.definition === (id.includes('ally') ? 'ally-strike' : 'strike'),
      )!;
      s = apply(s, defs, 'p0', { type: 'attack', fighter: id, card: card.id, target: 'p1:main' });
      // Keep the opponent alive so four attacks exercise a single turn.
      mainFighter(s, 'p1').hp = 100;
      s = apply(s, defs, 'p1', { type: 'defend', card: null });
      if (s.resolution.choice)
        s = apply(s, defs, 'p0', {
          type: 'choose',
          choice: s.resolution.choice.id,
          options: ['$stay'],
        });
    }
    expect(s.players[0].hand).toHaveLength(1);
    const uses = s.resolution.uses;
    expect(uses['p0:ally-1/fighter/companion/move-on-hit'].total).toBe(1);
    expect(uses['p0:ally-2/fighter/companion/move-on-hit'].total).toBe(1);
    expect(uses['p0:main/fighter/leader/draw-on-hit'].total).toBe(1);
  });
});

describe('fighter effects, defeat and lifecycle', () => {
  it('chooses exact friendly/enemy pieces, resolves choose-player to main, and exposes ownership conditions', () => {
    const { state, defs } = setup(1, 2, (d) => {
      d.cards['heal'].effects = [
        {
          type: 'choose-fighter',
          relation: 'friendly',
          effects: [
            { type: 'heal', target: 'chosen', amount: 1 },
            {
              type: 'if',
              condition: { type: 'relation', relation: 'friendly', a: 'self', b: 'chosen' },
              then: [{ type: 'draw', count: 1 }],
            },
          ],
        },
      ];
    });
    let s = deploy(state, defs);
    fighterById(s, 'p0:ally-1')!.hp = 1;
    hand(s, 'p0', 'heal');
    s = apply(s, defs, 'p0', {
      type: 'play-action',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
    });
    expect(s.resolution.choice!.options.map((o) => o.id)).toEqual(['p0:main', 'p0:ally-1']);
    s = apply(s, defs, 'p0', {
      type: 'choose',
      choice: s.resolution.choice!.id,
      options: ['p0:ally-1'],
    });
    expect(fighterById(s, 'p0:ally-1')!.hp).toBe(2);
    expect(s.players[0].hand).toHaveLength(1);
    defs.cards['heal'].effects = [
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [{ type: 'damage', target: 'chosen', amount: 1 }],
      },
    ];
    hand(s, 'p0', 'heal');
    s = apply(s, defs, 'p0', {
      type: 'play-action',
      fighter: 'p0:ally-1',
      card: s.players[0].hand[0].id,
    });
    s = apply(s, defs, 'p0', { type: 'choose', choice: s.resolution.choice!.id, options: ['p1'] });
    expect(mainFighter(s, 'p1').hp).toBe(13);
    expect(fighterById(s, 'p1:ally-1')!.hp).toBe(2);
  });
  it('delivers draw/discard hooks to owned living fighters once, with main as actor', () => {
    const { state, defs } = setup(1, 2, (d) => {
      const c = d.characters.leader;
      c.counters = c.ally!.counters = { events: { initial: 0, max: 10 } };
      c.abilities = c.ally!.abilities = ['after-draw', 'card-discarded'].map((hook) => ({
        ...passive(hook, hook as Ability['trigger'], [
          { type: 'counter', name: 'events', amount: 1 },
        ]),
        when: { type: 'relation', relation: 'same', a: 'actor', b: 'source' },
      }));
    });
    let s = deploy(state, defs);
    hand(s, 'p0', 'heal');
    s = apply(s, defs, 'p0', {
      type: 'play-action',
      fighter: 'p0:ally-1',
      card: s.players[0].hand[0].id,
    });
    s = apply(s, defs, 'p0', { type: 'maneuver' });
    expect(ownedFighters(s, 'p0').map((f) => f.counters.events)).toEqual([2, 2]);
    expect(ownedFighters(s, 'p1').map((f) => f.counters.events)).toEqual([0, 0]);
  });
  it('defeats an ally alone and resolves its natural death reaction before victory settlement', () => {
    const { state, defs } = setup(1, 2, (d) => {
      d.characters.leader.ally!.abilities = [
        passive('retaliate', 'eliminated', [{ type: 'damage', target: 'source', amount: 2 }]),
      ];
    });
    let s = deploy(state, defs);
    mainFighter(s, 'p0').position = 'n10';
    fighterById(s, 'p1:ally-1')!.position = 'n11';
    hand(s, 'p0', 'strike');
    s = apply(s, defs, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
      target: 'p1:ally-1',
    });
    s = apply(s, defs, 'p1', { type: 'defend', card: null });
    expect(fighterById(s, 'p1:ally-1')!.defeated).toBe(true);
    expect(s.players[1].eliminated).toBe(false);
    expect(mainFighter(s, 'p0').hp).toBe(12);
    expect(s.phase.type).toBe('taking-actions');
    expect(ownedFighters(s, 'p1')).toHaveLength(1);
  });
  it('main defeat removes allies without their death abilities, while main retaliation can draw the match', () => {
    const { state, defs } = setup(1, 2, (d) => {
      d.characters.leader.abilities = [
        passive('retaliate', 'eliminated', [{ type: 'damage', target: 'source', amount: 20 }]),
      ];
      d.characters.leader.ally!.abilities = [
        passive('no-cleanup-hook', 'eliminated', [{ type: 'draw', count: 1 }]),
      ];
    });
    let s = deploy(state, defs);
    mainFighter(s, 'p0').position = 'n10';
    mainFighter(s, 'p1').position = 'n9';
    mainFighter(s, 'p1').hp = 4;
    hand(s, 'p0', 'strike');
    s = apply(s, defs, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
      target: 'p1:main',
    });
    s = apply(s, defs, 'p1', { type: 'defend', card: null });
    expect(s.phase).toEqual({ type: 'finished', winner: null });
    expect(s.fighters.every((f) => f.defeated)).toBe(true);
    expect(s.players[1].hand).toHaveLength(5);
  });
  it('lethal hero exhaustion and forfeits clean up Maneuver without ally death reactions', () => {
    const { state, defs } = setup(1, 4, (d) => {
      d.characters.leader.ally!.abilities = [
        passive('retaliate', 'eliminated', [{ type: 'damage', target: 'source', amount: 100 }]),
      ];
    });
    let s = deploy(state, defs);
    s.players[0].deck = [];
    mainFighter(s, 'p0').hp = 2;
    s = apply(s, defs, 'p0', { type: 'maneuver' });
    expect(mainFighter(s, 'p0').defeated).toBe(true);
    expect(s.turn).toBe(1);
    expect(s.maneuver).toBeNull();
    s = apply(s, defs, 'p1', { type: 'maneuver' });
    const result = forfeit(s, 'p1', defs);
    s = result.state;
    expect(ownedFighters(s, 'p1')).toEqual([]);
    expect(s.turn).toBe(2);
    expect(s.maneuver).toBeNull();
    expect(result.outcomes.some((o) => o.type === 'ability')).toBe(false);
    expect(s.fighters.filter((f) => f.player === 'p1').every((f) => f.position === null)).toBe(
      true,
    );
  });
  it('keeps private outcome audiences and rejects stale/duplicate fighter commands without mutation', () => {
    const { state, defs } = setup(1);
    const s = deploy(state, defs);
    const envelope = { id: 'once', revision: s.revision, command: { type: 'maneuver' } as const };
    const result = execute(s, 'p0', envelope, defs);
    if (!result.ok) throw new Error(result.message);
    const before = structuredClone(result.state);
    expect(execute(result.state, 'p0', envelope, defs)).toMatchObject({
      ok: false,
      error: 'DUPLICATE',
    });
    expect(execute(result.state, 'p0', { ...envelope, id: 'stale' }, defs)).toMatchObject({
      ok: false,
      error: 'STALE',
    });
    expect(result.state).toEqual(before);
    expect(projectOutcomes(result.outcomes, 'p1').some((o) => o.type === 'draw')).toBe(false);
    expect(projectOutcomes(result.outcomes, 'p0').some((o) => o.type === 'draw')).toBe(true);
  });
});

it('lets a declared observer react to friendly damage and select friendly pieces in its own attack range', () => {
  const { state, defs } = setup(1, 2, (d) => {
    const c = d.characters.leader;
    c.counters = { seen: { initial: 0, max: 10 } };
    c.abilities = [
      {
        ...passive('observe', 'after-damage', [{ type: 'counter', name: 'seen', amount: 1 }]),
        scope: 'any',
        when: { type: 'relation', relation: 'friendly', a: 'self', b: 'target' },
      },
    ];
    d.cards['heal'].effects = [
      {
        type: 'choose-fighter',
        relation: 'friendly',
        range: 'attack-range',
        effects: [{ type: 'heal', target: 'chosen', amount: 1 }],
      },
    ];
  });
  let s = deploy(state, defs);
  mainFighter(s, 'p0').position = 'n0';
  fighterById(s, 'p0:ally-1')!.position = 'n9';
  mainFighter(s, 'p1').position = 'n10';
  s.turn = 1;
  hand(s, 'p1', 'strike');
  s = apply(s, defs, 'p1', {
    type: 'attack',
    fighter: 'p1:main',
    card: s.players[1].hand[0].id,
    target: 'p0:main',
  });
  s = apply(s, defs, 'p0', { type: 'defend', card: null });
  expect(mainFighter(s, 'p0').counters.seen).toBe(1);
  expect(mainFighter(s, 'p1').counters.seen).toBe(0);
  s = finishActions(s, defs, 'p1').state;
  hand(s, 'p0', 'heal');
  fighterById(s, 'p0:ally-1')!.hp = 1;
  s = apply(s, defs, 'p0', {
    type: 'play-action',
    fighter: 'p0:main',
    card: s.players[0].hand[0].id,
  });
  expect(s.resolution.choice!.options.map((o) => o.id)).toEqual(['p0:ally-1']);
});

it('draws for a living owner from an ally death reaction, while rejecting further play by that defeated piece', () => {
  const { state, defs } = setup(1, 2, (d) => {
    d.characters.leader.ally!.abilities = [
      passive('last-scout', 'eliminated', [
        { type: 'draw', count: 1 },
        { type: 'heal', amount: 2 },
      ]),
    ];
  });
  let s = deploy(state, defs);
  mainFighter(s, 'p0').position = 'n10';
  fighterById(s, 'p1:ally-1')!.position = 'n11';
  hand(s, 'p0', 'strike');
  s = apply(s, defs, 'p0', {
    type: 'attack',
    fighter: 'p0:main',
    card: s.players[0].hand[0].id,
    target: 'p1:ally-1',
  });
  s = apply(s, defs, 'p1', { type: 'defend', card: null });
  expect(s.players[1].hand).toHaveLength(6);
  expect(fighterById(s, 'p1:ally-1')!.hp).toBe(0);
  s = finishActions(s, defs, 'p0').state;
  hand(s, 'p1', 'heal');
  reject(s, defs, 'p1', {
    type: 'play-action',
    fighter: 'p1:ally-1',
    card: s.players[1].hand[0].id,
  });
});

it('keeps setup pending after a forfeit and starts the first surviving seat only after deployment', () => {
  const { state, defs } = setup(1, 4);
  let s = forfeit(state, 'p0', defs).state;
  expect(s.phase).toEqual({ type: 'placing-allies', player: 'p1' });
  expect(s.resolution.turn).toBe(0);
  s = deploy(s, defs);
  expect(s.turn).toBe(1);
  expect(s.phase.type).toBe('taking-actions');
  expect(s.players[0].departed).toBe(true);
  expect(ownedFighters(s, 'p0')).toEqual([]);
});

it('discards cards regardless of their fighter tag and uses main as actor for player-wide discard hooks', () => {
  const { state, defs } = setup(1, 2, (d) => {
    const c = d.characters.leader;
    c.counters = c.ally!.counters = { actor: { initial: 0, max: 10 } };
    c.abilities = c.ally!.abilities = [
      {
        ...passive('discard-actor', 'card-discarded', [
          { type: 'counter', name: 'actor', amount: 1 },
        ]),
        when: { type: 'compare', left: { stat: 'hp', of: 'actor' }, op: 'eq', right: 14 },
      },
    ];
  });
  let s = deploy(state, defs);
  hand(s, 'p0', 'ally-strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'guard');
  s = finishActions(s, defs, 'p0').state;
  s = apply(s, defs, 'p0', {
    type: 'discard',
    cards: s.players[0].hand.slice(0, 2).map((c) => c.id),
  });
  expect(s.players[0].hand).toHaveLength(7);
  expect(mainFighter(s, 'p0').counters.actor).toBe(2);
  expect(fighterById(s, 'p0:ally-1')!.counters.actor).toBe(2);
});

it.each([0, 1, 3])(
  'empty-deck Maneuvers damage the hero and all %i allies on each draw',
  (count) => {
    const { state, defs } = setup(count, 2, (d) => {
      if (d.characters.leader.ally) d.characters.leader.ally.hp = 6;
    });
    let s = deploy(state, defs);
    s.players[0].deck = [];
    const enemies = structuredClone(ownedFighters(s, 'p1'));
    for (const hp of [12, 10]) {
      const result = run(s, defs, 'p0', { type: 'maneuver' });
      if (!result.ok) throw new Error(result.message);
      s = result.state;
      expect(mainFighter(s, 'p0').hp).toBe(hp);
      expect(
        ownedFighters(s, 'p0')
          .filter((f) => f.role === 'ally')
          .map((f) => f.hp),
      ).toEqual(Array(count).fill(hp - 8));
      expect(result.outcomes.filter((o) => o.type === 'damage')).toEqual(
        ownedFighters(s, 'p0').map((f) =>
          expect.objectContaining({
            type: 'damage',
            fighter: f.id,
            amount: 2,
            reason: 'exhaustion',
          }),
        ),
      );
      expect(ownedFighters(s, 'p1')).toEqual(enemies);
      s = apply(s, defs, 'p0', { type: 'finish-maneuver' });
    }
    expect(s.turn).toBe(1);
  },
);

it.each([0, 1, 2])(
  'card draws with %i cards available exhaust the hero and allies only for the shortfall',
  (available) => {
    const { state, defs } = setup(3, 2, (d) => {
      d.characters.leader.ally!.hp = 6;
    });
    let s = deploy(state, defs);
    s.players[0].deck = s.players[0].deck.slice(0, available);
    hand(s, 'p0', 'prepare');
    s = apply(s, defs, 'p0', {
      type: 'play-action',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
    });
    expect(ownedFighters(s, 'p0').map((f) => f.hp)).toEqual(
      [14, 6, 6, 6].map((hp) => hp - (2 - available) * 2),
    );
    expect(s.players[0].hand).toHaveLength(available);
    expect(s.players[0].deck).toEqual([]);
  },
);

it('ally exhaustion uses ordinary death reactions with the exact ally as source and removes it from Maneuver', () => {
  const { state, defs } = setup(1, 4, (d) => {
    d.characters.leader.ally!.abilities = [
      passive('retaliate', 'eliminated', [{ type: 'damage', target: 'source', amount: 100 }]),
    ];
  });
  let s = deploy(state, defs);
  s.players[0].deck = [];
  const result = run(s, defs, 'p0', { type: 'maneuver' });
  if (!result.ok) throw new Error(result.message);
  s = result.state;
  expect(result.outcomes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'damage',
        fighter: 'p0:ally-1',
        amount: 2,
        reason: 'exhaustion',
      }),
      expect.objectContaining({ type: 'ability', fighter: 'p0:ally-1', name: 'retaliate' }),
    ]),
  );
  expect(fighterById(s, 'p0:ally-1')!.defeated).toBe(true);
  expect(mainFighter(s, 'p0').hp).toBe(12);
  expect(s.maneuver!.remaining).toEqual(['p0:main']);
  s = apply(s, defs, 'p0', { type: 'finish-maneuver' });
  s = finishActions(s, defs, 'p0').state;
  expect(s.turn).toBe(1);
});

it('exhaustion preserves the ordinary off-board damage exemption', () => {
  const { state, defs } = setup(1);
  let s = deploy(state, defs);
  s.players[0].deck = [];
  fighterById(s, 'p0:ally-1')!.position = null;
  s = apply(s, defs, 'p0', { type: 'maneuver' });
  expect(mainFighter(s, 'p0').hp).toBe(12);
  expect(fighterById(s, 'p0:ally-1')).toMatchObject({ hp: 2, defeated: false, position: null });
  expect(s.maneuver!.remaining).toEqual(['p0:main']);
});

it('queued ally exhaustion reactions survive reconnect and can prevent individual damage before movement resumes', () => {
  const { state, defs } = setup(2, 2, (d) => {
    d.characters.leader.ally!.abilities = [
      { ...passive('prevent', 'before-damage', [{ type: 'cancel' }]), optional: true },
    ];
  });
  let s = deploy(state, defs);
  s.players[0].deck = [];
  s = apply(s, defs, 'p0', { type: 'maneuver' });
  expect(mainFighter(s, 'p0').hp).toBe(12);
  expect(s.phase.type).toBe('ability-choice');
  for (const option of ['use', 'skip']) {
    s = JSON.parse(JSON.stringify(s)) as GameState;
    s = apply(s, defs, 'p0', {
      type: 'choose',
      choice: s.resolution.choice!.id,
      options: [option],
    });
  }
  expect(fighterById(s, 'p0:ally-1')).toMatchObject({ hp: 2, defeated: false });
  expect(fighterById(s, 'p0:ally-2')).toMatchObject({ hp: 0, defeated: true });
  expect(s.maneuver!.remaining).toEqual(['p0:main', 'p0:ally-1']);
  expect(s.phase.type).toBe('choosing-movement');
  s = apply(s, defs, 'p0', { type: 'finish-maneuver' });
  expect(s.turn).toBe(0);
  expect(s.actions).toBe(1);
});
