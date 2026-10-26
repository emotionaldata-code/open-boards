import { finishActions } from '../../../../tests/finish-actions';
import { movement } from './conditions';
import { describe, expect, it } from 'vitest';
import { basic, deckDefinitions } from '../../../../tests/rules-fixture';
import { createGame, execute, forfeit } from '../engine';
import { prepareDefinitions, validateDefinitions } from './validation';
import type { Ability, Effect, Hook } from './vocabulary';
import type { Command, Definitions, GameState } from '../types';

const ability = (trigger: Hook, effects: Effect[], extra: Partial<Ability> = {}): Ability => ({
  id: trigger,
  name: trigger,
  description: 'Test ability',
  trigger,
  effects,
  ...extra,
});
function setup(abilities: Ability[] = [], count: 2 | 4 = 2) {
  const defs: Definitions = structuredClone(basic);
  defs.characters.vanguard.abilities = abilities;
  defs.characters.vanguard.counters = { energy: { initial: 0, max: 5 } };
  const state = createGame(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `Rival ${i}`,
      character: i ? 'ranger' : 'vanguard',
      deck: deckDefinitions().map((definition, j) => ({ id: `p${i}-${j}`, definition })),
    })),
    defs,
  );
  return { state, defs };
}
function run(state: GameState, defs: Definitions, actor: string, command: Command) {
  return execute(
    state,
    actor,
    { id: `cmd-${state.revision}`, revision: state.revision, command },
    defs,
  );
}
function apply(state: GameState, defs: Definitions, actor: string, command: Command) {
  const result = run(state, defs, actor, command);
  if (!result.ok) throw new Error(result.message);
  return result;
}
function respond(state: GameState, defs: Definitions, ids?: string[]) {
  const c = state.resolution.choice!;
  return apply(state, defs, c.player, {
    type: 'choose',
    choice: c.id,
    options: ids ?? [c.options[0].id],
  });
}
function attack(state: GameState, defs: Definitions) {
  state.fighters[1].position = 'n1';
  state = apply(state, defs, 'p0', {
    type: 'attack',
    fighter: 'p0:main',
    card: state.players[0].hand[0].id,
    target: 'p1:main',
  }).state;
  return apply(state, defs, 'p1', { type: 'defend', card: null });
}

