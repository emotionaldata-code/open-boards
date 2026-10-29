import { expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { maneuverMovement, validateDefinitions, type Effect } from '../index';
import { projectGame, projectOutcomes } from '../../../../apps/server/src/transport/projection';

function setup(effects: Effect[] = [{ type: 'recover-card', tag: 'expedition', all: true }]) {
  const defs = structuredClone(basic);
  defs.cards.strike.tags = ['expedition'];
  defs.cards.adapt.tags = ['expedition'];
  defs.cards.prepare.effects = effects;
  defs.characters.vanguard.maneuverBonus = {
    name: 'Experience',
    description: 'Travel farther for each discarded expedition.',
    perDiscardTag: 'expedition',
  };
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.state.players[0].discard.push(
    { id: 'prior-a', definition: 'adapt' },
    { id: 'prior-b', definition: 'adapt' },
    { id: 'ordinary', definition: 'guard' },
  );
  return h;
}

it('strictly validates reusable tags, tagged values, maneuver rules and bulk recovery', () => {
  const h = setup([
    { type: 'draw', count: { stat: 'discard', tag: 'expedition', of: 'opponent' } },
  ]);
  expect(() => validateDefinitions(h.defs)).not.toThrow();
  for (const tags of [
    [],
    ['duplicate', 'duplicate'],
    ['Invalid Tag'],
    Array<string>(17).fill('tag'),
  ]) {
    const defs = structuredClone(h.defs);
    defs.cards.strike.tags = tags;
    expect(() => validateDefinitions(defs)).toThrow();
  }
  for (const effect of [
    { type: 'recover-card', tag: 'Bad tag', all: true },
    { type: 'recover-card', all: 'yes' },
    { type: 'draw', count: { stat: 'discard', unknown: true } },
  ]) {
    const defs = structuredClone(h.defs);
    defs.cards.prepare.effects = [effect as Effect];
    expect(() => validateDefinitions(defs)).toThrow();
  }
});

it('counts exact duplicate instances by owner and tag and excludes current combat commitments', () => {
  const h = setup();
  h.defs.cards.strike.abilities = [
    {
      id: 'count',
      name: 'Count',
      description: 'Count prior expeditions',
      trigger: 'before-combat',
      effects: [
        { type: 'modify', field: 'attack', amount: { stat: 'discard', tag: 'expedition' } },
      ],
    },
  ];
  h.state.players[1].discard.push({ id: 'enemy', definition: 'adapt' });
  h.attack('strike');
  h.defend();
  expect(h.state.revealed?.damage).toBe(6);
  expect(maneuverMovement(h.state, h.fighter(), h.defs)).toBe(5);
});

it('bulk recovery moves all matching prior instances privately without drawing hooks or exhaustion', () => {
  const h = setup();
  h.defs.characters.vanguard.abilities = [
    {
      id: 'draw-cost',
      name: 'Draw cost',
      description: 'Damage on draw',
      trigger: 'after-draw',
      effects: [{ type: 'damage', amount: 3 }],
    },
  ];
  h.state.players[0].deck = [];
  const outcomes = h.action('prepare');
  expect(h.fighter().hp).toBe(15);
  expect(h.state.players[0].hand.filter((c) => c.id.startsWith('prior-'))).toHaveLength(2);
  expect(h.state.players[0].discard.map((c) => c.id)).toContain('ordinary');
  expect(h.state.resolution.choice).toBeNull();
  expect(projectOutcomes(outcomes, 'p1').some((o) => o.type === 'draw')).toBe(false);
  expect(maneuverMovement(projectGame(h.state, 'p0', false), h.fighter(), h.defs)).toBe(2);
});

it('intersects exact-definition and tag filters, preserving ordinary single-card recovery reconnect', () => {
  const h = setup([{ type: 'recover-card', tag: 'expedition', cards: ['adapt'] }]);
  h.state.players[0].discard.push({ id: 'wrong-definition', definition: 'strike' });
  h.action('prepare');
  const choice = h.state.resolution.choice!;
  expect(choice.options.map((o) => o.id)).toEqual(['prior-a', 'prior-b']);
  const before = structuredClone(h.state);
  expect(h.run({ type: 'choose', choice: choice.id, options: ['wrong-definition'] }).ok).toBe(
    false,
  );
  expect(h.state).toEqual(before);
  expect(projectGame(h.state, 'p1', false).choice).toBeNull();
  h.reconnect();
  h.choose('prior-b');
  expect(h.state.players[0].hand.some((c) => c.id === 'prior-b')).toBe(true);
  expect(h.state.players[0].discard.some((c) => c.id === 'prior-a')).toBe(true);
});

it('bulk recovery excludes its own resolving combat card across a nested JSON continuation', () => {
  const h = setup();
  h.defs.cards.strike.abilities = [
    {
      id: 'return',
      name: 'Return',
      description: 'Return prior cards',
      trigger: 'after-combat',
      effects: [
        {
          type: 'choose-option',
          prompt: 'Recover?',
          options: [
            {
              id: 'recover',
              label: 'Recover',
              effects: [{ type: 'recover-card', tag: 'expedition', all: true }],
            },
          ],
        },
      ],
    },
  ];
  const id = h.state.players[0].hand[0].id;
  h.attack('strike');
  h.defend();
  expect(projectGame(h.state, 'p1', false).choice).toBeNull();
  h.reconnect();
  h.choose('recover');
  expect(h.state.players[0].discard.some((c) => c.id === id)).toBe(true);
  expect(h.state.players[0].hand.filter((c) => c.id.startsWith('prior-'))).toHaveLength(2);
});

it('all-card recovery into the deck shuffles once without drawing and respects an empty matching pile', () => {
  const h = setup([{ type: 'recover-card', tag: 'expedition', all: true, destination: 'deck' }]);
  const size = h.state.players[0].deck.length;
  const outcomes = h.action('prepare');
  expect(h.state.players[0].deck).toHaveLength(size + 2);
  expect(outcomes.some((o) => o.type === 'draw')).toBe(false);
  h.action('prepare');
  expect(h.state.players[0].deck).toHaveLength(size + 2);
});
