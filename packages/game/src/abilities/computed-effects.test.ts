import { describe, expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { createGame, execute } from '../engine';
import { deploymentSpaces } from '../deployment';
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

describe('computed damage, modifiers and discard bonuses', () => {
  it('validates typed expressions and rejects unsupported timing and random-choice combinations', () => {
    const h = setup((d) => {
      d.cards.strike.abilities = [
        ability('before-combat', [
          {
            type: 'modify',
            field: 'attack',
            amount: { fighters: 'friendly', role: 'ally', range: 'zone', anchor: 'opponent' },
          },
        ]),
      ];
    });
    expect(() => validateDefinitions(h.defs)).not.toThrow();
    h.defs.cards.strike.abilities = [
      ability('after-combat', [
        { type: 'discard', count: 1, combatBonus: { field: 'attack', per: 'boost' } },
      ]),
    ];
    expect(() => validateDefinitions(h.defs)).toThrow('before-combat');
    h.defs.cards.strike.abilities = [
      ability('before-combat', [{ type: 'discard', count: 1, random: true, upTo: true }]),
    ];
    expect(() => validateDefinitions(h.defs)).toThrow('random discard');
    h.defs.cards.strike.abilities = [ability('before-combat', [{ type: 'replace-attack' }])];
    expect(() => validateDefinitions(h.defs)).toThrow('combat-reveal');
  });

  it('reads the discarded card’s explicit BOOST, not its printed value, and respects locked defense', () => {
    const make = (locked: boolean) =>
      setup((d) => {
        d.cards.adapt.abilities = [
          ability('before-combat', [
            {
              type: 'discard',
              target: 'opponent',
              count: 1,
              random: true,
              combatBonus: { field: 'defense', per: 'boost' },
            },
          ]),
        ];
        d.cards.strike.boost = 7;
        d.cards.adapt.boost = 7;
        if (locked) d.statuses!['fixed-four'].combatValue = { value: 4, locked: true };
        d.cards.strike.value = 10;
      });
    const h = make(false);
    h.fight();
    expect(h.state.revealed?.damage).toBe(0);
    expect(h.state.players[0].hand).toHaveLength(3);
    const g = make(true);
    g.fighter('p1:main').statuses = [{ id: 'fixed-four', stacks: 1 }];
    g.fight();
    expect(g.state.revealed?.damage).toBe(6);
    expect(g.state.players[0].hand).toHaveLength(3);
  });

  it('resumes selected discard payments around nested private reactions exactly once', () => {
    const h = setup((d) => {
      d.cards.strike.abilities = [
        ability('before-combat', [
          {
            type: 'discard',
            count: 100,
            upTo: true,
            combatBonus: { field: 'attack', per: 'card' },
          },
        ]),
      ];
      d.characters.vanguard.abilities = [
        { ...ability('card-discarded', [{ type: 'draw', count: 1 }]), optional: true },
      ];
    });
    h.fight(false);
    secureChoice(h);
    h.choose('skip'); // reveal-associated discard reaction precedes the payment
    secureChoice(h);
    const chosen = h.state.players[0].hand.slice(0, 2).map((c) => c.id);
    const c = h.state.resolution.choice!;
    h.apply({ type: 'choose', choice: c.id, options: chosen });
    let reactions = 1;
    while (h.state.resolution.choice) {
      secureChoice(h);
      h.choose('skip');
      reactions++;
      expect(reactions).toBeLessThan(5);
    }
    expect(reactions).toBe(3); // played attack's discard plus the two payments
    expect(h.state.revealed?.damage).toBe(6);
    expect(h.state.players[0].discard.map((c) => c.id)).toEqual(['p0-0', ...chosen]);
  });

  it('damage callbacks use the resolved receipt after prevention and preserve the original chosen fighter', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        {
          type: 'choose-fighter',
          relation: 'enemy',
          effects: [
            {
              type: 'damage',
              target: 'chosen',
              amount: 3,
              onDamage: [
                {
                  type: 'choose-option',
                  prompt: 'Damage receipt',
                  options: [
                    {
                      id: 'resolve',
                      label: 'Resolve',
                      effects: [{ type: 'heal', amount: { event: 'amount' } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];
      d.characters.ranger.abilities = [
        ability('before-damage', [{ type: 'modify', field: 'amount', amount: -1 }]),
      ];
    });
    h.fighter('p0:main').hp = 10;
    h.action();
    h.choose('p1:main');
    secureChoice(h);
    h.choose('resolve');
    expect(h.fighter('p1:main').hp).toBe(13);
    expect(h.fighter('p0:main').hp).toBe(12);
    expect(h.state.resolution.frames).toEqual({});
  });

  it('anchored area damage sums successful receipts after nested cancellation before one heal', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        {
          type: 'area-damage',
          range: 'adjacent',
          relation: 'any',
          amount: 1,
          onDamage: [{ type: 'heal', amount: { event: 'amount' } }],
        },
      ];
      d.characters.vanguard.ally!.abilities = [
        { ...ability('before-damage', [{ type: 'cancel' }]), optional: true },
      ];
    });
    h.fighter('p0:main').position = 'n0';
    h.fighter('p0:main').hp = 9;
    h.fighter('p1:main').position = 'n1';
    h.fighter('p0:ally-1').position = 'n5';
    h.fighter('p0:ally-2').position = 'n10';
    h.fighter('p0:ally-3').position = 'n22';
    h.action();
    secureChoice(h);
    h.choose('use');
    secureChoice(h);
    h.choose('skip');
    expect(h.fighter('p0:main').hp).toBe(11);
    expect(h.fighter('p0:ally-1').hp).toBe(2);
    expect(h.fighter('p0:ally-2').hp).toBe(1);
    expect(h.fighter('p1:main').hp).toBe(14);
  });
});

it('replaces only the attacking instance, recalculates modifiers and runs only its new immediate/lifecycle effects', () => {
  const h = setup((d) => {
    d.cards.adapt.abilities = [ability('combat-reveal', [{ type: 'replace-attack' }])];
    d.cards.strike.abilities = [
      ability('combat-reveal', [{ type: 'damage', target: 'opponent', amount: 8 }]),
    ];
    d.cards.guard.category = 'versatile';
    d.cards.guard.abilities = [
      ability('combat-reveal', [{ type: 'draw', count: 1 }]),
      ability('card-played', [{ type: 'draw', count: 1 }]),
    ];
    d.statuses!.focus = { id: 'focus', name: 'Focus', maxStacks: 1, modifiers: { attack: 2 } };
  });
  h.state.players[0].hand[1].definition = 'guard';
  const replacement = h.state.players[0].hand[1];
  h.fighter('p0:main').statuses = [{ id: 'focus', stacks: 1 }];
  h.fight();
  secureChoice(h);
  h.choose();
  secureChoice(h);
  h.choose(replacement.id);
  expect(h.state.revealed).toMatchObject({ attack: replacement, damage: 2 });
  expect(h.fighter('p1:main').hp).toBe(13);
  expect(h.state.players[0].hand).toHaveLength(6);
  expect(h.state.players[0].discard).toEqual([replacement]);
  expect(h.state.resolution.frames).toEqual({});
});

it('replays random discard selection from the serialized stream without replacing or revealing private choices', () => {
  const make = () =>
    setup((d) => {
      d.cards.strike.abilities = [
        ability('before-combat', [
          {
            type: 'discard',
            target: 'opponent',
            random: true,
            count: 2,
            combatBonus: { field: 'attack', per: 'boost' },
          },
        ]),
      ];
    });
  const h = make(),
    g = make();
  g.reconnect();
  h.fight(false);
  g.fight(false);
  expect(h.state.players[1].discard).toEqual(g.state.players[1].discard);
  expect(h.state.players[1].hand).toHaveLength(3);
  expect(h.state.resolution.choice).toBeNull();
});
