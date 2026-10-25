import { expect, it } from 'vitest';
import {
  createGame,
  deploymentSpaces,
  execute,
  validateDefinitions,
  type Ability,
  type Command,
  type Definitions,
  type Effect,
  type GameState,
} from '../index';
import { basic } from '../../../../tests/rules-fixture';

function setup(edit: (defs: Definitions) => void) {
  const defs = structuredClone(basic);
  defs.characters.vanguard.ally = {
    id: 'companion',
    name: 'Companion',
    count: 1,
    hp: 6,
    attackType: 'melee',
  };
  edit(defs);
  let state = createGame(
    ['vanguard', 'ranger'].map((character, i) => ({
      id: `p${i}`,
      name: `Seat ${i}`,
      character,
      deck: defs.characters[character].deck.flatMap(({ card, count }) =>
        Array.from({ length: count }, (_, j) => ({ id: `p${i}-${card}-${j}`, definition: card })),
      ),
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
    run(command: Command, actor = 'p0') {
      return execute(
        state,
        actor,
        { id: `c-${state.revision}`, revision: state.revision, command },
        defs,
      );
    },
    apply(command: Command, actor = 'p0') {
      state = JSON.parse(JSON.stringify(state)) as GameState;
      const result = h.run(command, actor);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      return result.outcomes;
    },
    choose(option?: string) {
      const choice = state.resolution.choice!;
      return h.apply(
        { type: 'choose', choice: choice.id, options: [option ?? choice.options[0].id] },
        choice.player,
      );
    },
    attack() {
      h.fighter().position = 'n0';
      h.fighter('p1:main').position = 'n1';
      return h.apply({
        type: 'attack',
        fighter: 'p0:main',
        target: 'p1:main',
        card: state.players[0].hand[0].id,
      });
    },
    defend(card: string | null = null) {
      if (card) state.players[1].hand[0].definition = card;
      return h.apply({ type: 'defend', card: card ? state.players[1].hand[0].id : null }, 'p1');
    },
  };
  h.apply({
    type: 'place-ally',
    fighter: 'p0:ally-1',
    position: deploymentSpaces(state, 'p0:ally-1', defs.map)[0],
  });
  h.fighter('p0:ally-1').position = 'n5';
  return h;
}
function ability(trigger: Ability['trigger'], effects: Effect[]): Ability {
  return { id: 'rule', name: 'Rule', description: 'Fixture rule', trigger, effects };
}

function action(h: ReturnType<typeof setup>) {
  const card = h.state.players[0].hand[0];
  card.definition = 'prepare';
  return h.apply({ type: 'play-action', fighter: 'p0:main', card: card.id });
}

it('validates new operations strictly, rejects wrong timing, unknown tags and malformed information effects', () => {
  for (const effect of [{ type: 'predict-value' }, { type: 'ignore-combat-value' }]) {
    const defs = structuredClone(basic);
    defs.cards.prepare.effects = [effect] as Effect[];
    expect(() => validateDefinitions(defs)).toThrow();
  }
  const defs = structuredClone(basic);
  defs.characters.vanguard.cardEffectProtection = {
    name: 'Protected',
    description: 'Protected named cards',
    tags: ['MAIN'],
  };
  defs.cards.guard.faceUpDefense = true;
  defs.cards.guard.abilities = [
    ability('before-defense', [{ type: 'predict-value' }]),
    {
      ...ability('before-combat', [{ type: 'ignore-combat-value', target: 'opponent' }]),
      id: 'ignore',
      when: { type: 'prediction-matches' },
    },
  ];
  expect(() => validateDefinitions(defs)).not.toThrow();
  expect(() =>
    validateDefinitions({
      ...defs,
      characters: {
        ...defs.characters,
        vanguard: {
          ...defs.characters.vanguard,
          cardEffectProtection: {
            ...defs.characters.vanguard.cardEffectProtection,
            tags: ['INVALID'],
          },
        },
      },
    }),
  ).toThrow();
});

it('keeps numeric prediction choices independent of the hidden commitment, including values zero and 100', () => {
  const options: string[][] = [];
  for (const attack of ['strike', 'adapt']) {
    const h = setup((defs) => {
      defs.cards.guard.abilities = [ability('before-defense', [{ type: 'predict-value' }])];
    });
    h.state.players[0].hand[0].definition = attack;
    h.attack();
    h.defend('guard');
    options.push(h.state.resolution.choice!.options.map((o) => o.id));
    const before = structuredClone(h.state),
      choice = h.state.resolution.choice!;
    expect(h.run({ type: 'choose', choice: choice.id, options: ['value-101'] }, 'p1').ok).toBe(
      false,
    );
    expect(h.state).toEqual(before);
    h.choose('value-100');
    expect(h.state.revealed?.prediction).toBe(100);
  }
  expect(options[0]).toEqual(options[1]);
  expect(options[0]).toHaveLength(101);
});

it('suppression protection belongs to the recipient owner and tag, and does not prevent ignoring values', () => {
  const h = setup((defs) => {
    defs.characters.vanguard.cardEffectProtection = {
      name: 'Protection',
      description: 'MAIN cards are protected',
      tags: ['MAIN'],
    };
    defs.cards.strike.abilities = [ability('after-combat', [{ type: 'draw', count: 1 }])];
    defs.cards.guard.abilities = [
      ability('combat-reveal', [{ type: 'suppress-card-effects' }]),
      {
        ...ability('before-combat', [{ type: 'ignore-combat-value', target: 'opponent' }]),
        id: 'ignore',
      },
    ];
  });
  h.attack();
  h.defend('guard');
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.state.players[0].hand).toHaveLength(5); // protected after-combat draw
});

it('ignores a final value even when a later protected effect replaces it or pays an attack BOOST', () => {
  const h = setup((defs) => {
    defs.cards.strike.abilities = [
      ability('before-combat', [{ type: 'set-combat-value', value: 10 }, { type: 'boost-attack' }]),
    ];
    defs.cards.guard.abilities = [
      ability('before-combat', [{ type: 'ignore-combat-value', target: 'opponent' }]),
    ];
  });
  h.attack();
  h.defend('guard');
  h.choose(h.state.players[0].hand[0].id);
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.state.revealed?.boosts).toHaveLength(1);
});

it('names a value before asking the affected owner and resumes nested discard reactions before BOOST damage', () => {
  const h = setup((defs) => {
    defs.cards.prepare.effects = [
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [{ type: 'named-value-discard', target: 'chosen' }],
      },
    ];
    defs.characters.ranger.abilities = [
      { ...ability('card-discarded', [{ type: 'draw', count: 1 }]), optional: true },
    ];
  });
  h.state.players[1].hand.forEach((c) => (c.definition = 'guard'));
  action(h);
  h.choose('p1');
  h.choose('value-3');
  const card = h.state.players[1].hand[0];
  h.choose(card.id);
  expect(h.state.resolution.choice?.player).toBe('p1');
  expect(h.fighter('p1:main').hp).toBe(15);
  h.choose('use');
  expect(h.fighter('p1:main').hp).toBe(13);
  expect(h.state.players[1].discard).toEqual([card]);
  expect(h.state.resolution.frames).toEqual({});
});

