import { expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { boostValue, fighterDefinition, validateDefinitions, type Ability } from '../index';
import { projectGame } from '../../../../apps/server/src/transport/projection';

const immediate: Ability = {
  id: 'energy',
  name: 'Energy',
  description: 'May BOOST after reveal.',
  trigger: 'combat-reveal',
  when: { type: 'role', role: 'attacker' },
  effects: [{ type: 'boost-attack' }],
};
function setup(edit: (defs: typeof basic) => void = () => {}, roster = ['vanguard', 'ranger']) {
  const defs = structuredClone(basic);
  edit(defs);
  const h = deckHarness(defs, roster);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}
it('selects a hero identity before hands, retaining role health, attack type, counters and exact named eligibility', () => {
  const h = setup((d) => {
    d.characters.vanguard.heroSelection = {
      name: 'Choose a hero',
      description: 'Either fighter leads.',
      mainName: 'Captain',
    };
    d.characters.vanguard.ally = {
      id: 'scholar',
      name: 'Scholar',
      count: 1,
      hp: 4,
      attackType: 'ranged',
      counters: { focus: { initial: 2, max: 3 } },
    };
  });
  // The general setup helper chooses the first option. Rebuild a second-seat choice explicitly.
  expect(fighterDefinition(h.fighter(), h.defs).name).toBe('Captain');
  expect(h.fighter('p0:ally-1').counters).toEqual({ focus: 2 });
  expect(() =>
    validateDefinitions({
      ...h.defs,
      characters: {
        ...h.defs.characters,
        vanguard: {
          ...h.defs.characters.vanguard,
          ally: { ...h.defs.characters.vanguard.ally!, count: 2 },
        },
      },
    }),
  ).toThrow('one sidekick');
});
it('accepts reveal-time BOOSTs and records the effective amount once, across JSON recovery and ongoing removal', () => {
  const h = setup((d) => {
    d.characters.vanguard.abilities = [immediate];
    d.cards.prepare.ongoing = { boostBonus: 2 };
  });
  h.state.players[0].ongoing = [{ id: 'active', definition: 'prepare' }];
  h.attack('strike');
  h.defend();
  const choice = h.state.resolution.choice!;
  expect(choice.prompt).toBe('Boost attack');
  h.reconnect();
  const amount = boostValue(h.state.players[0], h.state.players[0].hand[0], h.defs);
  h.choose();
  expect(h.state.revealed?.boosts[0].amount).toBe(amount);
  expect(h.state.revealed?.damage).toBe(4 + amount);
});
it('uses effective BOOST references on another owner’s card while the printed rule stays immutable', () => {
  const h = setup((d) => {
    d.cards.prepare.ongoing = { boostBonus: 3 };
    d.cards.guard.abilities = [
      {
        id: 'mirror',
        name: 'Mirror',
        description: 'Gain opposing BOOST.',
        trigger: 'before-combat',
        effects: [
          { type: 'modify', field: 'defense', amount: { card: 'opposing', field: 'boost' } },
        ],
      },
    ];
  });
  h.state.players[0].ongoing = [{ id: 'active', definition: 'prepare' }];
  h.attack('strike');
  h.defend('guard');
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.defs.cards.strike.boost).toBe(1);
});
it('applies ongoing BOOST to Maneuver and retains the scheme after an attack in the owner turn', () => {
  const h = setup((d) => {
    d.cards.prepare.ongoing = { boostBonus: 2, discardUnlessAttacked: true };
  });
  h.state.players[0].ongoing = [{ id: 'active', definition: 'prepare' }];
  h.attack('strike');
  h.defend();
  h.apply({ type: 'maneuver' });
  const card = h.state.players[0].hand[0];
  const amount = boostValue(h.state.players[0], card, h.defs);
  h.apply({ type: 'boost-maneuver', card: card.id });
  expect(h.state.maneuver?.boost).toBe(amount);
  h.apply({ type: 'finish-maneuver' });
  expect(h.state.players[0].ongoing).toHaveLength(1);
});
it.each([2, 4])('seals all %s participants’ commitments before revealing or drawing', (seats) => {
  const h = setup((d) => {
    d.cards.prepare.effects = [{ type: 'reveal-boost-draw' }];
  }, Array<string>(seats).fill('vanguard'));
  const decks = h.state.players.map((p) => p.deck.length);
  h.action('prepare');
  for (let i = 0; i < seats; i++) {
    h.reconnect();
    const c = h.state.resolution.choice!;
    expect(c.player).toBe(`p${i}`);
    const before = structuredClone(h.state);
    expect(h.run({ type: 'choose', choice: c.id, options: ['forged'] }, c.player).ok).toBe(false);
    expect(h.state).toEqual(before);
    for (let j = 0; j < seats; j++)
      if (i !== j) expect(projectGame(h.state, `p${j}`, false).choice).toBeNull();
    const outcomes = h.choose();
    expect(outcomes.filter((o) => o.type === 'hand-revealed')).toHaveLength(
      i === seats - 1 ? seats : 0,
    );
    if (i < seats - 1) expect(h.state.players.map((p) => p.deck.length)).toEqual(decks);
  }
  expect(h.state.resolution.frames).toEqual({});
});
it('compares actual draw receipts after draw prevention, with ties damaging every winner', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [{ type: 'reveal-boost-draw' }];
    d.characters.ranger.abilities = [
      {
        id: 'prevent',
        name: 'Prevent',
        description: 'No draws.',
        trigger: 'before-draw',
        effects: [{ type: 'cancel' }],
      },
    ];
  });
  h.action('prepare');
  h.choose();
  h.choose();
  expect(h.fighter().hp).toBe(14);
  expect(h.fighter('p1:main').hp).toBe(15);
});
it('a full optional payment rejects partial selections and runs its continuation once', () => {
  const h = setup((d) => {
    d.cards.strike.abilities = [
      {
        id: 'offer',
        name: 'Offer',
        description: 'Pay two to ignore attack.',
        trigger: 'before-combat',
        effects: [
          {
            type: 'discard',
            target: 'opponent',
            count: 2,
            optional: true,
            onComplete: [{ type: 'ignore-combat-value' }],
          },
        ],
      },
    ];
  });
  h.attack('strike');
  h.defend();
  h.choose('pay');
  const c = h.state.resolution.choice!;
  expect(h.run({ type: 'choose', choice: c.id, options: [c.options[0].id] }, 'p1').ok).toBe(false);
  h.apply({ type: 'choose', choice: c.id, options: c.options.slice(0, 2).map((o) => o.id) }, 'p1');
  expect(h.state.revealed?.damage).toBe(0);
});
it('executes an after-action passive after suspended scheme choices and before turn settlement', () => {
  const h = setup((d) => {
    d.characters.vanguard.abilities = [
      {
        id: 'after',
        name: 'After',
        description: 'Recover after schemes.',
        trigger: 'after-action',
        effects: [{ type: 'heal', amount: 2 }],
      },
    ];
    d.cards.prepare.effects = [
      {
        type: 'choose-option',
        prompt: 'Scheme',
        options: [{ id: 'resolve', label: 'Resolve', effects: [{ type: 'damage', amount: 1 }] }],
      },
    ];
  });
  h.fighter().hp = 10;
  h.state.actions = 1;
  h.action('prepare');
  expect(h.fighter().hp).toBe(10);
  h.choose();
  expect(h.fighter().hp).toBe(11);
  expect(h.state.turn).toBe(1);
});

