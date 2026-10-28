import { expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { canAttackWithCard, movement, validateDefinitions, type Definitions } from '../index';
import { projectGame } from '../../../../apps/server/src/transport/projection';

function setup(edit: (defs: Definitions) => void = () => {}) {
  const defs = structuredClone(basic);
  defs.characters.vanguard.ally = {
    id: 'helper',
    name: 'Helper',
    count: 2,
    hp: 2,
    attackType: 'melee',
  };
  defs.characters.vanguard.conditionalModifiers = [
    {
      name: 'Last stand',
      description: 'Stronger when all allies are defeated.',
      when: { type: 'allies-defeated' },
      attack: 2,
      defense: 2,
      movement: 1,
    },
  ];
  edit(defs);
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.fighter('p0:ally-1').position = 'n9';
  h.fighter('p0:ally-2').position = 'n10';
  return h;
}
it('continuous bonuses require actual defeated allies, including off-board living allies', () => {
  const h = setup();
  h.fighter('p0:ally-1').defeated = true;
  h.fighter('p0:ally-2').position = null;
  expect(movement(h.fighter(), h.defs, h.state)).toBe(2);
  h.fighter('p0:ally-2').defeated = true;
  expect(movement(h.fighter(), h.defs, h.state)).toBe(3);
  const solo = deckHarness(structuredClone(basic), ['vanguard', 'ranger']);
  solo.defs.characters.vanguard.conditionalModifiers =
    h.defs.characters.vanguard.conditionalModifiers;
  expect(movement(solo.fighter(), solo.defs, solo.state)).toBe(2);
});
it('defeat bypasses damage prevention and resumes the continuation after death reactions', () => {
  const h = setup((d) => {
    d.characters.vanguard.ally!.abilities = [
      {
        id: 'receipt',
        name: 'Receipt',
        description: 'Record death',
        trigger: 'eliminated',
        effects: [{ type: 'draw', count: 1 }],
      },
    ];
    d.cards.prepare.effects = [
      { type: 'defeat', target: 'chosen', onDefeat: [{ type: 'draw', count: 1 }] },
    ];
    d.cards.prepare.effects = [
      {
        type: 'choose-fighter',
        relation: 'friendly',
        role: 'ally',
        effects: d.cards.prepare.effects,
      },
    ];
  });
  const size = h.state.players[0].hand.length;
  h.action('prepare');
  h.choose('p0:ally-1');
  expect(h.fighter('p0:ally-1')).toMatchObject({ defeated: true, hp: 0 });
  expect(h.state.players[0].hand).toHaveLength(size + 1);
  expect(h.fighter('p0:ally-2').hp).toBe(2);
});
it('revival to any empty space survives JSON reconnect and rejects an occupied space atomically', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [{ type: 'revive-ally', zone: 'any' }];
  });
  h.fighter('p0:ally-1').defeated = true;
  h.action('prepare');
  h.choose('p0:ally-1');
  h.reconnect();
  const c = h.state.resolution.choice!,
    before = structuredClone(h.state);
  expect(h.run({ type: 'choose', choice: c.id, options: ['n1'] }).ok).toBe(false);
  expect(h.state).toEqual(before);
  h.choose('n20');
  expect(h.fighter('p0:ally-1')).toMatchObject({ hp: 2, defeated: false, position: 'n20' });
});
it('a protected card recognizes the opposing printed hook even when the hook condition is false', () => {
  const h = setup((d) => {
    d.cards.strike.effectsCannotBeCancelled = true;
    d.cards.strike.abilities = [
      {
        id: 'ignore',
        name: 'Ignore',
        description: 'Ignore immediate cards',
        trigger: 'before-combat',
        when: { type: 'card-has-hook', card: 'opposing', hook: 'combat-reveal' },
        effects: [{ type: 'ignore-combat-value', target: 'opponent' }],
      },
    ];
    d.cards.guard.abilities = [
      {
        id: 'false-hook',
        name: 'False hook',
        description: 'Printed but not active',
        trigger: 'combat-reveal',
        when: { type: 'compare', left: 0, op: 'eq', right: 1 },
        effects: [{ type: 'suppress-card-effects' }],
      },
    ];
  });
  h.attack('strike');
  h.defend('guard');
  expect(h.state.revealed?.damage).toBe(4);
});
it('alternate attack commands reject forged face-up, tags, friendly targets and off-board pieces', () => {
  const h = setup((d) => {
    d.cards.guard.attackMode = { when: { type: 'allies-defeated' }, faceUp: true, range: 'any' };
  });
  const card = h.defs.cards.guard;
  h.fighter('p1:main').position = 'n20';
  expect(canAttackWithCard(h.state, h.fighter(), h.fighter('p1:main'), card, h.defs, true)).toBe(
    false,
  );
  h.fighter('p0:ally-1').defeated = true;
  h.fighter('p0:ally-2').defeated = true;
  expect(canAttackWithCard(h.state, h.fighter(), h.fighter('p1:main'), card, h.defs, true)).toBe(
    true,
  );
  expect(canAttackWithCard(h.state, h.fighter(), h.fighter(), card, h.defs, true)).toBe(false);
  h.state.players[0].hand[0].definition = 'strike';
  const before = structuredClone(h.state);
  expect(
    h.run({
      type: 'attack',
      fighter: 'p0:main',
      target: 'p1:main',
      card: before.players[0].hand[0].id,
      faceUp: true,
    }).ok,
  ).toBe(false);
  expect(h.state).toEqual(before);
  h.attack('guard', undefined, undefined, true);
  h.reconnect();
  expect(projectGame(h.state, 'p1', false).phase).toHaveProperty(
    'committedCard.definition',
    'guard',
  );
});
it('random hand-to-deck transfer consumes a seeded choice without a discard or draw event', () => {
  const edit = (d: Definitions) => {
    d.cards.prepare.effects = [
      {
        type: 'choose-fighter',
        relation: 'enemy',
        effects: [{ type: 'return-to-deck', target: 'chosen', random: true, count: 1 }],
      },
    ];
  };
  const a = setup(edit),
    b = setup(edit);
  a.action('prepare');
  b.action('prepare');
  a.reconnect();
  const outcomes = a.choose('p1:main');
  b.choose('p1:main');
  expect(a.state).toEqual(b.state);
  expect(a.state.players[1].hand).toHaveLength(4);
  expect(a.state.players[1].discard).toEqual([]);
  expect(outcomes.some((o) => o.type === 'draw')).toBe(false);
  expect(JSON.stringify(projectGame(a.state, 'p0', false))).not.toContain(
    a.state.players[1].deck[0].id,
  );
});
it('strict validation rejects malformed modifiers, attack modes and sacrifice continuations', () => {
  const h = setup();
  validateDefinitions(h.defs);
  for (const bad of [
    { attackMode: { when: { type: 'allies-defeated' }, range: 'zone' } },
    { effectsCannotBeCancelled: 'yes' },
  ]) {
    const d = structuredClone(h.defs);
    Object.assign(d.cards.strike, bad);
    expect(() => validateDefinitions(d)).toThrow();
  }
});

it.each(['card', 'total', 'ignored'] as const)(
  'continuous character bonuses respect %s value locks',
  (mode) => {
    const h = setup((d) => {
      d.cards.guard.abilities = [
        {
          id: 'lock',
          name: 'Lock',
          description: 'Lock attack value',
          trigger: mode === 'total' ? 'before-combat' : 'combat-reveal',
          effects:
            mode === 'card'
              ? [{ type: 'lock-card-value', target: 'opponent', value: 1 }]
              : mode === 'total'
                ? [{ type: 'set-combat-value', target: 'opponent', value: 1 }]
                : [{ type: 'ignore-combat-value', target: 'opponent' }],
        },
      ];
      if (mode === 'total') d.statuses!['fixed-four'].combatValue = { value: 1, locked: true };
    });
    for (const f of h.state.fighters.filter((f) => f.role === 'ally')) f.defeated = true;
    if (mode === 'total') h.fighter().statuses = [{ id: 'fixed-four', stacks: 1 }];
    h.defs.cards.guard.value = 0;
    h.attack('strike');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(mode === 'card' ? 3 : mode === 'total' ? 1 : 0);
  },
);