describe('declarative abilities', () => {
  it('runs first turn-start, turn-end and the next turn-start with self/any scopes', () => {
    const { state, defs } = setup([
      ability('turn-start', [{ type: 'counter', name: 'energy', amount: 1 }], { scope: 'any' }),
      ability('turn-end', [{ type: 'counter', name: 'energy', amount: 1 }]),
    ]);
    expect(state.fighters[0].counters.energy).toBe(1);
    const next = finishActions(state, defs, 'p0').state;
    expect(next.fighters[0].counters.energy).toBe(3);
    expect(next.turn).toBe(1);
    expect(next.resolution.frames).toEqual({});
  });
  it('modifies draw before it happens and reads actual drawing afterwards', () => {
    const { state, defs } = setup([
      ability('before-draw', [{ type: 'modify', field: 'amount', amount: 1 }]),
      ability('after-draw', [{ type: 'counter', name: 'energy', amount: 1 }], {
        when: { type: 'compare', left: { event: 'amount' }, op: 'eq', right: 2 },
      }),
    ]);
    const result = apply(state, defs, 'p0', { type: 'maneuver' });
    expect(result.state.players[0].hand).toHaveLength(7);
    expect(result.state.fighters[0].counters.energy).toBe(1);
  });
  it('changes combat values, damage and healing at separate timing points', () => {
    const { state, defs } = setup([
      ability('before-combat', [{ type: 'modify', field: 'attack', amount: 2 }]),
      ability('after-attack', [{ type: 'heal', amount: 4 }]),
      ability('before-heal', [{ type: 'modify', field: 'amount', amount: -1 }]),
    ]);
    defs.characters.ranger.abilities = [
      ability('before-damage', [{ type: 'modify', field: 'amount', amount: -2 }]),
    ];
    state.fighters[0].hp = 10;
    const result = attack(state, defs);
    expect(result.state.revealed?.damage).toBe(4);
    expect(result.state.fighters.map((p) => p.hp)).toEqual([13, 11]);
    expect(result.outcomes.find((o) => o.type === 'heal')).toMatchObject({ amount: 3 });
    expect(result.state.resolution.frames).toEqual({});
  });
  it('fires card hooks for played/consumed cards and card-defined combat abilities', () => {
    const { state, defs } = setup([
      ability('card-played', [{ type: 'counter', name: 'energy', amount: 1 }]),
      ability('card-discarded', [{ type: 'counter', name: 'energy', amount: 1 }]),
    ]);
    defs.cards.strike.abilities = [
      ability('before-combat', [{ type: 'modify', field: 'attack', amount: 1 }]),
    ];
    const result = attack(state, defs);
    expect(result.state.fighters[0].counters.energy).toBe(2);
    expect(result.state.revealed?.damage).toBe(5);
  });
  it('pauses optional abilities, validates actors/options, resumes after JSON round-trip and preserves free defense', () => {
    const { state, defs } = setup([
      ability('after-attack', [{ type: 'move', distance: 2 }], { optional: true }),
    ]);
    let result = attack(state, defs);
    const pending = result.state,
      before = structuredClone(pending),
      choice = pending.resolution.choice!;
    for (const [actor, id, options] of [
      ['p1', choice.id, ['use']],
      ['p0', 'old', ['use']],
      ['p0', choice.id, ['bad']],
      ['p0', choice.id, ['use', 'use']],
    ] as const) {
      expect(
        run(pending, defs, actor, { type: 'choose', choice: id, options: [...options] }).ok,
      ).toBe(false);
      expect(pending).toEqual(before);
    }
    expect(run(pending, defs, 'p0', { type: 'maneuver' }).ok).toBe(false);
    result = respond(JSON.parse(JSON.stringify(pending)), defs, ['use']);
    expect(result.state.resolution.choice?.options.some((o) => o.id === 'n5')).toBe(true);
    result = respond(result.state, defs, ['n5']);
    expect(result.state.fighters[0].position).toBe('n5');
    expect(result.state.phase.type).toBe('taking-actions');
    expect(result.state.actions).toBe(1);
    expect(result.state.resolution.frames).toEqual({});
  });
  it('enforces once-per-turn and once-per-match before recursive effects and resets turn limits', () => {
    const { state, defs } = setup([
      ability('after-draw', [{ type: 'draw', count: 1 }], { limit: { scope: 'turn', count: 1 } }),
      ability('after-move', [{ type: 'heal', amount: 1 }], { limit: { scope: 'match', count: 1 } }),
    ]);
    state.fighters[0].hp = 10;
    let s = apply(state, defs, 'p0', { type: 'maneuver' }).state;
    expect(s.players[0].hand).toHaveLength(7);
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:main', path: [] }).state;
    s = apply(s, defs, 'p0', { type: 'maneuver' }).state;
    expect(s.players[0].hand).toHaveLength(8);
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:main', path: [] }).state;
    expect(s.fighters[0].hp).toBe(11);
    s = apply(s, defs, 'p0', { type: 'discard', cards: [s.players[0].hand[0].id] }).state;
    s = finishActions(s, defs, 'p1').state;
    s = apply(s, defs, 'p0', { type: 'maneuver' }).state;
    expect(s.players[0].hand).toHaveLength(9);
  });
  it('reserves an optional use even when declined and bounds unlimited trigger cycles atomically', () => {
    const { state, defs } = setup([
      ability('after-draw', [{ type: 'draw', count: 0 }], {
        optional: true,
        limit: { scope: 'turn', count: 1 },
      }),
    ]);
    let s = apply(state, defs, 'p0', { type: 'maneuver' }).state;
    s = respond(s, defs, ['skip']).state;
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:main', path: [] }).state;
    s = apply(s, defs, 'p0', { type: 'maneuver' }).state;
    expect(s.phase.type).toBe('choosing-movement');
    defs.characters.vanguard.abilities = [ability('after-draw', [{ type: 'draw', count: 0 }])];
    const before = structuredClone(state),
      result = run(state, defs, 'p0', { type: 'maneuver' });
    expect(result).toMatchObject({
      ok: false,
      error: 'ILLEGAL',
      message: expect.stringContaining('1024'),
    });
    expect(state).toEqual(before);
  });
  it('composes player choices, branches, bounded counters and effects in declaration order', () => {
    const { state, defs } = setup(
      [
        ability('after-move', [
          {
            type: 'choose-player',
            relation: 'opponent',
            range: 'zone',
            effects: [
              { type: 'damage', target: 'chosen', amount: 2 },
              {
                type: 'if',
                condition: {
                  type: 'all',
                  conditions: [
                    { type: 'not', condition: { type: 'role', role: 'defender' } },
                    { type: 'relation', relation: 'zone', a: 'self', b: 'chosen' },
                  ],
                },
                then: [{ type: 'counter', name: 'energy', amount: 99 }],
                else: [{ type: 'counter', name: 'energy', amount: -1 }],
              },
            ],
          },
        ]),
      ],
      4,
    );
    state.fighters[1].position = 'n11';
    state.fighters[3].position = 'n9';
    let s = apply(state, defs, 'p0', { type: 'maneuver' }).state;
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:main', path: [] }).state;
    expect(s.resolution.choice?.options.map((o) => o.id)).toEqual(['p1', 'p3']);
    s = respond(s, defs, ['p1']).state;
    expect(s.fighters[1].hp).toBe(13);
    expect(s.fighters[0].counters.energy).toBe(5);
  });
  it('supports choices of effect groups and required private hand discards', () => {
    const { state, defs } = setup([
      ability('after-move', [
        {
          type: 'choose-option',
          prompt: 'Choose your tactic',
          options: [
            {
              id: 'pressure',
              label: 'Make the opponent discard two',
              effects: [{ type: 'discard', target: 'opponent', count: 2 }],
            },
            { id: 'recover', label: 'Heal', effects: [{ type: 'heal', amount: 2 }] },
          ],
        },
      ]),
    ]);
    // An opponent reference is deliberately absent outside a two-participant event; choose-player binds it explicitly.
    defs.characters.vanguard.abilities![0].effects = [
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [
          {
            type: 'choose-option',
            prompt: 'Choose your tactic',
            options: [
              {
                id: 'pressure',
                label: 'Discard',
                effects: [{ type: 'discard', target: 'chosen', count: 2 }],
              },
            ],
          },
        ],
      },
    ];
    let s = apply(state, defs, 'p0', { type: 'maneuver' }).state;
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:main', path: [] }).state;
    s = respond(s, defs, ['p1']).state;
    s = respond(s, defs, ['pressure']).state;
    expect(s.resolution.choice?.player).toBe('p1');
    const ids = s.players[1].hand.slice(0, 2).map((c) => c.id);
    expect(
      run(s, defs, 'p1', { type: 'choose', choice: s.resolution.choice!.id, options: [ids[0]] }).ok,
    ).toBe(false);
    s = respond(s, defs, ids).state;
    expect(s.players[1].hand).toHaveLength(3);
    expect(s.players[1].discard.map((c) => c.id)).toEqual(ids);
    expect(s.resolution.frames).toEqual({});
  });
  it('applies stackable status modifiers, runs their hooks, expires them at the affected player’s turn end', () => {
    const { state, defs } = setup();
    defs.characters.vanguard.abilities = [
      ability('after-move', [{ type: 'status', status: 'focus', stacks: 2, turns: 1 }], {
        limit: { scope: 'match', count: 1 },
      }),
    ];
    defs.statuses = {
      focus: {
        id: 'focus',
        name: 'Focus',
        maxStacks: 2,
        modifiers: { attack: 1, movement: 1 },
        abilities: [ability('after-attack', [{ type: 'heal', amount: 1 }])],
      },
    };
    let s = apply(state, defs, 'p0', { type: 'maneuver' }).state;
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:main', path: [] }).state;
    s.fighters[0].hp = 10;
    const result = attack(s, defs);
    expect(result.state.fighters[0].hp).toBe(11);
    expect(result.state.revealed?.damage).toBe(6);
    expect(result.state.fighters[0].statuses).toEqual([]);
    expect(result.state.turn).toBe(1);
  });
  it('cancels operations at before hooks, including combat without returning spent cards/actions', () => {
    for (const trigger of ['before-attack', 'before-combat'] as const) {
      const { state, defs } = setup([ability(trigger, [{ type: 'cancel' }])]);
      state.fighters[1].position = 'n1';
      let s = apply(state, defs, 'p0', {
        type: 'attack',
        fighter: 'p0:main',
        card: state.players[0].hand[0].id,
        target: 'p1:main',
      }).state;
      if (trigger === 'before-combat')
        s = apply(s, defs, 'p1', { type: 'defend', card: null }).state;
      expect(s.players[0].discard).toHaveLength(1);
      expect(s.fighters[1].hp).toBe(15);
      expect(s.actions).toBe(1);
      expect(s.phase.type).toBe('taking-actions');
    }
    const { state, defs } = setup([
      ability('before-draw', [{ type: 'cancel' }]),
      ability('before-move', [{ type: 'cancel' }]),
    ]);
    let s = apply(state, defs, 'p0', { type: 'maneuver' }).state;
    expect(s.players[0].hand).toHaveLength(5);
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:main', path: ['n5'] }).state;
    expect(s.fighters[0].position).toBe('n0');
  });
  it('supports graph-based push/pull, teleport, occupancy and choice revalidation', () => {
    for (const mode of ['push', 'pull'] as const) {
      const { state, defs } = setup([
        ability('after-attack', [{ type: mode, target: 'opponent', distance: 2 }]),
      ]);
      let s = attack(state, defs).state;
      if (mode === 'push') {
        expect(s.resolution.choice?.options.map((o) => o.id)).toContain('n2');
        expect(s.resolution.choice?.options.map((o) => o.id)).not.toContain('n0');
        s = respond(s, defs, ['n2']).state;
        expect(s.fighters[1].position).toBe('n2');
      } else expect(s.resolution.choice).toBeNull(); // The only closer space is occupied by the attacker.
    }
    const { state, defs } = setup([
      ability('after-move', [{ type: 'teleport', zone: 'shared' }], {
        limit: { scope: 'match', count: 1 },
      }),
    ]);
    let s = apply(state, defs, 'p0', { type: 'maneuver' }).state;
    s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:main', path: [] }).state;
    expect(s.resolution.choice?.options.map((o) => o.id)).not.toContain('n13');
    s = respond(s, defs, ['n9']).state;
    expect(s.fighters[0].position).toBe('n9');
  });
  it('gains actions before automatic turn progression and evaluates combat-result conditions', () => {
    const { state, defs } = setup([
      ability('after-attack', [{ type: 'actions', amount: 1 }], {
        when: { type: 'combat-result', result: 'won' },
      }),
    ]);
    state.actions = 1;
    const result = attack(state, defs);
    expect(result.state.actions).toBe(1);
    expect(result.state.turn).toBe(0);
  });
  it('resolves elimination reactions before victory, permits mutual defeat, never revives eliminated players', () => {
    const { state, defs } = setup([]);
    defs.characters.ranger.abilities = [
      ability('eliminated', [
        { type: 'damage', target: 'attacker', amount: 20 },
        { type: 'heal', amount: 10 },
      ]),
    ];
    // Death events expose the victim as actor/target; choose-player is the explicit way to select another survivor.
    defs.characters.ranger.abilities[0].effects = [
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [{ type: 'damage', target: 'chosen', amount: 20 }],
      },
      { type: 'heal', amount: 10 },
    ];
    state.fighters[1].hp = 1;
    let result = attack(state, defs);
    expect(result.state.phase.type).toBe('ability-choice');
    result = respond(result.state, defs, ['p0']);
    expect(result.state.phase).toEqual({ type: 'finished', winner: null });
    expect(result.state.fighters[1].hp).toBe(0);
  });
  it('forfeits cancel combat choices, skip dead turns, preserve unrelated choices and allow reconnect snapshots', () => {
    const { state, defs } = setup(
      [
        ability('before-combat', [
          {
            type: 'choose-option',
            prompt: 'Choose',
            options: [{ id: 'a', label: 'Continue', effects: [] }],
          },
        ]),
      ],
      4,
    );
    let s = attack(state, defs).state;
    expect(s.resolution.choice).not.toBeNull();
    s = forfeit(s, 'p1', defs).state;
    expect(s.resolution.choice).toBeNull();
    expect(s.phase.type).toBe('taking-actions');
    expect(s.players[0].discard).toHaveLength(1);
    const other = setup(
      [
        ability('after-move', [
          {
            type: 'choose-option',
            prompt: 'Choose',
            options: [{ id: 'a', label: 'Continue', effects: [] }],
          },
        ]),
      ],
      4,
    );
    s = apply(other.state, other.defs, 'p0', { type: 'maneuver' }).state;
    s = apply(s, other.defs, 'p0', { type: 'move', fighter: 'p0:main', path: [] }).state;
    const choice = structuredClone(s.resolution.choice);
    s = forfeit(s, 'p2', other.defs).state;
    expect(s.resolution.choice).toEqual(choice);
    s = respond(s, other.defs, ['a']).state;
    expect(s.phase.type).toBe('taking-actions');
  });
  it('validates JSON definitions, unknown operations/references, hook compatibility and freezes snapshots', () => {
    const { defs } = setup();
    expect(() => validateDefinitions(defs)).not.toThrow();
    const frozen = prepareDefinitions(defs);
    defs.characters.vanguard.hp = 99;
    expect(frozen.characters.vanguard.hp).toBe(15);
    expect(Object.isFrozen(frozen.characters.vanguard)).toBe(true);
    const invalid: unknown[] = [
      { type: 'execute-javascript', code: 'alert(1)' },
      { type: 'draw', count: -1 },
      { type: 'status', status: 'missing' },
      { type: 'modify', field: 'attack', amount: 1 },
      { type: 'counter', name: '__proto__', amount: 1 },
      { type: 'damage', amount: 1, surprise: true },
    ];
    for (const effect of invalid) {
      const bad = structuredClone(defs);
      bad.characters.vanguard.abilities = [ability('after-move', [effect as Effect])];
      expect(() => validateDefinitions(bad)).toThrow();
    }
    const callback = structuredClone(defs);
    Object.assign(callback.characters.vanguard, { callback: () => {} });
    expect(() => validateDefinitions(callback)).toThrow('JSON');
  });
});

