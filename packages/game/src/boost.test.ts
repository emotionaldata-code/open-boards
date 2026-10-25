import { describe, expect, it } from 'vitest';
import { basic } from '../../../tests/rules-fixture';
import {
  createGame,
  execute,
  forfeit,
  deploymentSpaces,
  maneuverMovement,
  movement,
  reachablePaths,
  validateDefinitions,
  type Ability,
  type Command,
  type Definitions,
  type GameState,
} from './index';
import { projectGame, projectOutcomes } from '../../../apps/server/src/transport/projection';

const ability = (
  trigger: Ability['trigger'],
  effects: Ability['effects'],
  id: string = trigger,
): Ability => ({
  id,
  name: id,
  description: id,
  trigger,
  effects,
});
function setup(edit: (defs: Definitions) => void = () => {}, allies = 0, seats: 2 | 4 = 2) {
  const defs = structuredClone(basic);
  defs.characters.vanguard.counters = { energy: { initial: 0, max: 100 } };
  if (allies)
    defs.characters.vanguard.ally = {
      id: 'helper',
      name: 'Helper',
      hp: 2,
      attackType: 'melee',
      count: allies,
      counters: { energy: { initial: 0, max: 100 } },
    };
  edit(defs);
  let state = createGame(
    Array.from({ length: seats }, (_, i) => ({
      id: `p${i}`,
      name: `Rival ${i}`,
      character: i ? 'ranger' : 'vanguard',
      deck: [
        'strike',
        'guard',
        'adapt',
        'prepare',
        'strike',
        'guard',
        'adapt',
        'prepare',
        'strike',
        'guard',
      ].map((definition, j) => ({ id: `p${i}-${j}`, definition })),
    })),
    defs,
  );
  const harness = {
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
        { id: `boost-${state.revision}`, revision: state.revision, command },
        defs,
      );
    },
    apply(command: Command, actor = 'p0') {
      const result = harness.run(command, actor);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      return result.outcomes;
    },
    choose(id?: string) {
      const c = state.resolution.choice!;
      return harness.apply(
        { type: 'choose', choice: c.id, options: [id ?? c.options[0].id] },
        c.player,
      );
    },
    attack(fighter = 'p0:main', target = 'p1:main') {
      state.fighters.find((f) => f.id === fighter)!.position = 'n0';
      state.fighters.find((f) => f.id === target)!.position = 'n1';
      return harness.apply({ type: 'attack', fighter, target, card: 'p0-0' });
    },
  };
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => f.position === null)!;
    harness.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  return harness;
}
const energy: Ability['effects'] = [{ type: 'counter', name: 'energy', amount: 1 }];

