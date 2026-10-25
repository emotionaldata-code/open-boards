import { expect, it } from 'vitest';
import {
  createGame,
  deploymentSpaces,
  execute,
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

it('runs both combat frames with fresh defense, replacement printed values and no repeated source hooks or discards', () => {
  const h = setup((defs) => {
    defs.cards.strike.value = 1;
    defs.cards.strike.category = 'versatile';
    defs.cards.guard.abilities = [
      {
        ...ability('before-combat', [{ type: 'modify', field: 'defense', amount: 10 }]),
        when: { type: 'card-category', card: 'attack', category: 'versatile' },
      },
    ];
    defs.cards.strike.abilities = [
      ability('after-combat', [{ type: 'bonus-attack', name: 'Follow up', value: 3 }]),
      ability('card-discarded', [{ type: 'draw', count: 1 }]),
    ];
    // Ability IDs remain unique per definition.
    defs.cards.strike.abilities[1].id = 'discard';
    defs.characters.vanguard.abilities = [
      ability('before-combat', [{ type: 'modify', field: 'attack', amount: 2 }]),
    ];
  });
  h.attack();
  h.defend();
  expect(h.state.players[0].hand).toHaveLength(5);
  expect(h.state.revealed?.damage).toBe(3);
  expect(h.state.phase).toMatchObject({
    type: 'awaiting-defense',
    bonus: { name: 'Follow up', value: 3 },
  });
  expect(h.state.players[0].discard).toHaveLength(1);
  h.defend('guard');
  expect(h.state.revealed).toMatchObject({ damage: 2, bonus: { name: 'Follow up', value: 3 } });
  expect(h.state.players[0].hand).toHaveLength(5);
  expect(h.state.players[0].discard).toHaveLength(1);
  expect(h.state.players[1].discard).toHaveLength(1);
  expect(h.state.actions).toBe(1);
  expect(h.state.resolution.frames).toEqual({});
});

it('returns only prior discarded instances and rejects forged recovery without mutation across serialization', () => {
  const h = setup((defs) => {
    defs.cards.strike.abilities = [ability('after-combat', [{ type: 'recover-card' }])];
  });
  const card = { id: 'old', definition: 'prepare' };
  h.state.players[0].discard.push(card);
  h.attack();
  h.defend('guard');
  const saved = structuredClone(h.state);
  const c = h.state.resolution.choice!;
  for (const [actor, options] of [
    ['p1', [card.id]],
    ['p0', ['forged']],
    ['p0', [card.id, card.id]],
  ] as const) {
    expect(h.run({ type: 'choose', choice: c.id, options: [...options] }, actor).ok).toBe(false);
    expect(h.state).toEqual(saved);
  }
  expect(c.options.map((o) => o.id)).toEqual([card.id]);
  const outcomes = h.choose(card.id);
  expect(h.state.players[0].hand).toContainEqual(card);
  expect(h.state.players[0].discard.map((c) => c.id)).not.toContain(card.id);
  expect(outcomes.filter((o) => o.type === 'draw')).toMatchObject([
    { audience: 'p0', cards: [card] },
  ]);
});

it('random discard chooses unique instances from the seeded stream and runs each discard reaction once', () => {
  const h = setup((defs) => {
    defs.cards.strike.abilities = [
      ability('after-combat', [{ type: 'discard', random: true, count: 2 }]),
    ];
    defs.characters.vanguard.counters = { receipts: { initial: 0, max: 10 } };
    defs.characters.vanguard.abilities = [
      ability('card-discarded', [{ type: 'counter', name: 'receipts', amount: 1 }]),
    ];
  });
  h.attack();
  const saved = structuredClone(h.state);
  const outcomes = h.defend();
  expect(h.state.players[0].hand).toHaveLength(2);
  expect(new Set(h.state.players[0].discard.map((c) => c.id)).size).toBe(3);
  expect(h.fighter().counters.receipts).toBe(3);
  expect(outcomes.filter((o) => o.type === 'played')).toHaveLength(2);
  const replay = execute(
    saved,
    'p1',
    { id: 'replay', revision: saved.revision, command: { type: 'defend', card: null } },
    h.defs,
  );
  expect(replay.ok && replay.state.players[0].discard).toEqual(h.state.players[0].discard);
});

it('replacement defense binds new fighter modifiers and passives while retaining the exact committed card', () => {
  const h = setup((defs) => {
    defs.cards.guard.abilities = [
      {
        ...ability('combat-reveal', [
          {
            type: 'swap',
            target: 'ally',
            onSuccess: [{ type: 'replace-defender', target: 'ally' }],
          },
        ]),
        optional: true,
      },
    ];
    defs.characters.vanguard.ally!.abilities = [
      ability('after-defense', [{ type: 'heal', amount: 1 }]),
    ];
    defs.statuses!.armor = { id: 'armor', name: 'Armor', maxStacks: 1, modifiers: { defense: 1 } };
  });
  h.fighter('p0:ally-1').hp = 4;
  h.fighter('p0:ally-1').statuses.push({ id: 'armor', stacks: 1 });
  h.state.turn = 1;
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.apply(
    { type: 'attack', fighter: 'p1:main', target: 'p0:main', card: h.state.players[1].hand[0].id },
    'p1',
  );
  h.state.players[0].hand[0].definition = 'guard';
  h.apply({ type: 'defend', card: h.state.players[0].hand[0].id });
  h.choose('use');
  expect(h.state.revealed).toMatchObject({ defender: 'p0:ally-1', damage: 0 });
  expect(h.fighter().hp).toBe(15);
  expect(h.fighter('p0:ally-1').hp).toBe(5);
  expect(h.fighter().position).toBe('n5');
  expect(h.fighter('p0:ally-1').position).toBe('n0');
});

it('a cancelled swap keeps the original defender and its commitment', () => {
  const h = setup((defs) => {
    defs.cards.guard.abilities = [
      ability('combat-reveal', [
        { type: 'swap', target: 'ally', onSuccess: [{ type: 'replace-defender', target: 'ally' }] },
      ]),
    ];
    defs.characters.vanguard.ally!.abilities = [ability('before-move', [{ type: 'cancel' }])];
  });
  h.state.turn = 1;
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.apply(
    { type: 'attack', fighter: 'p1:main', target: 'p0:main', card: h.state.players[1].hand[0].id },
    'p1',
  );
  h.state.players[0].hand[0].definition = 'guard';
  h.apply({ type: 'defend', card: h.state.players[0].hand[0].id });
  expect(h.state.revealed).toMatchObject({ defender: 'p0:main', damage: 1 });
  expect(h.fighter().position).toBe('n0');
  expect(h.fighter('p0:ally-1').position).toBe('n5');
});