it('executes every documented hook in its real rule flow and keeps combat timing ordered', () => {
  const all = [
    'turn-start',
    'turn-end',
    'before-draw',
    'after-draw',
    'before-move',
    'after-move',
    'before-attack',
    'after-attack',
    'before-defense',
    'after-defense',
    'combat-reveal',
    'before-combat',
    'after-combat',
    'before-damage',
    'after-damage',
    'before-heal',
    'after-heal',
    'card-played',
    'card-discarded',
    'eliminated',
  ] as const;
  const { state, defs } = setup(
    all.map((hook) => ability(hook, [], { scope: 'any' })),
    4,
  );
  state.fighters[0].hp = 10;
  defs.cards.prepare.effects = [
    { type: 'heal', amount: 1 },
    { type: 'draw', count: 1 },
  ];
  state.players[0].hand[4].definition = 'prepare';
  let s = apply(state, defs, 'p0', { type: 'maneuver' }).state;
  s = apply(s, defs, 'p0', { type: 'move', fighter: 'p0:main', path: [] }).state;
  s = apply(s, defs, 'p0', {
    type: 'play-action',
    fighter: 'p0:main',
    card: s.players[0].hand[4].id,
  }).state;
  for (const actor of ['p1', 'p2', 'p3']) s = finishActions(s, defs, actor).state;
  s.fighters[1].position = 'n1';
  s.fighters[1].hp = 1;
  s.players[1].hand[0].definition = 'guard';
  const committed = apply(s, defs, 'p0', {
    type: 'attack',
    fighter: 'p0:main',
    card: s.players[0].hand[0].id,
    target: 'p1:main',
  });
  const defended = apply(committed.state, defs, 'p1', {
    type: 'defend',
    card: s.players[1].hand[0].id,
  });
  const seen = Object.keys(defended.state.resolution.uses).map((k) => k.split('/').at(-1));
  expect(new Set(seen)).toEqual(new Set(all));
  const trace = [...committed.outcomes, ...defended.outcomes]
    .filter((o) => o.type === 'ability')
    .map((o) => o.name);
  const order: Hook[] = [
    'before-attack',
    'before-defense',
    'combat-reveal',
    'before-combat',
    'before-damage',
    'eliminated',
    'after-damage',
    'after-combat',
    'after-attack',
    'after-defense',
  ];
  expect(order.map((h) => trace.indexOf(h))).toEqual(
    [...order.map((h) => trace.indexOf(h))].sort((a, b) => a - b),
  );
});