it('does not complete a payment when a discard reaction removes the other selected card', () => {
  const h = setup((d) => {
    d.cards.strike.abilities = [
      {
        id: 'offer',
        name: 'Offer',
        description: 'Pay two.',
        trigger: 'before-combat',
        effects: [
          {
            type: 'discard',
            target: 'opponent',
            count: 2,
            optional: true,
            onComplete: [{ type: 'ignore-combat-value' }],
          },
        ],
      },
    ];
    d.characters.ranger.abilities = [
      {
        id: 'reaction',
        name: 'Reaction',
        description: 'Discard another.',
        trigger: 'card-discarded',
        limit: { scope: 'turn', count: 1 },
        effects: [{ type: 'discard', count: 1, random: true }],
      },
    ];
  });
  h.state.players[1].hand = h.state.players[1].hand.slice(0, 2);
  h.attack('strike');
  h.defend();
  h.choose('pay');
  const c = h.state.resolution.choice!;
  h.reconnect();
  h.apply({ type: 'choose', choice: c.id, options: c.options.map((o) => o.id) }, 'p1');
  expect(h.state.revealed?.damage).toBe(4);
  expect(h.state.resolution.discardPayments).toEqual({});
});

it('drops queued immediate ordering when a combat participant forfeits during an earlier choice', async () => {
  const h = setup(
    (d) => {
      d.characters.vanguard.abilities = [{ ...immediate, orderWithCard: true }];
      d.cards.strike.abilities = [
        {
          id: 'old',
          name: 'Old',
          description: 'Immediate damage.',
          trigger: 'combat-reveal',
          effects: [{ type: 'damage', target: 'opponent', amount: 1 }],
        },
      ];
      d.cards.guard.abilities = [
        {
          id: 'pause',
          name: 'Pause',
          description: 'Immediate choice.',
          trigger: 'combat-reveal',
          effects: [
            {
              type: 'choose-option',
              prompt: 'Pause',
              options: [{ id: 'continue', label: 'Continue', effects: [] }],
            },
          ],
        },
      ];
    },
    ['vanguard', 'ranger', 'vanguard', 'ranger'],
  );
  h.attack('strike');
  h.defend('guard');
  expect(h.state.resolution.choice?.player).toBe('p1');
  const { forfeit } = await import('../index');
  const result = forfeit(h.state, 'p1', h.defs);
  expect(result.state.resolution.combat).toBeNull();
  expect(result.state.resolution.choice).toBeNull();
});

