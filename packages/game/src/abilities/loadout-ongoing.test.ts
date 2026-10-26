import { finishActions } from '../../../../tests/finish-actions';
import { expect, it } from 'vitest';
import { basic, deckDefinitions } from '../../../../tests/rules-fixture';
import { validateDefinitions } from './validation';
import { createGame, execute, forfeit } from '../engine';
import type { Command, Definitions, GameState } from '../types';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { Runtime } from './runtime';
import { emitter } from '../rules';
import { reachablePaths } from '../movement';

function setup(edit: (defs: Definitions) => void = () => {}, seats = 2) {
  const defs = structuredClone(basic);
  edit(defs);
  const h = {
    defs,
    state: createGame(
      Array.from({ length: seats }, (_, i) => ({
        id: `p${i}`,
        name: `Seat ${i}`,
        character: 'vanguard',
        deck: deckDefinitions().map((definition, j) => ({ id: `p${i}-${j}`, definition })),
      })),
      defs,
      713,
    ),
    finishTurn(actor = 'p0') {
      const result = finishActions(h.state, defs, actor);
      h.state = result.state;
      return result.outcomes;
    },
    run(command: Command, actor = 'p0') {
      return execute(
        h.state,
        actor,
        { id: `c-${h.state.revision}`, revision: h.state.revision, command },
        defs,
      );
    },
    apply(command: Command, actor = 'p0') {
      const r = h.run(command, actor);
      if (!r.ok) throw new Error(r.message);
      h.state = r.state;
      return r.outcomes;
    },
    choose(option?: string) {
      h.state = JSON.parse(JSON.stringify(h.state)) as GameState;
      const c = h.state.resolution.choice!;
      return h.apply(
        { type: 'choose', choice: c.id, options: [option ?? c.options[0].id] },
        c.player,
      );
    },
    play(definition = 'prepare') {
      const p = h.state.players[h.state.turn];
      p.hand[0].definition = definition;
      return h.apply({ type: 'play-action', fighter: `${p.id}:main`, card: p.hand[0].id }, p.id);
    },
  };
  return h;
}

it('selects all four loadouts privately before dealing, then starts the first turn once', () => {
  const h = setup((d) => {
    d.characters.vanguard.deckSelection = {
      name: 'Loadout',
      description: 'Choose one card design',
      groups: [{ name: 'a tool', cards: ['strike', 'adapt'] }],
    };
  }, 4);
  for (let i = 0; i < 4; i++) {
    const before = structuredClone(h.state),
      c = h.state.resolution.choice!;
    expect(c.player).toBe(`p${i}`);
    expect(h.state.players[i].hand).toEqual([]);
    expect(projectGame(h.state, `p${(i + 1) % 4}`, false).choice).toBeNull();
    expect(h.run({ type: 'choose', choice: c.id, options: ['forged'] }, c.player).ok).toBe(false);
    expect(h.state).toEqual(before);
    h.choose(i % 2 ? 'adapt' : 'strike');
    expect(h.state.players[i].hand).toHaveLength(5);
    expect(h.state.players[i].deck).toHaveLength(10);
  }
  expect(h.state.phase.type).toBe('taking-actions');
  expect(h.state.turn).toBe(0);
  expect(h.state.resolution.frames).toEqual({});
});

it('locks Maneuver paths without mutation and clears the lock at the turn boundary', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [{ type: 'lock-movement' }];
  });
  h.play();
  h.apply({ type: 'maneuver' });
  const before = structuredClone(h.state);
  expect(reachablePaths(h.state, h.state.fighters[0], h.defs.map, 20)).toEqual({});
  expect(h.run({ type: 'move', fighter: 'p0:main', path: ['n1'] }).ok).toBe(false);
  expect(h.state).toEqual(before);
  h.apply({ type: 'move', fighter: 'p0:main', path: [] });
  expect(h.state.turn).toBe(1);
  expect(h.state.resolution.movementLocks).toEqual([]);
});

it.each(['move', 'push', 'pull', 'teleport', 'swap'] as const)(
  'a movement lock prevents effect %s, including an atomic swap',
  (type) => {
    const h = setup();
    h.state.fighters[1].position = 'n1';
    h.state.resolution.movementLocks = ['p1:main'];
    const r = new Runtime(h.state, h.defs, emitter(h.state, []));
    const frame = r.frame({ kind: 'turn', actor: 'p0:main' });
    r.prepend(
      ...r.effects(
        [
          type === 'swap'
            ? { type: 'swap', target: 'chosen' }
            : type === 'teleport'
              ? { type: 'teleport', target: 'chosen', optional: false }
              : { type, target: 'chosen', distance: 3 },
        ],
        { frame, owner: 'p0:main', chosen: 'p1:main' },
      ),
    );
    r.run();
    expect(h.state.fighters[1].position).toBe('n1');
    expect(h.state.fighters[0].position).toBe('n0');
    expect(h.state.resolution.choice).toBeNull();
  },
);

