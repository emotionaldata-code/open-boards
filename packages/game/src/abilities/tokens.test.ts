import { condition } from './conditions';
import { describe, expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { createGame, execute } from '../engine';
import { validPath } from '../movement';
import { forcedPaths } from './positions';
import { validateDefinitions } from './validation';
import type { Command, Definitions, GameState } from '../types';
import type { Effect } from './vocabulary';

function setup(effects: Effect[] = [], edit: (defs: Definitions) => void = () => {}) {
  const defs = structuredClone(basic);
  defs.characters.vanguard.boardTokens = {
    id: 'beacon',
    name: 'Beacon',
    count: 2,
    linksMovement: true,
  };
  defs.cards.prepare.effects = effects;
  edit(defs);
  let state = createGame(
    ['vanguard', 'ranger'].map((character, i) => ({
      id: `p${i}`,
      name: `Seat ${i}`,
      character,
      deck: Array.from({ length: 20 }, (_, j) => ({
        id: `p${i}-${j}`,
        definition: j ? 'adapt' : 'prepare',
      })),
    })),
    defs,
  );
  const h = {
    defs,
    get state() {
      return state;
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
      const r = h.run(command, actor);
      if (!r.ok) throw new Error(r.message);
      state = r.state;
      return r;
    },
    choose(option?: string) {
      state = JSON.parse(JSON.stringify(state)) as GameState;
      const c = state.resolution.choice!;
      return h.apply(
        { type: 'choose', choice: c.id, options: [option ?? c.options[0].id] },
        c.player,
      );
    },
    action() {
      return h.apply({ type: 'play-action', fighter: 'p0:main', card: 'p0-0' });
    },
  };
  while (state.resolution.choice) h.choose();
  return h;
}

describe('reusable board tokens and card operations', () => {
  it('validates token references, bounded values and card-lock timing', () => {
    const h = setup();
    const bad = structuredClone(h.defs);
    bad.cards.prepare.effects = [{ type: 'choose-token', token: 'unknown', effects: [] }];
    expect(() => validateDefinitions(bad)).toThrow('unknown token');
    bad.cards.prepare.effects = [{ type: 'lock-card-value', value: 0 }];
    expect(() => validateDefinitions(bad)).toThrow('combat-reveal');
    bad.cards.prepare.effects = [{ type: 'discard', count: 2, onDecline: [] }];
    expect(() => validateDefinitions(bad)).toThrow('single optional discard');
  });
  it('keeps token shortcuts out of forced movement and other owners paths', () => {
    const h = setup();
    h.state.boardTokens![0].position = 'n0';
    h.state.boardTokens![1].position = 'n24';
    const [hero, enemy] = h.state.fighters;
    expect(validPath(h.state, hero, ['n24'], h.defs.map, 1)).toBe(true);
    expect(forcedPaths(h.state, hero, enemy, h.defs, 1, 'push').n24).toBeUndefined();
    enemy.position = 'n24';
    hero.position = 'n13';
    expect(validPath(h.state, enemy, ['n0'], h.defs.map, 1)).toBe(false);
  });
  it('does not silently start a game with insufficient token placement capacity', () => {
    expect(() =>
      setup([], (defs) => {
        defs.characters.vanguard.boardTokens!.count = 100;
      }),
    ).toThrow('cannot deploy');
  });
  it('retains exact token choice ownership and rejects forged, stale and duplicate commands atomically', () => {
    const h = setup([
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [
          {
            type: 'choose-token',
            token: 'beacon',
            chooser: 'chosen',
            effects: [{ type: 'move-token', distance: 1 }],
          },
        ],
      },
    ]);
    h.action();
    h.choose();
    const c = h.state.resolution.choice!;
    expect(c.player).toBe('p1');
    expect(projectGame(h.state, 'p0', false).choice).toBeNull();
    const before = structuredClone(h.state);
    const command: Command = { type: 'choose', choice: c.id, options: [c.options[0].id] };
    expect(h.run(command).ok).toBe(false);
    expect(h.run({ ...command, options: ['forged'] }, 'p1').ok).toBe(false);
    expect(h.state).toEqual(before);
    const revision = h.state.revision;
    h.choose();
    expect(execute(h.state, 'p1', { id: 'stale', revision, command }, h.defs)).toMatchObject({
      ok: false,
      error: 'STALE',
    });
    expect(
      execute(h.state, 'p1', { id: `c-${revision}`, revision: h.state.revision, command }, h.defs),
    ).toMatchObject({ ok: false, error: 'DUPLICATE' });
  });
  it('optional discard runs its alternative for an empty hand or a declined payment', () => {
    const effect: Effect = {
      type: 'discard',
      target: 'chosen',
      count: 1,
      onDecline: [{ type: 'draw', count: 1 }],
    };
    for (const empty of [true, false]) {
      const h = setup([{ type: 'choose-player', relation: 'opponent', effects: [effect] }]);
      if (empty) h.state.players[1].hand = [];
      h.action();
      const n = h.state.players[0].hand.length;
      h.choose();
      if (!empty) h.choose('$decline');
      expect(h.state.players[0].hand.length).toBe(n + 1);
    }
  });
  it('a protected optional discard still runs the alternative when ignored', () => {
    const h = setup(
      [{ type: 'discard', target: 'self', count: 1, onDecline: [{ type: 'draw', count: 1 }] }],
      (d) => {
        d.cards.ward = {
          ...d.cards.prepare,
          id: 'ward',
          effects: [],
          ongoing: { optionalDiscardProtection: true },
        };
      },
    );
    h.state.players[0].ongoing = [{ id: 'ward', definition: 'ward' }];
    h.action();
    const n = h.state.players[0].hand.length;
    h.choose('ignore');
    expect(h.state.players[0].hand.length).toBe(n + 1);
  });
  it('ordered hand returns preserve identities, remain private and do not fire discard hooks', () => {
    const h = setup([{ type: 'return-to-deck', count: 2 }], (d) => {
      d.characters.vanguard.abilities = [
        {
          id: 'discard',
          name: 'Discard',
          description: 'Discard',
          trigger: 'card-discarded',
          effects: [{ type: 'draw', count: 1 }],
        },
      ];
    });
    h.action();
    const c = h.state.resolution.choice!;
    const first = c.options.at(-1)!.id;
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    h.choose(first);
    const second = h.state.resolution.choice!.options[0].id;
    h.choose(second);
    // The action itself fires its ordinary discard hook, drawing the selected top card.
    expect(h.state.players[0].hand.some((c) => c.id === first)).toBe(true);
    expect(h.state.players[0].deck[0].id).toBe(second);
    expect(h.state.players[0].discard.map((c) => c.id)).toEqual(['p0-0']);
  });
  it('returning from temporary removal accepts a fresh space before turn-start rules while preserving the off-board history', () => {
    const h = setup([{ type: 'remove-until-next-turn' }, { type: 'end-turn' }]);
    h.action();
    expect(h.state.fighters[0]).toMatchObject({ position: null, defeated: false, hp: 15 });
    h.apply({ type: 'end-turn' }, 'p1');
    expect(h.choose('n24').outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'placed', fighter: 'p0:main', position: 'n24' }),
      ]),
    );
    expect(h.state.resolution.turnPositions['p0:main']).toBeNull();
    expect(h.state.fighters[0].position).toBe('n24');
  });
});