describe('Maneuver boosting', () => {
  it('uses the newly drawn card once, adds to individual status movement for main and allies, and resets', () => {
    const h = setup((defs) => {
      defs.statuses!.haste = {
        id: 'haste',
        name: 'Haste',
        maxStacks: 2,
        modifiers: { movement: 1 },
      };
    }, 2);
    h.state.fighters[0].statuses.push({ id: 'haste', stacks: 2 });
    const actions = h.state.actions;
    h.apply({ type: 'maneuver' });
    const drawn = h.state.players[0].hand.at(-1)!;
    expect(drawn.id).toBe('p0-5');
    const deckSize = h.state.players[0].deck.length;
    const outcomes = h.apply({ type: 'boost-maneuver', card: drawn.id });
    expect(h.state.actions).toBe(actions - 1);
    expect(h.state.players[0].deck).toHaveLength(deckSize);
    expect(h.state.players[0].hand).toHaveLength(5);
    expect(outcomes).toContainEqual(
      expect.objectContaining({
        type: 'boost',
        fighter: 'p0:main',
        player: 'p0',
        purpose: 'maneuver',
        card: drawn,
        amount: 2,
      }),
    );
    for (const f of h.state.fighters.filter((f) => f.player === 'p0'))
      expect(maneuverMovement(h.state, f, h.defs)).toBe(movement(f, h.defs) + 2);
    expect(
      maneuverMovement(
        h.state,
        h.state.fighters.find((f) => f.player === 'p1')!,
        h.defs,
      ),
    ).toBe(2);
    expect(h.run({ type: 'boost-maneuver', card: 'p0-1' }).ok).toBe(false);
    expect(h.run({ type: 'boost-maneuver', card: 'p1-1' }, 'p1').ok).toBe(false);
    h.reconnect();
    expect(h.state.maneuver).toMatchObject({ boost: 2, boostable: false });
    h.apply({ type: 'finish-maneuver' });
    h.apply({ type: 'maneuver' });
    expect(h.state.maneuver).toMatchObject({ boost: 0, boostable: true });
  });

  it.each([{ path: [] }, { path: ['n1'] }])(
    'rejects boosting after the first Stay/move ($path) while allies still have moves',
    ({ path }) => {
      const h = setup(() => {}, 1);
      // The ally deploys on n1; move it aside for the main fighter's path.
      h.state.fighters.find((f) => f.role === 'ally')!.position = 'n2';
      h.apply({ type: 'maneuver' });
      h.apply({ type: 'move', fighter: 'p0:main', path });
      expect(h.state.phase.type).toBe('choosing-movement');
      expect(h.state.maneuver?.boostable).toBe(false);
      expect(h.run({ type: 'boost-maneuver', card: 'p0-1' }).ok).toBe(false);
    },
  );

  it('validates boosted paths with the same helper used for highlights', () => {
    const h = setup();
    h.apply({ type: 'maneuver' });
    const before = reachablePaths(
      h.state,
      h.state.fighters[0],
      h.defs.map,
      maneuverMovement(h.state, h.state.fighters[0], h.defs),
    );
    h.apply({ type: 'boost-maneuver', card: 'p0-1' });
    const after = reachablePaths(
      h.state,
      h.state.fighters[0],
      h.defs.map,
      maneuverMovement(h.state, h.state.fighters[0], h.defs),
    );
    const destination = Object.keys(after).find((node) => !before[node])!;
    expect(destination).toBeTruthy();
    h.apply({ type: 'move', fighter: 'p0:main', path: after[destination] });
    expect(h.state.fighters[0].position).toBe(destination);
    expect(h.state.maneuver).toBeNull();
  });

  it('accepts defeated-ally cards and suppresses payment effects and card abilities', () => {
    const h = setup((defs) => {
      defs.cards.prepare.usableBy = 'ALLY';
      defs.cards.prepare.abilities = [ability('card-discarded', [{ type: 'draw', count: 5 }])];
      defs.cards.prepare.effects = [{ type: 'draw', count: 5 }];
    }, 1);
    const ally = h.state.fighters.find((f) => f.role === 'ally')!;
    ally.hp = 0;
    ally.defeated = true;
    h.apply({ type: 'maneuver' });
    h.apply({ type: 'boost-maneuver', card: 'p0-3' });
    expect(h.state.players[0].hand).toHaveLength(5);
    expect(h.state.players[0].deck).toHaveLength(4);
  });

  it('resolves nested discard reactions before the owner-wide hook, with main actor/source and amount', () => {
    const h = setup((defs) => {
      const hook = ability('maneuver-boosted', energy);
      hook.when = {
        type: 'all',
        conditions: [
          { type: 'compare', left: { event: 'amount' }, op: 'eq', right: 2 },
          { type: 'relation', relation: 'friendly', a: 'self', b: 'actor' },
          { type: 'relation', relation: 'same', a: 'actor', b: 'source' },
          {
            type: 'compare',
            left: { stat: 'counter', name: 'energy', of: 'actor' },
            op: 'gte',
            right: 1,
          },
        ],
      };
      defs.characters.vanguard.abilities = [
        ability('card-discarded', [
          {
            type: 'choose-option',
            prompt: 'Discard reaction',
            options: [{ id: 'yes', label: 'Resolve discard', effects: energy }],
          },
        ]),
        hook,
      ];
      defs.characters.vanguard.ally!.abilities = [hook];
      defs.characters.ranger.abilities = [
        ability('maneuver-boosted', [{ type: 'damage', target: 'actor', amount: 9 }]),
      ];
    }, 2);
    h.apply({ type: 'maneuver' });
    const outcomes = h.apply({ type: 'boost-maneuver', card: 'p0-1' });
    expect(outcomes.filter((o) => o.type === 'ability').map((o) => o.name)).toEqual([
      'card-discarded',
    ]);
    expect(h.state.fighters[0].counters.energy).toBe(0);
    h.reconnect();
    const resumed = h.choose('yes');
    expect(resumed.filter((o) => o.type === 'ability').map((o) => o.name)).toEqual([
      'maneuver-boosted',
      'maneuver-boosted',
      'maneuver-boosted',
    ]);
    expect(h.state.fighters.filter((f) => f.player === 'p0').map((f) => f.counters.energy)).toEqual(
      [2, 1, 1],
    );
    expect(h.state.fighters[0].hp).toBe(15);
    expect(h.state.phase.type).toBe('choosing-movement');
  });

  it('waits for draw reactions before accepting a boost and leaves effect movement distance unchanged', () => {
    const h = setup((defs) => {
      defs.characters.vanguard.abilities = [
        ability('after-draw', [{ type: 'move', distance: 1 }]),
        ability('maneuver-boosted', [{ type: 'move', distance: 1 }]),
      ];
      defs.cards.prepare.effects = [{ type: 'move', distance: 1 }];
    });
    h.apply({ type: 'maneuver' });
    expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
    expect(h.run({ type: 'boost-maneuver', card: 'p0-1' }).ok).toBe(false);
    h.choose('$stay');
    h.apply({ type: 'boost-maneuver', card: 'p0-1' });
    expect(h.state.maneuver?.boost).toBe(2);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual([
      ...Object.keys(reachablePaths(h.state, h.state.fighters[0], h.defs.map, 1)),
      '$stay',
    ]);
    h.choose('$stay');
    h.apply({ type: 'finish-maneuver' });
    expect(h.run({ type: 'boost-maneuver', card: 'p0-2' }).ok).toBe(false);
    h.apply({ type: 'play-action', fighter: 'p0:main', card: 'p0-3' });
    const options = h.state.resolution.choice!.options;
    const paths = reachablePaths(h.state, h.state.fighters[0], h.defs.map, 1);
    expect(options.map((o) => o.id)).toEqual([...Object.keys(paths), '$stay']);
  });
});

