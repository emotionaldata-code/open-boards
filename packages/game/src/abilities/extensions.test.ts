import { describe, expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { projectGame, projectOutcomes } from '../../../../apps/server/src/transport/projection';
import { createGame, execute, forfeit } from '../engine';
import { deploymentSpaces } from '../deployment';
import { reachablePaths, validPath } from '../movement';
import { Runtime } from './runtime';
import { emptyResolution } from './state';
import { validateDefinitions } from './validation';
import type { Ability, Effect, Hook } from './vocabulary';
import type { Command, Definitions, GameState } from '../types';

const ability = (trigger: Hook, effects: Effect[], id: string = trigger): Ability => ({
  id,
  name: id,
  description: id,
  trigger,
  effects,
});
function setup(edit: (defs: Definitions) => void = () => {}) {
  const defs = structuredClone(basic);
  defs.characters.vanguard.ally = {
    id: 'helper',
    name: 'Helper',
    hp: 2,
    count: 3,
    attackType: 'melee',
    counters: { energy: { initial: 1, max: 5 } },
  };
  for (const card of Object.values(defs.cards)) card.usableBy = 'BOTH';
  edit(defs);
  let state = createGame(
    ['vanguard', 'ranger'].map((character, i) => ({
      id: `p${i}`,
      name: `Seat ${i}`,
      character,
      deck: Array.from({ length: 30 }, (_, j) => ({
        id: `p${i}-${j}`,
        definition: j % 2 ? 'adapt' : 'strike',
      })),
    })),
    defs,
  );
  const h = {
    defs,
    get state() {
      return state;
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
    apply(command: Command, actor = 'p0') {
      const result = h.run(command, actor);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      return result.outcomes;
    },
    choose(id?: string) {
      const c = state.resolution.choice!;
      return h.apply({ type: 'choose', choice: c.id, options: [id ?? c.options[0].id] }, c.player);
    },
    fighter(id: string) {
      return state.fighters.find((f) => f.id === id)!;
    },
    fight(defense = true, attacker = 'p0:main', defender = 'p1:main') {
      h.fighter(attacker).position = 'n0';
      h.fighter(defender).position = 'n1';
      h.apply({ type: 'attack', fighter: attacker, target: defender, card: 'p0-0' });
      return h.apply({ type: 'defend', card: defense ? 'p1-1' : null }, 'p1');
    },
    action() {
      state.players[0].hand[0].definition = 'prepare';
      return h.apply({ type: 'play-action', fighter: 'p0:main', card: 'p0-0' });
    },
  };
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  return h;
}
function secureChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const before = structuredClone(h.state),
    c = h.state.resolution.choice!;
  const command: Command = { type: 'choose', choice: c.id, options: [c.options[0].id] };
  expect(projectGame(h.state, c.player, false).choice?.id).toBe(c.id);
  expect(projectGame(h.state, c.player === 'p0' ? 'p1' : 'p0', false).choice).toBeNull();
  expect(JSON.stringify(projectGame(h.state, 'p1', false))).not.toContain('continuations');
  expect(h.run(command, c.player === 'p0' ? 'p1' : 'p0').ok).toBe(false);
  expect(h.run({ ...command, options: ['$forged'] }, c.player).ok).toBe(false);
  expect(h.run({ ...command, options: [c.options[0].id, c.options[0].id] }, c.player).ok).toBe(
    false,
  );
  expect(
    execute(h.state, c.player, { id: 'stale', revision: h.state.revision - 1, command }, h.defs),
  ).toMatchObject({ ok: false, error: 'STALE' });
  expect(h.state).toEqual(before);
}

describe('combat card suppression and timing', () => {
  it('suppresses a BOOST prompt/payment and lifecycle hooks while preserving values and fighter/status passives', () => {
    const h = setup((d) => {
      d.cards.strike.abilities = [
        ability('before-combat', [{ type: 'boost-attack' }]),
        ability('card-played', [{ type: 'draw', count: 3 }]),
      ];
      d.cards.adapt.abilities = [ability('combat-reveal', [{ type: 'suppress-card-effects' }])];
      d.characters.ranger.abilities = [
        ability('before-combat', [{ type: 'modify', field: 'defense', amount: 1 }]),
      ];
      d.characters.vanguard.abilities = [ability('after-combat', [{ type: 'draw', count: 1 }])];
      d.statuses!.focus = { id: 'focus', name: 'Focus', maxStacks: 1, modifiers: { attack: 1 } };
    });
    h.fighter('p0:main').statuses = [{ id: 'focus', stacks: 1 }];
    const outcomes = h.fight();
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.revealed).toMatchObject({ damage: 1, boosts: [] });
    expect(h.state.players[0].hand).toHaveLength(5); // one card committed, one passive draw
    expect(h.state.players[0].discard.map((c) => c.id)).toEqual(['p0-0']);
    expect(outcomes.some((o) => o.type === 'boost')).toBe(false);
  });
  it('resolves defending immediate cards first in both seat orders, including opposing suppressors', () => {
    const h = setup((d) => {
      for (const id of ['strike', 'adapt'])
        d.cards[id].abilities = [ability('combat-reveal', [{ type: 'suppress-card-effects' }], id)];
    });
    let outcomes = h.fight();
    expect(outcomes.filter((o) => o.type === 'ability').map((o) => o.name)).toEqual(['adapt']);
    const other = setup((d) => {
      d.cards.strike.category = 'versatile';
      for (const id of ['strike', 'adapt'])
        d.cards[id].abilities = [ability('combat-reveal', [{ type: 'suppress-card-effects' }], id)];
    });
    other.state.turn = 1;
    other.fighter('p0:main').position = 'n1';
    other.fighter('p1:main').position = 'n0';
    other.apply({ type: 'attack', fighter: 'p1:main', target: 'p0:main', card: 'p1-1' }, 'p1');
    outcomes = other.apply({ type: 'defend', card: 'p0-0' });
    expect(outcomes.filter((o) => o.type === 'ability').map((o) => o.name)).toEqual(['strike']);
    expect(other.state.revealed?.damage).toBe(0);
  });
  it('carries exact card provenance through optional, nested and multi-choice continuations without undoing resolved effects', () => {
    const h = setup((d) => {
      d.cards.strike.abilities = [
        {
          ...ability('after-combat', [
            {
              type: 'if',
              condition: { type: 'combat-result', result: 'won' },
              then: [
                {
                  type: 'choose-option',
                  prompt: 'Nested',
                  options: [
                    {
                      id: 'draw',
                      label: 'Draw',
                      effects: [
                        { type: 'draw', count: 1 },
                        { type: 'draw', count: 3 },
                      ],
                    },
                  ],
                },
              ],
            },
            { type: 'draw', count: 4 },
          ]),
          optional: true,
        },
      ];
      d.characters.ranger.abilities = [
        {
          ...ability('after-draw', [{ type: 'suppress-card-effects' }, { type: 'draw', count: 1 }]),
          when: { type: 'relation', relation: 'enemy', a: 'self', b: 'actor' },
          scope: 'any',
        },
      ];
    });
    h.fight(false);
    secureChoice(h);
    h.choose('use');
    secureChoice(h);
    const source = h.state.resolution.choice!.continuations.draw[0];
    expect(source.provenance).toMatchObject({ kind: 'card', card: 'p0-0' });
    const outcomes = h.choose('draw');
    expect(h.state.players[0].deck).toHaveLength(24);
    expect(h.state.players[1].deck).toHaveLength(24); // unsuppressed fighter passive
    expect(outcomes.filter((o) => o.type === 'draw')).toHaveLength(2);
    expect(h.state.resolution.frames).toEqual({});
  });
  it('suppresses a movement operation after selection when a before-move reaction cancels its card', () => {
    const h = setup((d) => {
      d.cards.strike.abilities = [ability('after-combat', [{ type: 'move', distance: 3 }])];
      d.characters.ranger.abilities = [
        { ...ability('before-move', [{ type: 'suppress-card-effects' }]), scope: 'any' },
      ];
    });
    h.fight(false);
    secureChoice(h);
    const origin = h.fighter('p0:main').position;
    const outcomes = h.choose();
    expect(h.fighter('p0:main').position).toBe(origin);
    expect(outcomes.some((o) => o.type === 'move')).toBe(false);
  });
  it('runs defender card after-combat before attacker card, then living fighter passives; defeated allies keep committed effects', () => {
    const h = setup((d) => {
      d.cards.strike.abilities = [
        ability('after-combat', [{ type: 'draw', count: 1 }], 'attack-card'),
      ];
      d.cards.adapt.value = 0;
      d.cards.adapt.abilities = [
        ability(
          'after-combat',
          [
            { type: 'draw', count: 1 },
            { type: 'heal', amount: 2 },
            { type: 'move', distance: 3 },
          ],
          'defense-card',
        ),
      ];
      d.characters.vanguard.ally!.abilities = [
        ability('after-combat', [{ type: 'draw', count: 5 }], 'dead-passive'),
      ];
    });
    h.state.turn = 1;
    h.fighter('p1:main').position = 'n0';
    h.fighter('p0:ally-1').position = 'n1';
    h.apply({ type: 'attack', fighter: 'p1:main', target: 'p0:ally-1', card: 'p1-0' }, 'p1');
    const outcomes = h.apply({ type: 'defend', card: 'p0-1' });
    expect(h.fighter('p0:ally-1')).toMatchObject({ defeated: true, hp: 0, position: 'n1' });
    expect(h.state.players[0].deck).toHaveLength(24);
    expect(outcomes.filter((o) => o.type === 'ability').map((o) => o.name)).toEqual([
      'defense-card',
      'attack-card',
    ]);
  });
});