it('cancels defense without refunding its card and allows conditional defense modifiers', () => {
  const { state, defs } = setup();
  defs.characters.ranger.abilities = [ability('before-defense', [{ type: 'cancel' }])];
  defs.cards.guard.abilities = [
    ability('before-combat', [{ type: 'modify', field: 'defense', amount: 10 }]),
  ];
  state.fighters[1].position = 'n1';
  state.players[1].hand[0].definition = 'guard';
  let s = apply(state, defs, 'p0', {
    type: 'attack',
    fighter: 'p0:main',
    card: state.players[0].hand[0].id,
    target: 'p1:main',
  }).state;
  s = apply(s, defs, 'p1', { type: 'defend', card: s.players[1].hand[0].id }).state;
  expect(s.revealed?.damage).toBe(4);
  expect(s.players[1].discard).toHaveLength(1);
});

it('uses status and counter conditions, removes statuses and snapshots status-modified movement', () => {
  const { state, defs } = setup();
  defs.characters.vanguard.abilities = [
    ability(
      'after-draw',
      [
        { type: 'status', status: 'swift', stacks: 10 },
        { type: 'counter', name: 'energy', amount: 3 },
      ],
      { limit: { scope: 'match', count: 1 } },
    ),
  ];
  // Validate the complete content bundle before executing the status ability.
  defs.statuses = {
    ...defs.statuses,
    swift: { id: 'swift', name: 'Swift', maxStacks: 2, modifiers: { movement: 1 } },
  };
  validateDefinitions(defs);
  defs.characters.vanguard.abilities!.push(
    ability('after-move', [{ type: 'remove-status', status: 'swift' }], {
      when: {
        type: 'all',
        conditions: [
          { type: 'has-status', status: 'swift' },
          { type: 'compare', left: { stat: 'counter', name: 'energy' }, op: 'gte', right: 3 },
          {
            type: 'any',
            conditions: [
              { type: 'card-category', card: 'attack', category: 'action' },
              { type: 'compare', left: { stat: 'hp' }, op: 'lte', right: 15 },
            ],
          },
        ],
      },
    }),
  );
  let s = apply(state, defs, 'p0', { type: 'maneuver' }).state;
  expect(s.phase).toEqual({ type: 'choosing-movement', player: 'p0' });
  expect(s.fighters[0].statuses[0].stacks).toBe(2);
  expect(movement(s.fighters[0], defs)).toBe(4);
  s = apply(s, defs, 'p0', {
    type: 'move',
    fighter: 'p0:main',
    path: ['n1', 'n2', 'n3', 'n4'],
  }).state;
  expect(s.fighters[0].position).toBe('n4');
  expect(s.fighters[0].statuses).toEqual([]);
});

