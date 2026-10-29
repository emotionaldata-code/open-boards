import { expect, it } from 'vitest';
import type { Ability, Definitions, Effect } from '../index';
import { validateDefinitions } from '../index';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { condition, value } from './conditions';
import { projectGame } from '../../../../apps/server/src/transport/projection';

function ability(trigger: Ability['trigger'], effects: Effect[]): Ability {
  return { id: 'rule', name: 'Rule', description: 'Neutral rule', trigger, effects };
}
function setup(edit: (defs: Definitions) => void = () => {}) {
  const defs = structuredClone(basic);
  edit(defs);
  validateDefinitions(defs);
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}
it('records accepted action commands independently of the changing budget and resets at the next seat', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [{ type: 'actions', amount: 2 }];
  });
  expect(h.state.resolution.actionNumber ?? 0).toBe(0);
  const before = structuredClone(h.state);
  expect(h.run({ type: 'attack', fighter: 'p0:main', target: 'p1:main', card: 'forged' }).ok).toBe(
    false,
  );
  expect(h.state).toEqual(before);
  h.action('prepare');
  expect(h.state.actions).toBe(3);
  expect(h.state.resolution.actionNumber).toBe(1);
  h.apply({ type: 'maneuver' });
  h.apply({ type: 'finish-maneuver' });
  expect(h.state.resolution.actionNumber).toBe(2);
  h.attack('strike');
  h.defend('guard');
  expect(h.state.resolution.actionNumber).toBe(3);
  h.state.actions = 1;
  h.attack('strike');
  h.defend('guard');
  expect(h.state.turn).toBe(1);
  expect(h.state.resolution.actionNumber).toBe(0);
});
it('compares all starting-space zones, including junctions, and survives JSON recovery', () => {
  const h = setup();
  h.state.resolution.frames[99] = { kind: 'turn', actor: 'p0:main' };
  const b = { frame: 99, owner: 'p0:main' };
  h.state.resolution.turnPositions['p0:main'] = 'n0';
  expect(condition(h.state, h.defs, b, { type: 'left-starting-zone' })).toBe(false);
  h.fighter().position = 'n1';
  expect(condition(h.state, h.defs, b, { type: 'left-starting-zone' })).toBe(false);
  h.fighter().position = 'n20';
  h.reconnect();
  expect(condition(h.state, h.defs, b, { type: 'left-starting-zone' })).toBe(true);
  h.state.resolution.turnPositions['p0:main'] = null;
  expect(condition(h.state, h.defs, b, { type: 'left-starting-zone' })).toBe(false);
  expect(value(h.state, h.defs, b, { stat: 'action-number' })).toBe(0);
});
it('captures a first-combat printed value and applies it during the bonus combat rather than revealing it as base value', () => {
  const h = setup((d) => {
    d.cards.strike.abilities = [
      ability('after-combat', [
        {
          type: 'bonus-attack',
          name: 'Echo',
          value: 0,
          combatValue: { card: 'opposing', field: 'value' },
        },
      ]),
    ];
    d.cards.guard.abilities = [
      ability('before-combat', [{ type: 'modify', field: 'defense', amount: 7 }]),
    ];
    d.characters.vanguard.abilities = [
      ability('before-combat', [{ type: 'modify', field: 'attack', amount: 2 }]),
    ];
  });
  h.attack('strike');
  h.defend('guard');
  h.reconnect();
  expect(h.state.phase).toMatchObject({
    type: 'awaiting-defense',
    bonus: { value: 0, combatValue: 3 },
  });
  const binding = { frame: h.state.resolution.combat!, owner: 'p1:main' };
  expect(
    condition(h.state, h.defs, binding, {
      type: 'card-has-hook',
      card: 'opposing',
      hook: 'before-combat',
    }),
  ).toBe(true);
  expect(
    condition(h.state, h.defs, binding, {
      type: 'card-has-hook',
      card: 'opposing',
      hook: 'after-combat',
    }),
  ).toBe(false);
  h.defend(null);
  expect(h.state.revealed?.damage).toBe(5);
  expect(h.state.resolution.actionNumber).toBe(1);
});
it('allows the second defense to cancel only the retained bonus setter with ordinary suppression', () => {
  const h = setup((d) => {
    d.cards.strike.abilities = [
      ability('after-combat', [
        {
          type: 'bonus-attack',
          name: 'Echo',
          value: 0,
          combatValue: { card: 'opposing', field: 'value' },
        },
      ]),
    ];
    d.cards.adapt.abilities = [ability('combat-reveal', [{ type: 'suppress-card-effects' }])];
  });
  h.attack('strike');
  h.defend('guard');
  h.defend('adapt');
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.state.players[0].discard).toHaveLength(1);
  expect(h.state.players[1].discard).toHaveLength(2);
});
it.each(['accept', 'decline'])(
  'retains an exact inspected card and affected owner through nested JSON choices (%s)',
  (decision) => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        {
          type: 'choose-player',
          relation: 'opponent',
          effects: [
            {
              type: 'inspect-hand',
              target: 'chosen',
              effects: [
                {
                  type: 'choose-option',
                  prompt: 'Continue',
                  options: [
                    {
                      id: 'continue',
                      label: 'Continue',
                      effects: [
                        {
                          type: 'discard',
                          selected: true,
                          target: 'chosen',
                          count: 1,
                          onDecline: [
                            {
                              type: 'damage',
                              target: 'chosen',
                              amount: { card: 'selected', field: 'boost' },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];
    });
    h.state.players[1].hand = [
      { id: 'one', definition: 'guard' },
      { id: 'two', definition: 'guard' },
    ];
    h.action('prepare');
    h.choose('p1');
    const inspected = h.state.resolution.choice!;
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    expect(JSON.stringify(projectGame(h.state, null, false))).not.toContain('selectedCard');
    h.choose('two');
    h.choose('continue');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual(['two', '$decline']);
    expect(projectGame(h.state, 'p0', false).choice).toBeNull();
    const saved = structuredClone(h.state);
    expect(
      h.run({ type: 'choose', choice: h.state.resolution.choice!.id, options: ['one'] }, 'p1').ok,
    ).toBe(false);
    expect(h.state).toEqual(saved);
    h.choose(decision === 'accept' ? 'two' : '$decline');
    expect(h.state.players[1].hand.some((c) => c.id === 'one')).toBe(true);
    expect(h.fighter('p1:main').hp).toBe(decision === 'accept' ? 15 : 13);
    expect(h.state.players[1].discard.some((c) => c.id === 'two')).toBe(decision === 'accept');
    expect(inspected.options.map((o) => o.id)).toEqual(['one', 'two']);
  },
);
it('does not offer an unrelated substitute when the exact selected instance has left the hand', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [
          {
            type: 'inspect-hand',
            target: 'chosen',
            effects: [
              {
                type: 'discard',
                selected: true,
                target: 'chosen',
                count: 1,
                onDecline: [
                  {
                    type: 'damage',
                    target: 'chosen',
                    amount: { card: 'selected', field: 'boost' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  });
  h.state.players[1].hand = [
    { id: 'one', definition: 'guard' },
    { id: 'two', definition: 'guard' },
  ];
  h.action('prepare');
  h.choose('p1');
  h.state.players[1].hand.splice(0, 1);
  h.choose('one');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.players[1].hand.map((c) => c.id)).toEqual(['two']);
  expect(h.fighter('p1:main').hp).toBe(13);
});