it('snapshots public hand reveals while private inspection exposes no public receipt', () => {
  for (const isPublic of [false, true]) {
    const h = setup((defs) => {
      defs.cards.prepare.effects = [
        {
          type: 'choose-player',
          relation: 'opponent',
          effects: [{ type: 'inspect-hand', target: 'chosen', public: isPublic }],
        },
      ];
    });
    action(h);
    const outcomes = h.choose('p1');
    expect(h.state.resolution.choice?.public ?? false).toBe(isPublic);
    expect(outcomes.filter((o) => o.type === 'hand-revealed')).toHaveLength(isPublic ? 1 : 0);
    h.choose();
    expect(h.state.players[1].hand).toHaveLength(5);
  }
});

it('an atomic exchange runs both fighters’ hooks and preserves a suspended binding through JSON', () => {
  const h = setup((defs) => {
    defs.cards.prepare.effects = [
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [
          {
            type: 'swap',
            target: 'chosen',
            onSuccess: [{ type: 'damage', target: 'chosen', amount: 1 }],
          },
        ],
      },
    ];
    for (const def of Object.values(defs.characters)) {
      def.counters = { steps: { initial: 0, max: 10 } };
      def.abilities = [
        { ...ability('before-move', [{ type: 'draw', count: 1 }]), optional: true },
        { ...ability('after-move', [{ type: 'counter', name: 'steps', amount: 1 }]), id: 'steps' },
      ];
    }
  });
  const a = h.fighter().position,
    b = h.fighter('p1:main').position;
  action(h);
  h.choose('p1');
  expect(h.fighter().position).toBe(a);
  h.choose('skip');
  expect(h.state.resolution.choice?.player).toBe('p1');
  expect(h.fighter('p1:main').position).toBe(b);
  h.choose('skip');
  expect(h.fighter().position).toBe(b);
  expect(h.fighter('p1:main').position).toBe(a);
  expect(h.fighter().counters.steps).toBe(1);
  expect(h.fighter('p1:main').counters.steps).toBe(1);
  expect(h.fighter('p1:main').hp).toBe(14);
  expect(h.state.resolution.frames).toEqual({});
});