it('a card-only value lock survives an immediate attack replacement and its new modifiers', () => {
  const h = setup([], (d) => {
    d.cards.strike.abilities = [
      {
        id: 'replace',
        name: 'Replace',
        description: 'Replace',
        trigger: 'combat-reveal',
        effects: [{ type: 'replace-attack' }],
      },
    ];
    d.cards.adapt.abilities = [
      {
        id: 'lock',
        name: 'Lock',
        description: 'Lock',
        trigger: 'combat-reveal',
        effects: [{ type: 'lock-card-value', target: 'opponent', value: 0 }],
      },
    ];
    d.cards.heavy = {
      id: 'heavy',
      name: 'Heavy',
      category: 'attack',
      usableBy: 'MAIN',
      value: 9,
      boost: 1,
      abilities: [
        {
          id: 'relock',
          name: 'Relock',
          description: 'Relock',
          trigger: 'combat-reveal',
          effects: [{ type: 'lock-card-value', value: 9 }],
        },
        {
          id: 'power',
          name: 'Power',
          description: 'Power',
          trigger: 'before-combat',
          effects: [
            { type: 'modify', field: 'attack', amount: 5 },
            { type: 'draw', count: 1 },
          ],
        },
      ],
    };
  });
  h.state.players[1].hand[0].definition = 'strike';
  h.state.players[1].hand[1].definition = 'heavy';
  h.state.turn = 1;
  h.state.fighters[1].position = 'n1';
  h.apply({ type: 'attack', fighter: 'p1:main', target: 'p0:main', card: 'p1-0' }, 'p1');
  h.apply({ type: 'defend', card: 'p0-1' });
  h.choose();
  h.choose('p1-1');
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.state.fighters[0].hp).toBe(15);
  expect(h.state.players[1].hand.length).toBe(5);
});