describe('attack boosting', () => {
  it.each(['character', 'card', 'status'] as const)(
    'supports %s grants at both timings, one payment per combat, and attack/defense modifiers',
    (source) => {
      const h = setup((defs) => {
        const grants = [
          ability('before-attack', [{ type: 'boost-attack' }]),
          ability('before-combat', [
            { type: 'boost-attack' },
            { type: 'modify', field: 'attack', amount: 2 },
          ]),
        ];
        if (source === 'character') defs.characters.vanguard.abilities = grants;
        if (source === 'card') defs.cards.strike.abilities = grants;
        if (source === 'status')
          defs.statuses!.grant = { id: 'grant', name: 'Grant', maxStacks: 1, abilities: grants };
        defs.statuses!.focus = {
          id: 'focus',
          name: 'Focus',
          maxStacks: 2,
          modifiers: { attack: 1, defense: 1 },
        };
      });
      h.state.fighters[0].statuses = [
        { id: 'focus', stacks: 1 },
        ...(source === 'status' ? [{ id: 'grant', stacks: 1 }] : []),
      ];
      h.state.fighters[1].statuses = [{ id: 'focus', stacks: 1 }];
      h.attack();
      expect(h.state.resolution.choice!.options.map((o) => o.id)).not.toContain('p0-0');
      expect(h.state.resolution.choice!.options.find((o) => o.id === 'p0-1')!.label).toContain(
        'BOOST +2',
      );
      h.choose('p0-1');
      expect(h.state.phase.type).toBe('awaiting-defense');
      expect(h.state.players[0].discard).toHaveLength(0);
      const outcomes = h.apply({ type: 'defend', card: 'p1-1' }, 'p1');
      expect(h.state.phase.type).toBe('taking-actions');
      expect(h.state.revealed).toMatchObject({ damage: 5, boosts: [{ card: { id: 'p0-1' } }] });
      expect(h.state.players[0].discard.map((c) => c.id)).toEqual(['p0-0', 'p0-1']);
      expect(outcomes.filter((o) => o.type === 'boost')).toHaveLength(1);
    },
  );

  it('keeps before-attack payment and private options hidden from opponents and spectators across JSON reconnect', () => {
    const h = setup((defs) => {
      defs.cards.strike.abilities = [
        ability('before-attack', [{ type: 'boost-attack' }], 'secret-grant'),
      ];
    });
    const opening = h.attack();
    for (const viewer of ['p1', 'spectator']) {
      expect(projectGame(h.state, viewer, false).choice).toBeNull();
      expect(
        JSON.stringify({
          view: projectGame(h.state, viewer, false),
          outcomes: projectOutcomes(opening, viewer),
        }),
      ).not.toMatch(/p0-[0-9]|secret-grant|continuations|frames/);
    }
    h.reconnect();
    const own = projectGame(h.state, 'p0', false);
    expect(own.choice?.options.some((o) => o.id === 'p0-1')).toBe(true);
    expect(own.choice).not.toHaveProperty('continuations');
    const committed = h.choose('p0-1');
    expect(committed).toEqual([]);
    h.reconnect();
    for (const viewer of ['p1', 'spectator'])
      expect(JSON.stringify(projectGame(h.state, viewer, false))).not.toMatch(/p0-[0-9]/);
    const revealed = h.apply({ type: 'defend', card: null }, 'p1');
    for (const viewer of ['p1', 'spectator']) {
      expect(projectGame(h.state, viewer, false).revealed?.boosts[0]?.card.id).toBe('p0-1');
      expect(projectOutcomes(revealed, viewer)).toContainEqual(
        expect.objectContaining({ type: 'boost', card: { id: 'p0-1', definition: 'guard' } }),
      );
    }
  });

  it('supports nested before-combat choices, discards immediately, and suppresses payment-card abilities', () => {
    const h = setup((defs) => {
      defs.cards.strike.abilities = [
        ability('before-combat', [
          {
            type: 'if',
            condition: { type: 'role', role: 'attacker' },
            then: [
              {
                type: 'choose-option',
                prompt: 'Tactic',
                options: [{ id: 'boost', label: 'Boost', effects: [{ type: 'boost-attack' }] }],
              },
            ],
          },
        ]),
      ];
      defs.cards.guard.abilities = [
        ability('card-discarded', [{ type: 'damage', target: 'opponent', amount: 10 }]),
      ];
      defs.characters.vanguard.abilities = [ability('card-discarded', energy)];
    });
    h.attack();
    h.apply({ type: 'defend', card: null }, 'p1');
    h.reconnect();
    h.choose('boost');
    expect(h.state.resolution.choice?.prompt).toBe('Boost attack');
    h.reconnect();
    const outcomes = h.choose('p0-1');
    expect(outcomes.filter((o) => o.type === 'boost')).toHaveLength(1);
    expect(h.state.players[0].discard.map((c) => c.id)).toEqual(['p0-0', 'p0-1']);
    expect(h.state.revealed?.damage).toBe(6);
    expect(h.state.fighters[0].counters.energy).toBe(2);
    expect(h.state.fighters[1].hp).toBe(9);
  });

  it('does not grant universal permission, lets Skip defer to a later grant, and auto-skips an empty hand', () => {
    const neutral = setup();
    neutral.attack();
    expect(neutral.state.phase.type).toBe('awaiting-defense');
    const h = setup((defs) => {
      defs.characters.vanguard.abilities = [
        ability('before-attack', [{ type: 'boost-attack' }]),
        ability('before-combat', [{ type: 'boost-attack' }]),
      ];
    });
    h.attack();
    h.choose('$skip');
    h.apply({ type: 'defend', card: null }, 'p1');
    h.choose('p0-1');
    expect(h.state.revealed?.damage).toBe(6);
    const empty = setup((defs) => {
      defs.characters.vanguard.abilities = [
        ability('before-attack', [{ type: 'boost-attack' }]),
        ability('before-combat', [{ type: 'boost-attack' }]),
      ];
    });
    empty.state.players[0].hand = [empty.state.players[0].hand[0]];
    empty.attack();
    expect(empty.state.phase.type).toBe('awaiting-defense');
    empty.apply({ type: 'defend', card: null }, 'p1');
    expect(empty.state.revealed?.boosts).toEqual([]);
    expect(empty.state.revealed?.damage).toBe(4);
  });

  it('only allows the current attacking piece, including allies, to use a grant', () => {
    const h = setup((defs) => {
      defs.cards.strike.usableBy = 'BOTH';
      defs.characters.vanguard.abilities = [
        { ...ability('before-attack', [{ type: 'boost-attack' }]), scope: 'any' },
      ];
      defs.characters.ranger.abilities = [ability('before-combat', [{ type: 'boost-attack' }])];
    }, 1);
    h.attack('p0:ally-1');
    expect(h.state.phase.type).toBe('awaiting-defense');
    h.apply({ type: 'defend', card: null }, 'p1');
    expect(h.state.revealed?.boosts).toEqual([]);
    const ally = setup((defs) => {
      defs.cards.strike.usableBy = 'BOTH';
      defs.characters.vanguard.ally!.abilities = [
        ability('before-attack', [{ type: 'boost-attack' }]),
      ];
    }, 1);
    ally.attack('p0:ally-1');
    const result = ally.choose('p0-3'); // MAIN action card is still an eligible payment.
    expect(result).toEqual([]);
    ally.apply({ type: 'defend', card: null }, 'p1');
    expect(ally.state.revealed).toMatchObject({ attacker: 'p0:ally-1', damage: 6 });
  });

  it.each(['before-attack', 'before-combat'] as const)(
    'consumes boost exactly once on %s cancellation and preserves discard reactions',
    (timing) => {
      const h = setup((defs) => {
        defs.characters.vanguard.abilities = [
          ability('before-attack', [{ type: 'boost-attack' }]),
          ability('card-discarded', energy),
          ability(timing, [{ type: 'cancel' }], 'cancel'),
        ];
      });
      h.attack();
      h.choose('p0-1');
      if (timing === 'before-combat') h.apply({ type: 'defend', card: null }, 'p1');
      expect(h.state.players[0].discard.filter((c) => c.id === 'p0-1')).toHaveLength(1);
      expect(h.state.fighters[0].counters.energy).toBe(2);
      expect(h.state.fighters[1].hp).toBe(15);
      expect(h.state.resolution.frames).toEqual({});
    },
  );

  it.each(['p0', 'p1'] as const)(
    'forfeit by %s consumes an unrevealed payment once and bypasses reactions',
    (departing) => {
      const h = setup(
        (defs) => {
          defs.characters.vanguard.abilities = [
            ability('before-attack', [{ type: 'boost-attack' }]),
            ability('card-discarded', energy),
          ];
        },
        0,
        4,
      );
      h.attack();
      h.choose('p0-1');
      const result = forfeit(h.state, departing, h.defs);
      expect(result.state.players[0].discard.filter((c) => c.id === 'p0-1')).toHaveLength(1);
      expect(result.outcomes.filter((o) => o.type === 'boost')).toHaveLength(1);
      expect(result.state.fighters[0].counters.energy).toBe(0);
      expect(result.state.resolution.combat).toBeNull();
      expect(forfeit(result.state, departing, h.defs).outcomes).toEqual([]);
    },
  );

  it('elimination before reveal consumes boost once while living owner reactions still resolve', () => {
    const h = setup(
      (defs) => {
        defs.characters.vanguard.abilities = [
          ability('before-attack', [{ type: 'boost-attack' }]),
          ability('card-discarded', energy),
        ];
        defs.characters.ranger.abilities = [
          ability('before-defense', [{ type: 'damage', amount: 100 }]),
        ];
      },
      0,
      4,
    );
    h.attack();
    h.choose('p0-1');
    const outcomes = h.apply({ type: 'defend', card: null }, 'p1');
    expect(outcomes.filter((o) => o.type === 'boost')).toHaveLength(1);
    expect(h.state.players[0].discard.map((c) => c.id)).toEqual(['p0-1', 'p0-0']);
    expect(h.state.fighters[0].counters.energy).toBe(2);
  });
});