it('excludes replaced card effects from queued immediate ordering while retaining the attacker passive', () => {
  const h = setup((d) => {
    d.characters.vanguard.abilities = [{ ...immediate, orderWithCard: true }];
    d.cards.strike.abilities = [
      {
        id: 'old',
        name: 'Old',
        description: 'Immediate damage.',
        trigger: 'combat-reveal',
        effects: [{ type: 'damage', target: 'opponent', amount: 1 }],
      },
    ];
    d.cards.guard.abilities = [
      {
        id: 'replace',
        name: 'Replace',
        description: 'Replace the attack.',
        trigger: 'combat-reveal',
        effects: [{ type: 'replace-attack' }],
      },
    ];
  });
  h.state.players[0].hand[1].definition = 'adapt';
  const replacement = h.state.players[0].hand[1].id;
  h.attack('strike');
  h.defend('guard');
  h.choose();
  h.choose(replacement);
  expect(h.state.resolution.choice?.prompt).toBe('Boost attack');
  h.choose('$skip');
  expect(h.fighter('p1:main').hp).toBe(15);
  expect(h.state.revealed?.attack.definition).toBe('adapt');
});

it('suppresses a queued immediate card inside an ordering task without suppressing its fighter passive', () => {
  const h = setup((d) => {
    d.characters.vanguard.abilities = [{ ...immediate, orderWithCard: true }];
    d.cards.strike.abilities = [
      {
        id: 'immediate',
        name: 'Immediate',
        description: 'Damage.',
        trigger: 'combat-reveal',
        effects: [{ type: 'damage', target: 'opponent', amount: 1 }],
      },
    ];
    d.cards.guard.abilities = [
      {
        id: 'cancel',
        name: 'Cancel',
        description: 'Cancel opposing card.',
        trigger: 'combat-reveal',
        effects: [{ type: 'suppress-card-effects' }],
      },
    ];
  });
  h.attack('strike');
  h.defend('guard');
  expect(h.state.resolution.choice?.prompt).toBe('Boost attack');
  h.choose('$skip');
  expect(h.fighter('p1:main').hp).toBe(14);
});