it('lets elimination choose the damage source, and skips a disconnected dead chooser on forfeit', () => {
  const { state, defs } = setup([], 4);
  defs.characters.ranger.abilities = [
    ability('eliminated', [
      {
        type: 'choose-option',
        prompt: 'Retaliate?',
        options: [
          {
            id: 'retaliate',
            label: 'Deal 3 to the killer',
            effects: [{ type: 'damage', target: 'source', amount: 3 }],
          },
        ],
      },
    ]),
  ];
  state.fighters[1].hp = 1;
  const pending = attack(state, defs).state;
  const responded = respond(pending, defs, ['retaliate']).state;
  expect(responded.fighters[0].hp).toBe(12);
  const skipped = forfeit(pending, 'p1', defs).state;
  expect(skipped.resolution.choice).toBeNull();
  expect(skipped.fighters[0].hp).toBe(15);
  expect(skipped.phase.type).toBe('taking-actions');
  expect(skipped.resolution.frames).toEqual({});
});

it('delegates an option choice without rebinding its effect owner or selected fighter', () => {
  const { state: initial, defs } = setup([
    ability('turn-start', [
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [
          {
            type: 'choose-option',
            chooser: 'chosen',
            prompt: 'Select a gift',
            options: [
              {
                id: 'gift',
                label: 'Give and receive',
                effects: [
                  { type: 'counter', name: 'energy', amount: 1 },
                  { type: 'draw', count: 1 },
                  { type: 'draw', target: 'chosen', count: 2 },
                ],
              },
            ],
          },
        ],
      },
    ]),
  ]);
  let state = respond(initial, defs, ['p1']).state;
  state = JSON.parse(JSON.stringify(state)) as GameState;
  const c = state.resolution.choice!;
  expect(c.player).toBe('p1');
  const command: Command = { type: 'choose', choice: c.id, options: ['gift'] };
  const before = structuredClone(state);
  expect(run(state, defs, 'p0', command).ok).toBe(false);
  expect(run(state, defs, 'p1', { ...command, options: ['forged'] }).ok).toBe(false);
  expect(state).toEqual(before);
  state = respond(state, defs, ['gift']).state;
  expect(state.players.map((p) => p.hand.length)).toEqual([6, 7]);
  expect(state.fighters[0].counters.energy).toBe(1);
  expect(state.resolution.frames).toEqual({});
});

it('accepts immediate value ignoring and preserves it through later defense modifiers', () => {
  const { state, defs } = setup();
  defs.cards.strike.abilities = [
    ability('combat-reveal', [{ type: 'ignore-combat-value', target: 'opponent' }]),
  ];
  defs.cards.guard.abilities = [
    ability('before-combat', [{ type: 'modify', field: 'defense', amount: 7 }]),
  ];
  expect(() => validateDefinitions(defs)).not.toThrow();
  state.fighters[1].position = 'n1';
  const attacking = apply(state, defs, 'p0', {
    type: 'attack',
    fighter: 'p0:main',
    card: state.players[0].hand[0].id,
    target: 'p1:main',
  }).state;
  attacking.players[1].hand[0].definition = 'guard';
  const result = apply(attacking, defs, 'p1', {
    type: 'defend',
    card: attacking.players[1].hand[0].id,
  });
  expect(result.state.revealed?.damage).toBe(defs.cards.strike.value);
});