describe('boost authoring validation', () => {
  it.each([undefined, -1, 1.5, 101, NaN])(
    'requires an explicit integer boost in range: %s',
    (boost) => {
      const defs = structuredClone(basic);
      Object.assign(defs.cards.strike, { boost });
      expect(() => validateDefinitions(defs)).toThrow();
    },
  );
  it.each(['after-attack', 'card-discarded', 'combat-reveal'] as const)(
    'rejects nested boost-attack outside allowed timings: %s',
    (trigger) => {
      const h = setup();
      h.defs.cards.strike.abilities = [
        ability(trigger, [
          {
            type: 'choose-option',
            prompt: 'Nested',
            options: [{ id: 'boost', label: 'Boost', effects: [{ type: 'boost-attack' }] }],
          },
        ]),
      ];
      expect(() => validateDefinitions(h.defs)).toThrow('boost-attack needs');
    },
  );
  it('rejects a boost-attack direct action effect without a combat timing', () => {
    const defs = structuredClone(basic);
    defs.cards.prepare.effects = [{ type: 'boost-attack' }];
    expect(() => validateDefinitions(defs)).toThrow('boost-attack needs');
  });
});

it('counts a zero-value payment as the only attack boost and permits declining every grant', () => {
  const configure = (defs: Definitions) => {
    defs.cards.guard.boost = 0;
    defs.characters.vanguard.abilities = [
      ability('before-attack', [{ type: 'boost-attack' }]),
      ability('before-combat', [{ type: 'boost-attack' }]),
    ];
  };
  const h = setup(configure);
  h.attack();
  h.choose('p0-1');
  h.apply({ type: 'defend', card: null }, 'p1');
  expect(h.state.revealed).toMatchObject({ damage: 4, boosts: [{ card: { id: 'p0-1' } }] });
  expect(h.state.resolution.choice).toBeNull();
  const skipped = setup(configure);
  skipped.attack();
  skipped.choose('$skip');
  skipped.apply({ type: 'defend', card: null }, 'p1');
  skipped.choose('$skip');
  expect(skipped.state.players[0].discard.map((c) => c.id)).toEqual(['p0-0']);
  expect(skipped.state.revealed?.boosts).toEqual([]);
});

