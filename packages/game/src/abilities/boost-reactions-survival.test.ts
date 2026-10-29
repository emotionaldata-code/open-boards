import { expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import type { Definitions } from '../types';

function setup(edit: (d: Definitions) => void) {
  const d = structuredClone(basic);
  edit(d);
  const h = deckHarness(d, ['vanguard', 'vanguard']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}
it('pays every selected BOOST before any payment effect inspects the remaining hand', () => {
  const h = setup((d) => {
    d.cards.strike.abilities = [
      {
        id: 'double',
        name: 'Double',
        description: 'Double',
        trigger: 'before-combat',
        effects: [{ type: 'boost-combat', count: 2, grant: 'double' }],
      },
    ];
    d.cards.guard.boostEffects = [{ type: 'inspect-hand' }];
  });
  h.state.players[0].hand[1].definition = 'guard';
  h.state.players[0].hand[2].definition = 'guard';
  h.attack('strike');
  h.defend();
  h.choose('boost');
  const c = h.state.resolution.choice!,
    selected = c.options.slice(0, 2).map((o) => o.id);
  h.apply({ type: 'choose', choice: c.id, options: selected });
  expect(h.state.resolution.choice!.options.some((o) => selected.includes(o.id))).toBe(false);
  expect(selected.every((id) => h.state.players[0].discard.some((c) => c.id === id))).toBe(true);
});
it('inspection cancellation skips the entire current step but preserves subsequent combat timings', () => {
  const h = setup((d) => {
    d.cards.prepare.handInspectionProtection = true;
    d.cards.strike.abilities = [
      {
        id: 'look',
        name: 'Look',
        description: 'Look',
        trigger: 'combat-reveal',
        effects: [
          { type: 'inspect-hand', target: 'opponent' },
          { type: 'damage', target: 'opponent', amount: 4 },
        ],
      },
      {
        id: 'later',
        name: 'Later',
        description: 'Later',
        trigger: 'after-combat',
        effects: [{ type: 'draw', count: 1 }],
      },
    ];
  });
  h.state.players[1].hand[1].definition = 'prepare';
  h.attack('strike');
  h.defend('guard');
  const secret = h.state.resolution.choice!.options.find((o) => o.card?.definition === 'prepare')!;
  const deck = h.state.players[0].deck.length;
  h.choose(secret.id);
  expect(h.fighter('p1:main').hp).toBe(14); // ordinary combat damage only
  expect(h.state.players[0].deck).toHaveLength(deck - 1);
});
it('does not cancel protected inspection cards or expose a protection choice', () => {
  const h = setup((d) => {
    d.cards.prepare.handInspectionProtection = true;
    d.cards.strike.effectsCannotBeCancelled = true;
    d.cards.strike.abilities = [
      {
        id: 'look',
        name: 'Look',
        description: 'Look',
        trigger: 'combat-reveal',
        effects: [{ type: 'inspect-hand', target: 'opponent' }],
      },
    ];
  });
  h.state.players[1].hand[1].definition = 'prepare';
  h.attack('strike');
  h.defend('guard');
  expect(h.state.resolution.choice!.player).toBe('p0');
  expect(h.state.resolution.choice!.prompt).toContain('hand');
});
it('finishes a deferred lethal defeat when no restoration occurred', () => {
  const h = setup((d) => {
    d.cards.guard.combatSurvival = true;
    d.cards.strike.value = 20;
  });
  h.attack('strike');
  h.defend('guard');
  expect(h.fighter('p1:main').defeated).toBe(true);
  expect(h.state.players[1].eliminated).toBe(true);
});
it('restoration ends exact opponent references, while any-fighter selection can still find the restored fighter', () => {
  const h = setup((d) => {
    d.cards.strike.value = 20;
    d.cards.strike.abilities = [
      {
        id: 'exact',
        name: 'Exact',
        description: 'Exact',
        trigger: 'after-combat',
        effects: [
          { type: 'damage', target: 'opponent', amount: 2 },
          {
            type: 'choose-fighter',
            relation: 'enemy',
            effects: [{ type: 'damage', target: 'chosen', amount: 1 }],
          },
        ],
      },
    ];
    d.cards.guard.combatSurvival = true;
    d.cards.guard.abilities = [
      {
        id: 'return',
        name: 'Return',
        description: 'Return',
        trigger: 'after-combat',
        when: { type: 'combat-lethal' },
        effects: [{ type: 'set-health', value: 4 }],
      },
    ];
  });
  h.attack('strike');
  h.defend('guard');
  expect(h.fighter('p1:main').hp).toBe(4);
  h.choose('p1:main');
  expect(h.fighter('p1:main').hp).toBe(3);
});
it('survives ability damage and direct defeat during revealed combat', () => {
  for (const effect of [
    { type: 'damage', target: 'opponent', amount: 20 },
    { type: 'defeat', target: 'opponent' },
  ] as const) {
    const h = setup((d) => {
      d.cards.strike.abilities = [
        {
          id: 'lethal',
          name: 'Lethal',
          description: 'Lethal',
          trigger: 'combat-reveal',
          effects: [effect],
        },
      ];
      d.cards.guard.combatSurvival = true;
      d.cards.guard.abilities = [
        {
          id: 'restore',
          name: 'Restore',
          description: 'Restore',
          trigger: 'after-combat',
          when: { type: 'combat-lethal' },
          effects: [{ type: 'set-health', value: 4 }],
        },
      ];
    });
    h.attack('strike');
    h.defend('guard');
    expect(h.fighter('p1:main')).toMatchObject({ hp: 4, defeated: false });
    expect(h.state.players[1].eliminated).toBe(false);
  }
});
it('retains opponent owner operations after survival while removing exact physical opponent targeting', () => {
  const h = setup((d) => {
    d.cards.strike.value = 20;
    d.cards.strike.abilities = [
      {
        id: 'owner',
        name: 'Owner',
        description: 'Owner',
        trigger: 'after-combat',
        effects: [
          { type: 'damage', target: 'opponent', amount: 2 },
          { type: 'draw', target: 'opponent', count: 1 },
          { type: 'discard', target: 'opponent', count: 1 },
        ],
      },
    ];
    d.cards.guard.combatSurvival = true;
    d.cards.guard.abilities = [
      {
        id: 'restore',
        name: 'Restore',
        description: 'Restore',
        trigger: 'after-combat',
        when: { type: 'combat-lethal' },
        effects: [{ type: 'set-health', value: 4 }],
      },
    ];
  });
  const deck = h.state.players[1].deck.length;
  h.attack('strike');
  h.defend('guard');
  expect(h.fighter('p1:main').hp).toBe(4);
  expect(h.state.players[1].deck).toHaveLength(deck - 1);
  expect(h.state.resolution.choice!.player).toBe('p1');
  h.choose();
  expect(h.state.players[1].hand).toHaveLength(4);
});