describe('fighter groups and traversal', () => {
  const group: Effect = {
    type: 'for-each-fighter',
    relation: 'friendly',
    role: 'ally',
    effects: [{ type: 'move', target: 'chosen', distance: 3 }],
  };
  it('snapshots eligible IDs, lets the owner order moves/Stay, and rechecks changing occupancy', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [group];
    });
    h.fighter('p0:ally-1').position = 'n1';
    h.fighter('p0:ally-2').position = 'n2';
    h.fighter('p0:ally-3').position = 'n3';
    h.action();
    secureChoice(h);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual([
      'p0:ally-1',
      'p0:ally-2',
      'p0:ally-3',
    ]);
    h.choose('p0:ally-2');
    secureChoice(h);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).not.toContain('n1');
    h.choose('$stay');
    secureChoice(h);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['p0:ally-1', 'p0:ally-3']);
    h.choose('p0:ally-1');
    h.choose('n4');
    h.choose('p0:ally-3');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toContain('n1');
    h.choose('n1');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.fighter('p0:ally-3').position).toBe('n1');
    expect(h.state.actions).toBe(1);
  });
  it('skips fighters killed by reactions and continues empty groups', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [group, { type: 'draw', count: 1 }];
      d.characters.vanguard.abilities = [
        {
          ...ability('after-move', [{ type: 'damage', target: 'chosen', amount: 2 }]),
          scope: 'any',
        },
      ];
    });
    // Reactions target a different group member via a friendly selection.
    h.defs.characters.vanguard.abilities![0].effects = [
      {
        type: 'choose-fighter',
        relation: 'friendly',
        effects: [{ type: 'damage', target: 'chosen', amount: 2 }],
      },
    ];
    h.action();
    h.choose('p0:ally-3');
    h.choose('$stay');
    h.choose('p0:ally-1');
    expect(h.fighter('p0:ally-1').defeated).toBe(true);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['p0:ally-2']);
    h.choose();
    h.choose('$stay');
    h.choose('p0:ally-2');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.players[0].deck).toHaveLength(24);
    const empty = setup((d) => {
      d.cards.prepare.effects = [
        { ...group, relation: 'enemy' },
        { type: 'draw', count: 1 },
      ];
    });
    empty.action();
    expect(empty.state.resolution.choice).toBeNull();
    expect(empty.state.players[0].deck).toHaveLength(24);
  });
  it('uses the same enemy traversal policy in generated and validated paths; occupied endpoints stay illegal', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [{ type: 'move', distance: 2, throughEnemies: true }];
    });
    h.defs.map = {
      ...h.defs.map,
      edges: [
        ['n0', 'n1'],
        ['n1', 'n2'],
      ],
      portals: [],
    };
    h.fighter('p1:main').position = 'n1';
    for (const f of h.state.fighters.filter((f) => f.role === 'ally')) f.position = 'n10';
    const f = h.fighter('p0:main');
    expect(reachablePaths(h.state, f, h.defs.map, 2)).toEqual({});
    expect(reachablePaths(h.state, f, h.defs.map, 2, true)).toEqual({ n2: ['n1', 'n2'] });
    expect(validPath(h.state, f, ['n1', 'n2'], h.defs.map, 2, true)).toBe(true);
    expect(validPath(h.state, f, ['n1'], h.defs.map, 2, true)).toBe(false);
    h.action();
    secureChoice(h);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['n2', '$stay']);
    const tasks = h.state.resolution.choice!.continuations.n2;
    expect(tasks[0]).toMatchObject({ type: 'operation', operation: { throughEnemies: true } });
    h.choose('n2');
    expect(h.fighter('p0:main').position).toBe('n2');
  });
});

