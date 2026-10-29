import { expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { validateDefinitions, type Effect } from '../index';

function setup(effect: Effect, reserve = true) {
  const defs = structuredClone(basic);
  defs.characters.vanguard.ally = {
    id: 'sentinel',
    name: 'Sentinel',
    count: 3,
    hp: 1,
    attackType: 'melee',
    startsOffBoard: reserve,
  };
  defs.cards.prepare.effects = [effect];
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}
it('reserves do not require deployment spaces or observe elimination events at setup', () => {
  const h = setup({ type: 'summon-ally', placement: 'adjacent' });
  expect(h.state.phase.type).toBe('taking-actions');
  expect(
    h.state.fighters
      .filter((f) => f.role === 'ally')
      .every((f) => f.defeated && f.position === null),
  ).toBe(true);
});
it('reserve summoning offers only physically adjacent empty spaces, not portal links', () => {
  const h = setup({ type: 'summon-ally', placement: 'adjacent', damage: 1 });
  h.action('prepare');
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['n5', 'n9', 'n10']);
  expect(h.fighter().hp).toBe(15);
  h.choose();
  expect(h.fighter().hp).toBe(14);
  h.choose('p0:ally-1');
  expect(h.fighter('p0:ally-1').position).toBe('n5');
});
it('a lethal summon cost cannot leave an orphaned ally on the board', () => {
  const h = setup({ type: 'summon-ally', placement: 'adjacent', damage: 1 });
  h.fighter().hp = 1;
  h.action('prepare');
  h.choose();
  expect(h.fighter().defeated).toBe(true);
  expect(h.state.fighters.filter((f) => f.player === 'p0').every((f) => f.defeated)).toBe(true);
});
it('no legal destination means no cost, no summon and no pending choice', () => {
  const h = setup({ type: 'summon-ally', placement: 'adjacent', damage: 1 });
  h.defs.map.edges = [
    ['n0', 'n1'],
    ['n1', 'n2'],
  ];
  h.action('prepare');
  expect(h.fighter().hp).toBe(15);
  expect(h.state.resolution.choice).toBeNull();
});
it('a movement lock prevents replace-self summoning and leaves reserves untouched', () => {
  const h = setup({ type: 'summon-ally', placement: 'replace-self' });
  h.state.resolution.movementLocks = ['p0:main'];
  h.action('prepare');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.fighter().position).toBe('n0');
});
it('summoning uses a reserve before offering existing living allies', () => {
  const h = setup({ type: 'summon-ally', placement: 'replace-self' });
  h.fighter('p0:ally-1').defeated = false;
  h.fighter('p0:ally-1').hp = 1;
  h.fighter('p0:ally-1').position = 'n5';
  h.action('prepare');
  h.choose();
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['p0:ally-2', 'p0:ally-3']);
});
it('delegated hand return preserves exact selection order and the untouched deck', () => {
  const h = setup({
    type: 'choose-player',
    relation: 'opponent',
    effects: [
      {
        type: 'return-to-deck',
        count: 2,
        target: 'chosen',
        chooser: 'self',
        destination: 'bottom',
      },
    ],
  });
  const top = [...h.state.players[1].deck];
  h.action('prepare');
  h.choose('p1');
  const cards = [...h.state.players[1].hand].slice(0, 2);
  h.choose(cards[1].id);
  h.choose(cards[0].id);
  expect(h.state.players[1].deck).toEqual([...top, cards[1], cards[0]]);
});
it('combat redirection is schema-restricted to during-combat timing', () => {
  const h = setup({ type: 'summon-ally', placement: 'adjacent' });
  h.defs.cards.prepare.effects = [{ type: 'redirect-combat-damage', target: 'opponent' }];
  expect(() => validateDefinitions(h.defs)).toThrow('before-combat');
});