it('does not duplicate a revealed payment when a pending discard reaction is forfeited', () => {
  const h = setup(
    (defs) => {
      defs.characters.vanguard.abilities = [
        ability('before-combat', [{ type: 'boost-attack' }]),
        ability('card-discarded', energy),
      ];
    },
    0,
    4,
  );
  h.attack();
  h.apply({ type: 'defend', card: null }, 'p1');
  h.defs.characters.vanguard.abilities!.push(
    ability(
      'card-discarded',
      [
        {
          type: 'choose-option',
          prompt: 'Discard continuation',
          options: [{ id: 'resume', label: 'Resume', effects: energy }],
        },
      ],
      'continuation',
    ),
  );
  const outcomes = h.choose('p0-1');
  expect(h.state.resolution.choice?.prompt).toBe('Discard continuation');
  expect(h.state.revealed?.boosts[0]?.card.id).toBe('p0-1');
  expect(outcomes.filter((o) => o.type === 'boost')).toHaveLength(1);
  h.reconnect();
  const forfeited = forfeit(h.state, 'p0', h.defs);
  expect(forfeited.outcomes.filter((o) => o.type === 'boost')).toEqual([]);
  expect(forfeited.state.players[0].discard.map((c) => c.id)).toEqual(['p0-0', 'p0-1']);
  expect(forfeited.state.resolution.choice).toBeNull();
  expect(forfeited.state.fighters[0].counters.energy).toBe(2);
});