describe('ally revival', () => {
  it('restores the exact numbered ally with printed HP/initial counters, clears statuses, preserves usage and can die again', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [{ type: 'revive-ally', optional: true, anchor: 'main' }];
    });
    Object.assign(h.fighter('p0:ally-2'), {
      defeated: true,
      hp: 0,
      statuses: [{ id: 'burn', stacks: 1 }],
      counters: { energy: 5 },
    });
    h.state.resolution.uses['p0:ally-2/fighter/helper/limited'] = { turn: 0, count: 1, total: 2 };
    h.action();
    secureChoice(h);
    h.choose('p0:ally-2');
    secureChoice(h);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).not.toContain('n0');
    const destination = h.state.resolution.choice!.options[0].id;
    const outcomes = h.choose(destination);
    expect(h.fighter('p0:ally-2')).toMatchObject({
      id: 'p0:ally-2',
      defeated: false,
      hp: 2,
      position: destination,
      statuses: [],
      counters: { energy: 1 },
    });
    expect(h.state.resolution.uses['p0:ally-2/fighter/helper/limited']).toEqual({
      turn: 0,
      count: 1,
      total: 2,
    });
    expect(projectOutcomes(outcomes, 'p1')).toContainEqual(
      expect.objectContaining({ type: 'revived', fighter: 'p0:ally-2', position: destination }),
    );
    const runtime = new Runtime(h.state, h.defs, () => {});
    runtime.operation({
      kind: 'damage',
      actor: 'p1:main',
      target: 'p0:ally-2',
      amount: 2,
      reason: 'ability',
    });
    runtime.run();
    expect(h.fighter('p0:ally-2').defeated).toBe(true);
  });
  it('supports Skip and continues when no defeated ally or no destination exists', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        { type: 'revive-ally', optional: true },
        { type: 'draw', count: 1 },
      ];
    });
    h.action();
    expect(h.state.resolution.choice).toBeNull();
    const skip = setup((d) => {
      d.cards.prepare.effects = [{ type: 'revive-ally', optional: true }];
    });
    Object.assign(skip.fighter('p0:ally-1'), { hp: 0, defeated: true });
    skip.action();
    skip.choose('$skip');
    expect(skip.fighter('p0:ally-1').defeated).toBe(true);
    const full = setup((d) => {
      d.cards.prepare.effects = [{ type: 'revive-ally' }, { type: 'draw', count: 1 }];
    });
    Object.assign(full.fighter('p0:ally-1'), { hp: 0, defeated: true });
    full.defs.map.zones = Object.fromEntries(full.defs.map.nodes.map((n) => [n, [n]]));
    full.action();
    expect(full.state.resolution.choice).toBeNull();
    expect(full.state.players[0].deck).toHaveLength(24);
  });
  it('cannot revive a main or eliminated/forfeited owner, even across a pending placement', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [{ type: 'revive-ally' }];
    });
    Object.assign(h.fighter('p0:ally-1'), { hp: 0, defeated: true });
    h.action();
    h.choose('p0:ally-1');
    expect(h.state.resolution.choice!.options.every((o) => !o.id.includes(':main'))).toBe(true);
    const result = forfeit(h.state, 'p0', h.defs);
    expect(result.state.fighters.filter((f) => f.player === 'p0').every((f) => f.defeated)).toBe(
      true,
    );
    const orphan = setup((d) => {
      d.cards.prepare.effects = [{ type: 'revive-ally' }];
    });
    orphan.state.players[0].eliminated = true;
    orphan.state.resolution = emptyResolution();
    const runtime = new Runtime(orphan.state, orphan.defs, () => {});
    const frame = runtime.frame({
      kind: 'card',
      actor: 'p0:main',
      card: { id: 'test', definition: 'prepare' },
      discarded: false,
    });
    runtime.prepend(...runtime.effects([{ type: 'revive-ally' }], { frame, owner: 'p0:main' }));
    runtime.run();
    expect(orphan.state.resolution.choice).toBeNull();
  });
});