it('cancelling either half of an exchange preserves both positions and skips success effects', () => {
  const h = setup((defs) => {
    defs.cards.prepare.effects = [
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [
          {
            type: 'swap',
            target: 'chosen',
            onSuccess: [{ type: 'damage', target: 'chosen', amount: 1 }],
          },
        ],
      },
    ];
    defs.characters.ranger.abilities = [
      { ...ability('before-move', [{ type: 'cancel' }]), optional: true },
    ];
  });
  const a = h.fighter().position,
    b = h.fighter('p1:main').position;
  action(h);
  h.choose('p1');
  h.choose('use');
  expect(h.fighter().position).toBe(a);
  expect(h.fighter('p1:main').position).toBe(b);
  expect(h.fighter('p1:main').hp).toBe(15);
  expect(h.state.resolution.frames).toEqual({});
});

it('anchored placement permits the current adjacent space and retains subsequent effects with no legal destination', () => {
  const h = setup((defs) => {
    defs.cards.prepare.effects = [
      {
        type: 'choose-fighter',
        relation: 'friendly',
        effects: [
          {
            type: 'teleport',
            target: 'chosen',
            anchor: 'main',
            range: 'adjacent',
            optional: false,
          },
          { type: 'draw', count: 1 },
        ],
      },
    ];
  });
  h.fighter().position = 'n0';
  h.fighter('p0:ally-1').position = 'n5';
  action(h);
  h.choose('p0:ally-1');
  expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain('n5');
  expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain('$stay');
  h.choose('n5');
  expect(h.fighter('p0:ally-1').position).toBe('n5');
  expect(h.state.players[0].hand).toHaveLength(5);
});

it('revalidates an adjacent placement after a nested reaction relocates its anchor', () => {
  const h = setup((defs) => {
    defs.cards.prepare.effects = [
      {
        type: 'choose-fighter',
        relation: 'friendly',
        effects: [
          {
            type: 'teleport',
            target: 'chosen',
            anchor: 'main',
            range: 'adjacent',
            optional: false,
          },
        ],
      },
    ];
    defs.characters.vanguard.ally!.abilities = [
      {
        ...ability('before-move', [{ type: 'teleport', target: 'main', optional: false }]),
        optional: true,
      },
    ];
  });
  h.fighter().position = 'n0';
  h.fighter('p0:ally-1').position = 'n5';
  action(h);
  h.choose('p0:ally-1');
  h.choose('n1');
  h.choose('use');
  h.choose('n20');
  expect(h.fighter().position).toBe('n20');
  expect(h.fighter('p0:ally-1').position).toBe('n5');
  expect(h.state.resolution.frames).toEqual({});
});

it('continues after a mandatory anchored placement when every adjacent destination is occupied', () => {
  const h = setup((defs) => {
    defs.map.edges = [['n0', 'n1']];
    defs.cards.prepare.effects = [
      {
        type: 'choose-fighter',
        relation: 'friendly',
        effects: [
          {
            type: 'teleport',
            target: 'chosen',
            anchor: 'main',
            range: 'adjacent',
            optional: false,
          },
          { type: 'draw', count: 1 },
        ],
      },
    ];
  });
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.fighter('p0:ally-1').position = 'n5';
  action(h);
  h.choose('p0:ally-1');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.fighter('p0:ally-1').position).toBe('n5');
  expect(h.state.players[0].hand).toHaveLength(5);
});