it('activates ongoing only after regular effects, replacing and discarding the previous exact instance', () => {
  const h = setup((d) => {
    d.cards.prepare.ongoing = { optionalDiscardProtection: true, discardUnlessAttacked: true };
    d.cards.prepare.effects = [{ type: 'discard', count: 1 }];
  });
  h.state.actions = 3;
  h.play();
  expect(h.state.players[0].ongoing).toBeUndefined();
  expect(h.state.resolution.choice?.prompt).toBe('Discard 1 card');
  h.choose();
  const first = h.state.players[0].ongoing![0];
  h.play();
  expect(h.state.resolution.choice?.prompt).toBe('Ignore this discard effect?');
  h.choose('ignore');
  expect(h.state.players[0].ongoing).toHaveLength(1);
  expect(h.state.players[0].ongoing![0].id).not.toBe(first.id);
  expect(h.state.players[0].discard.filter((c) => c.id === first.id)).toHaveLength(1);
  expect(projectGame(h.state, 'p1', false).players[0].ongoing).toEqual(h.state.players[0].ongoing);
});

it.each([false, true])(
  'optional ongoing protection applies before random discard=%s or opposing card inspection',
  (random) => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        {
          type: 'discard',
          target: 'opponent',
          ...(random ? { random: true } : { chooser: 'self' }),
          count: 2,
        },
      ];
    });
    h.state.players[1].ongoing = [{ id: 'ongoing', definition: 'adapt' }];
    h.defs.cards.adapt = {
      ...h.defs.cards.prepare,
      id: 'adapt',
      ongoing: { optionalDiscardProtection: true },
    };
    h.state.fighters[1].position = 'n1';
    const r = new Runtime(h.state, h.defs, emitter(h.state, [])),
      frame = r.frame({
        kind: 'combat',
        actor: 'p0:main',
        target: 'p1:main',
        attacker: 'p0:main',
        defender: 'p1:main',
        card: { id: 'x', definition: 'strike' },
        defenseCard: null,
        boosts: [],
        attack: 4,
        defense: 0,
        amount: 0,
      });
    r.prepend(...r.effects(h.defs.cards.prepare.effects!, { frame, owner: 'p0:main' }));
    r.run();
    expect(h.state.resolution.choice?.player).toBe('p1');
    expect(h.state.resolution.choice?.options.every((o) => !o.card)).toBe(true);
    const before = h.state.players[1].hand.length;
    h.choose('ignore');
    expect(h.state.players[1].hand).toHaveLength(before);
  },
);

it('hand-limit discards bypass effect protection', () => {
  const h = setup((d) => {
    d.cards.prepare.ongoing = { optionalDiscardProtection: true };
  });
  h.play();
  h.state.players[0].hand.push(...h.state.players[0].deck.splice(0, 5));
  h.finishTurn();
  expect(h.state.phase.type).toBe('discarding');
  expect(h.state.resolution.choice).toBeNull();
  h.apply({
    type: 'discard',
    cards: h.state.players[0].hand.slice(0, h.state.players[0].hand.length - 7).map((c) => c.id),
  });
  expect(h.state.turn).toBe(1);
});

it('a forced end turn survives later action-gain effects and finishes combat hooks before advancing', () => {
  const h = setup((d) => {
    d.cards.guard.abilities = [
      {
        id: 'stop',
        name: 'Stop',
        description: 'End the turn',
        trigger: 'after-combat',
        effects: [{ type: 'end-turn' }],
      },
    ];
    d.cards.strike.abilities = [
      {
        id: 'gain',
        name: 'Gain',
        description: 'Gain actions',
        trigger: 'after-combat',
        effects: [
          { type: 'actions', amount: 2 },
          { type: 'draw', count: 1 },
        ],
      },
    ];
  });
  h.state.fighters[1].position = 'n1';
  h.state.players[1].hand[0].definition = 'guard';
  h.apply({
    type: 'attack',
    fighter: 'p0:main',
    card: h.state.players[0].hand[0].id,
    target: 'p1:main',
  });
  h.apply({ type: 'defend', card: h.state.players[1].hand[0].id }, 'p1');
  expect(h.state.players[0].hand).toHaveLength(5);
  expect(h.state.turn).toBe(1);
  expect(h.state.actions).toBe(2);
});