it('strictly validates the new vocabulary and rejects unknown fields/invalid filters', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [
      {
        type: 'for-each-fighter',
        relation: 'friendly',
        role: 'ally',
        effects: [{ type: 'move', target: 'chosen', distance: 3, throughEnemies: true }],
      },
      { type: 'revive-ally', optional: true, anchor: 'main' },
    ];
  });
  expect(() => validateDefinitions(JSON.parse(JSON.stringify(h.defs)))).not.toThrow();
  for (const effect of [
    { type: 'for-each-fighter', relation: 'owned', effects: [] },
    { type: 'revive-ally', role: 'main' },
    { type: 'push', distance: 1, throughEnemies: true },
    { type: 'move', distance: 1, throughEnemies: 'yes' },
  ]) {
    const defs = structuredClone(h.defs);
    defs.cards.prepare.effects = [effect as Effect];
    expect(() => validateDefinitions(defs)).toThrow();
  }
});

it('preserves a BOOST already resolved before defense when the card is later suppressed', () => {
  const h = setup((d) => {
    d.cards.strike.abilities = [ability('before-attack', [{ type: 'boost-attack' }])];
    d.cards.adapt.abilities = [ability('combat-reveal', [{ type: 'suppress-card-effects' }])];
  });
  h.fighter('p1:main').position = 'n1';
  h.apply({ type: 'attack', fighter: 'p0:main', target: 'p1:main', card: 'p0-0' });
  h.choose('p0-1');
  h.apply({ type: 'defend', card: 'p1-1' }, 'p1');
  expect(h.state.revealed).toMatchObject({ damage: 2, boosts: [{ card: { id: 'p0-1' } }] });
  expect(h.state.players[0].discard.map((c) => c.id)).toEqual(['p0-1', 'p0-0']);
});