it('living ally relocation retains statuses and resolves ordinary placement hooks', () => {
  const h = setup({ type: 'summon-ally', placement: 'replace-self' }, false);
  h.defs.characters.vanguard.ally!.abilities = [
    {
      id: 'arrival',
      name: 'Arrival',
      description: 'Arrival',
      trigger: 'after-move',
      effects: [{ type: 'draw', count: 1 }],
    },
  ];
  h.fighter('p0:ally-1').statuses = [{ id: 'attack-up', stacks: 1 }];
  const hand = h.state.players[0].hand.length;
  h.action('prepare');
  h.choose();
  h.choose('p0:ally-1');
  expect(h.fighter('p0:ally-1')).toMatchObject({
    position: 'n0',
    hp: 1,
    statuses: [{ id: 'attack-up', stacks: 1 }],
  });
  expect(h.state.players[0].hand).toHaveLength(hand);
});

it('a cancelled departure cannot summon an ally into an occupied origin', () => {
  const h = setup({ type: 'summon-ally', placement: 'replace-self' });
  h.defs.characters.vanguard.abilities = [
    {
      id: 'rooted',
      name: 'Rooted',
      description: 'Rooted',
      trigger: 'before-move',
      effects: [{ type: 'cancel' }],
    },
  ];
  h.action('prepare');
  h.choose('n9');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.fighter().position).toBe('n0');
  expect(h.state.fighters.filter((f) => f.role === 'ally').every((f) => f.defeated)).toBe(true);
});

it('summoning resumes after a private damage reaction and preserves prior usage history', () => {
  const h = setup({ type: 'summon-ally', placement: 'adjacent', damage: 1 });
  h.defs.characters.vanguard.abilities = [
    {
      id: 'ward',
      name: 'Ward',
      description: 'Ward',
      optional: true,
      trigger: 'before-damage',
      effects: [{ type: 'cancel' }],
    },
  ];
  h.state.resolution.uses['sentinel-use'] = { turn: 0, count: 1, total: 2 };
  h.action('prepare');
  h.choose();
  expect(h.state.resolution.choice!.prompt).toBe('Ward');
  expect(h.fighter('p0:ally-1').defeated).toBe(true);
  h.choose('skip');
  h.choose('p0:ally-1');
  expect(h.fighter('p0:ally-1')).toMatchObject({ position: 'n5', defeated: false });
  expect(h.fighter().hp).toBe(14);
  expect(h.state.resolution.uses['sentinel-use']).toEqual({ turn: 0, count: 1, total: 2 });
});

it('redirects only combat damage while retaining subsequent ability damage recipients', () => {
  const h = setup({ type: 'draw', count: 1 });
  h.defs.cards.strike.value = 7;
  h.defs.cards.strike.abilities = [
    {
      id: 'followup',
      name: 'Followup',
      description: 'Followup',
      trigger: 'after-combat',
      effects: [{ type: 'damage', target: 'opponent', amount: 1 }],
    },
  ];
  h.defs.cards.guard.abilities = [
    {
      id: 'rebound',
      name: 'Rebound',
      description: 'Rebound',
      trigger: 'before-combat',
      effects: [{ type: 'redirect-combat-damage', target: 'opponent' }],
    },
  ];
  h.attack('strike', 'p1:main', 'p0:main');
  h.defend('guard', 'p0');
  expect(h.state.revealed!.damage).toBe(0);
  expect(h.fighter().hp).toBe(14);
  expect(h.fighter('p1:main').hp).toBe(11);
});

it('selects from the updated reserve pool after the summon cost reactions finish', () => {
  const h = setup({ type: 'summon-ally', placement: 'adjacent', damage: 1 }, false);
  h.defs.characters.vanguard.abilities = [
    {
      id: 'sacrifice',
      name: 'Sacrifice',
      description: 'Sacrifice',
      trigger: 'after-damage',
      effects: [
        {
          type: 'choose-fighter',
          relation: 'friendly',
          role: 'ally',
          effects: [{ type: 'defeat', target: 'chosen' }],
        },
      ],
    },
  ];
  h.action('prepare');
  h.choose();
  expect(h.state.resolution.choice!.prompt).toBe('Choose a fighter');
  h.choose('p0:ally-2');
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['p0:ally-2']);
  h.choose('p0:ally-2');
  expect(h.fighter('p0:ally-2').defeated).toBe(false);
  expect(h.fighter().hp).toBe(14);
});