it('turn-start token conditions retain the rule owner when testing another fighter', () => {
  const h = setup();
  const position = h.state.boardTokens![0].position;
  h.state.resolution.frames[999] = { kind: 'turn', actor: 'p0:main' };
  h.state.resolution.turnPositions['p1:main'] = position;
  h.state.resolution.turnTokens = structuredClone(h.state.boardTokens!);
  h.state.boardTokens![0].position = 'n24';
  h.state.fighters[1].position = 'n13';
  expect(
    condition(
      h.state,
      h.defs,
      { frame: 999, owner: 'p0:main', chosen: 'p1:main' },
      { type: 'on-token', token: 'beacon', target: 'chosen', atTurnStart: true },
    ),
  ).toBe(true);
  expect(
    condition(
      h.state,
      h.defs,
      { frame: 999, owner: 'p0:main', chosen: 'p1:main' },
      { type: 'on-token', token: 'beacon', target: 'chosen' },
    ),
  ).toBe(false);
});

it('an optional payment can delegate hand selection without leaking its options', () => {
  const h = setup([
    {
      type: 'choose-player',
      relation: 'opponent',
      effects: [
        {
          type: 'discard',
          target: 'chosen',
          chooser: 'self',
          count: 1,
          onDecline: [{ type: 'draw', count: 1 }],
        },
      ],
    },
  ]);
  h.action();
  h.choose();
  expect(h.state.resolution.choice!.player).toBe('p0');
  expect(
    h.state.resolution.choice!.options.filter((o) => o.id !== '$decline').every((o) => o.card),
  ).toBe(true);
  expect(projectGame(h.state, 'p1', false).choice).toBeNull();
  h.choose('p1-1');
  expect(h.state.players[1].discard.some((c) => c.id === 'p1-1')).toBe(true);
});

it('a card-granted pre-reveal BOOST is consumed but its value is blocked by a card-only lock', () => {
  const h = setup([], (d) => {
    d.cards.strike.abilities = [
      {
        id: 'boost',
        name: 'Boost',
        description: 'Boost',
        trigger: 'before-attack',
        effects: [{ type: 'boost-attack' }],
      },
    ];
    d.cards.adapt.abilities = [
      {
        id: 'lock',
        name: 'Lock',
        description: 'Lock',
        trigger: 'combat-reveal',
        effects: [{ type: 'lock-card-value', target: 'opponent', value: 0 }],
      },
    ];
  });
  h.state.players[1].hand[0].definition = 'strike';
  h.state.turn = 1;
  h.state.fighters[1].position = 'n1';
  h.apply({ type: 'attack', fighter: 'p1:main', target: 'p0:main', card: 'p1-0' }, 'p1');
  h.choose('p1-1');
  h.apply({ type: 'defend', card: 'p0-1' });
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.state.players[1].discard.some((c) => c.id === 'p1-1')).toBe(true);
});

it('dormant owners are protected from player-level draw, discard, inspection and off-board damage', async () => {
  const { Runtime } = await import('./runtime');
  const h = setup([{ type: 'remove-until-next-turn' }, { type: 'end-turn' }]);
  h.action();
  const before = structuredClone(h.state.players[0]);
  const hp = h.state.fighters[0].hp;
  const runtime = new Runtime(h.state, h.defs, () => {});
  const frame = runtime.frame({ kind: 'turn', actor: 'p1:main' });
  runtime.prepend(
    ...runtime.effects(
      [
        { type: 'draw', target: 'chosen', count: 2 },
        { type: 'discard', target: 'chosen', count: 1 },
        { type: 'inspect-hand', target: 'chosen' },
        { type: 'damage', target: 'chosen', amount: 5 },
      ],
      { frame, owner: 'p1:main', chosen: 'p0:main' },
    ),
  );
  runtime.run();
  expect(h.state.players[0]).toEqual(before);
  expect(h.state.fighters[0].hp).toBe(hp);
  expect(h.state.resolution.choice).toBeNull();
});