it('reports no movement when a before-move reaction defeats a group member and resolves each survivor once', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [
      {
        type: 'for-each-fighter',
        relation: 'friendly',
        role: 'ally',
        effects: [{ type: 'move', target: 'chosen', distance: 3 }],
      },
    ];
    d.characters.vanguard.ally!.abilities = [
      ability('before-move', [{ type: 'damage', amount: 2 }]),
    ];
    d.characters.vanguard.abilities = [
      {
        ...ability('after-move', [{ type: 'draw', count: 5 }]),
        scope: 'any',
        when: { type: 'compare', left: { event: 'distance' }, op: 'gt', right: 0 },
      },
    ];
  });
  h.action();
  for (const id of ['p0:ally-3', 'p0:ally-1', 'p0:ally-2']) {
    h.choose(id);
    const origin = h.fighter(id).position;
    const outcomes = h.choose();
    expect(h.fighter(id)).toMatchObject({ defeated: true, position: origin });
    expect(outcomes.some((o) => o.type === 'move')).toBe(false);
  }
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.players[0].deck).toHaveLength(25);
});

it('excludes allies revived after a group snapshot and preserves chosen bindings across nested groups', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [
      {
        type: 'for-each-fighter',
        relation: 'friendly',
        role: 'ally',
        effects: [{ type: 'revive-ally' }],
      },
    ];
  });
  Object.assign(h.fighter('p0:ally-3'), { defeated: true, hp: 0 });
  h.action();
  h.choose('p0:ally-2');
  h.choose('p0:ally-3');
  h.choose();
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['p0:ally-1']);
  h.choose();
  expect(h.state.resolution.choice).toBeNull();
  const nested = setup((d) => {
    d.cards.prepare.effects = [
      {
        type: 'for-each-fighter',
        relation: 'friendly',
        role: 'ally',
        effects: [
          {
            type: 'for-each-fighter',
            relation: 'friendly',
            role: 'main',
            effects: [{ type: 'damage', target: 'chosen', amount: 1 }],
          },
          { type: 'heal', target: 'chosen', amount: 1 },
        ],
      },
    ];
  });
  for (const f of nested.state.fighters.filter((f) => f.role === 'ally')) f.hp = 1;
  nested.action();
  for (let i = 0; i < 6; i++) nested.choose();
  expect(nested.state.resolution.choice).toBeNull();
  expect(nested.fighter('p0:main').hp).toBe(12);
  expect(nested.state.fighters.filter((f) => f.role === 'ally').map((f) => f.hp)).toEqual([
    2, 2, 2,
  ]);
});