it('forfeiting the active owner clears this turn’s movement locks before the next turn', () => {
  const h = setup(() => {}, 4);
  h.state.resolution.movementLocks = ['p1:main'];
  h.state = forfeit(h.state, 'p0', h.defs).state;
  expect(h.state.turn).toBe(1);
  expect(h.state.resolution.movementLocks).toEqual([]);
});

it.each([4, 99])(
  'named-value discard offers protection only after a matching value %i was named',
  (number) => {
    const h = setup((d) => {
      d.cards.prepare.ongoing = { optionalDiscardProtection: true };
    });
    h.state.players[1].ongoing = [{ id: 'potion', definition: 'prepare' }];
    const r = new Runtime(h.state, h.defs, emitter(h.state, [])),
      frame = r.frame({
        kind: 'card',
        actor: 'p0:main',
        card: { id: 'naming', definition: 'prepare' },
        discarded: false,
      });
    r.prepend(
      ...r.effects([{ type: 'named-value-discard', target: 'chosen' }], {
        frame,
        owner: 'p0:main',
        chosen: 'p1:main',
      }),
    );
    r.run();
    expect(h.state.resolution.choice?.player).toBe('p0');
    h.choose(`value-${number}`);
    if (number === 4) {
      expect(h.state.resolution.choice?.prompt).toBe('Ignore this discard effect?');
      h.choose('ignore');
      expect(h.state.players[1].hand).toHaveLength(5);
    } else {
      expect(h.state.resolution.choice?.public).toBe(true);
      expect(h.state.resolution.choice?.prompt).toContain('Revealed');
    }
  },
);

it('ongoing discard protection cannot waive a defense BOOST payment', () => {
  const h = setup((d) => {
    d.cards.prepare.ongoing = { optionalDiscardProtection: true };
    d.cards.guard.abilities = [
      {
        id: 'boost',
        name: 'Boost',
        description: 'Boost this card',
        trigger: 'before-combat',
        effects: [{ type: 'boost-combat' }],
      },
    ];
  });
  h.play();
  h.state.turn = 1;
  h.state.actions = 2;
  h.state.fighters[1].position = 'n1';
  h.state.players[0].hand[0].definition = 'guard';
  h.apply(
    { type: 'attack', fighter: 'p1:main', target: 'p0:main', card: h.state.players[1].hand[0].id },
    'p1',
  );
  h.apply({ type: 'defend', card: h.state.players[0].hand[0].id });
  expect(h.state.resolution.choice?.prompt).toBe('Boost defense');
  const payment = h.state.players[0].hand[0];
  h.choose(payment.id);
  expect(h.state.players[0].discard.filter((c) => c.id === payment.id)).toHaveLength(1);
  expect(h.state.resolution.choice).toBeNull();
});

it('validates setup groups, ongoing card categories, search references and BOOST timing', () => {
  const invalid = (edit: (defs: Definitions) => void) => {
    const d = structuredClone(basic);
    edit(d);
    expect(() => validateDefinitions(d)).toThrow();
  };
  invalid((d) => {
    d.characters.vanguard.deckSelection = {
      name: 'Tool',
      description: 'Choose',
      groups: [{ name: 'a tool', cards: ['strike', 'strike'] }],
    };
  });
  invalid((d) => {
    d.cards.strike.ongoing = { optionalDiscardProtection: true };
  });
  invalid((d) => {
    d.cards.prepare.effects = [{ type: 'search-cards', cards: ['unknown'] }];
  });
  invalid((d) => {
    d.cards.strike.abilities = [
      {
        id: 'boost',
        name: 'Boost',
        description: 'Boost',
        trigger: 'after-combat',
        effects: [{ type: 'boost-combat' }],
      },
    ];
  });
});

it('requires the complete supplied pool before pre-deal selection', () => {
  const d = structuredClone(basic);
  d.characters.vanguard.deckSelection = {
    name: 'Loadout',
    description: 'Choose',
    groups: [{ name: 'a tool', cards: ['strike', 'adapt'] }],
  };
  expect(() =>
    createGame(
      [0, 1].map((i) => ({
        id: `p${i}`,
        name: 'Seat',
        character: 'vanguard',
        deck: deckDefinitions()
          .slice(0, 5)
          .map((definition, j) => ({ id: `p${i}-${j}`, definition })),
      })),
      d,
    ),
  ).toThrow('complete selectable card pool');
});
