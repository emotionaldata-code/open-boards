import { describe, expect, it } from 'vitest';
import type { GameView } from '@open-boards/protocol';
import type { Outcome } from '@open-boards/game';
import { presentationEvents } from './events';
import { timing } from './timing';
const initial = (): GameView => ({
  revision: 0,
  sequence: 0,
  turn: 0,
  actions: 2,
  phase: { type: 'taking-actions' },
  revealed: null,
  hand: [],
  paused: false,
  choice: null,
  maneuver: null,
  fighters: ['a', 'b'].map((id, i) => ({
    id: `${id}:main`,
    player: id,
    role: 'main',
    character: 'medusa',
    definition: 'medusa',
    hp: 15,
    position: i ? 'n13' : 'n0',
    defeated: false,
    counters: {},
    statuses: [],
  })),
  players: [
    {
      id: 'a',
      name: 'Arden',
      character: 'medusa',
      handCount: 5,
      deckCount: 15,
      discard: [],
      eliminated: false,
    },
    {
      id: 'b',
      name: 'Briar',
      character: 'medusa',
      handCount: 5,
      deckCount: 15,
      discard: [],
      eliminated: false,
    },
  ],
});
describe('viewer-safe presentation recipes', () => {
  it('notifies every viewer of drawing using public counts, with no private card identities', () => {
    const before = initial(),
      game = initial();
    game.revision = 1;
    game.players[0].deckCount = 14;
    game.phase = { type: 'choosing-movement', player: 'a' };
    const draw: Outcome = {
      type: 'draw',
      player: 'a',
      cards: [{ id: 'secret-card-id', definition: 'medusa-snipe' }],
      sequence: 1,
      revision: 1,
      audience: 'a',
    };
    const owner = presentationEvents(before, game, [draw]);
    const rival = presentationEvents(before, game, []);
    expect(owner).toEqual(rival);
    expect(owner[0].title).toBe('Maneuver');
    expect(JSON.stringify(owner)).not.toMatch(/secret-card-id|medusa-snipe|Snipe/);
  });
  it('announces committed attacks without exposing the attack card, then reveals the confirmed combat', () => {
    const before = initial(),
      game = initial();
    game.revision = 1;
    game.phase = {
      type: 'awaiting-defense',
      attacker: 'a:main',
      defender: 'b:main',
      committedCard: { id: 'secret', definition: 'medusa-snipe' },
    };
    const hidden = presentationEvents(before, game, []);
    expect(hidden[0].title).toBe('Attack incoming');
    expect(JSON.stringify(hidden)).not.toMatch(/medusa-snipe|secret|Snipe/);
    game.phase = { type: 'taking-actions' };
    game.revision = 2;
    const combat: Outcome = {
      type: 'combat',
      sequence: 2,
      revision: 2,
      audience: 'all',
      combat: {
        attacker: 'a:main',
        defender: 'b:main',
        attack: { id: 'secret', definition: 'medusa-snipe' },
        defense: null,
        boosts: [],
        damage: 4,
      },
    };
    const revealed = presentationEvents(before, game, [combat]);
    expect(revealed[0].detail).toContain('Snipe 3');
    expect(revealed[0].review?.participants[1]).toMatchObject({ role: 'No defense' });
    expect(revealed[0].review?.participants[1].card).toBeUndefined();
    expect(revealed[0].review?.result).toBe('Medusa takes 4 damage.');
    expect(revealed[0].effects).toContainEqual({
      type: 'attack',
      player: 'a:main',
      from: 'n0',
      to: 'n13',
      style: 'ranged',
      duration: timing.impact + 450,
    });
  });
  it('preserves outcome sequence IDs and avoids duplicate discard cues for revealed combat cards', () => {
    const game = initial();
    game.revision = 3;
    const card = { id: 'committed', definition: 'medusa-snipe' };
    const outcomes: Outcome[] = [
      {
        type: 'played',
        player: 'a',
        fighter: 'a:main',
        card,
        sequence: 7,
        revision: 3,
        audience: 'all',
      },
      {
        type: 'combat',
        combat: {
          attacker: 'a:main',
          defender: 'b:main',
          attack: card,
          defense: null,
          boosts: [],
          damage: 4,
        },
        sequence: 8,
        revision: 3,
        audience: 'all',
      },
      {
        type: 'damage',
        fighter: 'b:main',
        amount: 4,
        reason: 'combat',
        sequence: 9,
        revision: 3,
        audience: 'all',
      },
    ];
    const events = presentationEvents(null, game, outcomes);
    expect(events.map((e) => e.id)).toEqual(['outcome:8', 'outcome:9']);
    expect(events[1].effects).toContainEqual({ type: 'text', node: 'n13', text: '−4' });
    expect(events[1].sounds).toEqual([]); // The combat cue already sounded the impact.
  });
  it.each(['main', 'ally'] as const)('times %s attacks and defense to the same impact', (role) => {
    const game = initial();
    game.fighters[0].role = role;
    game.fighters[0].definition = role === 'ally' ? 'medusa-harpy' : 'medusa';
    const [event] = presentationEvents(null, game, [
      {
        type: 'combat',
        sequence: 1,
        revision: 1,
        audience: 'all',
        combat: {
          attacker: 'a:main',
          defender: 'b:main',
          attack: { id: 'attack', definition: 'medusa-dash' },
          defense: { id: 'defense', definition: 'medusa-feint' },
          boosts: [],
          damage: 0,
        },
      },
    ]);
    expect(event.duration).toBeGreaterThanOrEqual(2000);
    expect(event.effects).toContainEqual(
      expect.objectContaining({
        type: 'attack',
        style: role === 'main' ? 'ranged' : 'melee',
      }),
    );
    expect(event.effects).toContainEqual(expect.objectContaining({ type: 'shield' }));
    expect(event.sounds).toContainEqual({ name: 'shield', delay: timing.impact });
    expect(event.sounds.some((s) => s.name === 'impact')).toBe(false);
  });
  it('composes the same primitives for new heal, ability and status events', () => {
    const game = initial();
    const data: Outcome[] = [
      { type: 'heal', fighter: 'a:main', amount: 3, sequence: 1, revision: 1, audience: 'all' },
      {
        type: 'ability',
        fighter: 'b:main',
        name: 'Iron will',
        sequence: 2,
        revision: 1,
        audience: 'all',
      },
      {
        type: 'status',
        fighter: 'b:main',
        status: 'fortified',
        stacks: 2,
        sequence: 3,
        revision: 1,
        audience: 'all',
      },
    ];
    const events = presentationEvents(null, game, data);
    expect(events.map((e) => e.title)).toEqual(['Restored', 'Iron will', 'fortified']);
    expect(events[0].effects).toContainEqual({ type: 'text', node: 'n0', text: '+3' });
    expect(events[2].detail).toContain('2 stacks');
  });
  it('announces pause/resume even when the authoritative revision is unchanged', () => {
    const before = initial(),
      game = initial();
    game.paused = true;
    expect(presentationEvents(before, game, [])[0].title).toBe('Arena paused');
    expect(presentationEvents(game, before, [])[0].title).toBe('Back in the fight');
    expect(presentationEvents(before, before, [])).toEqual([]);
  });
});

it.each([['medusa', 'wave', 'mint']] as const)(
  'gives %s a distinct confirmed ability cue',
  (character, mark, tone) => {
    const game = initial();
    game.players[0].character = character;
    game.fighters[0].character = character;
    const [event] = presentationEvents(null, game, [
      {
        type: 'ability',
        fighter: 'a:main',
        name: 'Ability',
        sequence: 1,
        revision: 1,
        audience: 'all',
      },
    ]);
    expect(event.tone).toBe(tone);
    expect(event.effects).toContainEqual({ type: 'sigil', node: 'n0', mark, delay: 120 });
  },
);

it('keeps Burn and Smolder fire cues independent of the afflicted character', () => {
  const game = initial();
  game.players[0].character = 'medusa';
  game.fighters[0].character = 'medusa';
  const events = presentationEvents(null, game, [
    {
      type: 'status',
      fighter: 'a:main',
      status: 'burn',
      stacks: 1,
      sequence: 1,
      revision: 1,
      audience: 'all',
    },
    {
      type: 'ability',
      fighter: 'a:main',
      name: 'Smolder',
      sequence: 2,
      revision: 1,
      audience: 'all',
    },
  ]);
  for (const event of events) {
    expect(event.tone).toBe('ember');
    expect(event.sounds).toEqual([{ name: 'burn' }]);
    expect(event.effects).toContainEqual(expect.objectContaining({ type: 'sigil', mark: 'flame' }));
  }
});

it('announces portal travel with a rift cue at the confirmed portal step', () => {
  const [event] = presentationEvents(null, initial(), [
    {
      type: 'move',
      fighter: 'a:main',
      path: ['n0', 'n5', 'n16', 'n17'],
      sequence: 1,
      revision: 1,
      audience: 'all',
    },
  ]);
  expect(event.title).toBe('Through the rift');
  expect(event.sounds).toEqual([
    { name: 'move', delay: 0 },
    { name: 'portal', delay: timing.step },
    { name: 'move', delay: timing.step * 2 },
  ]);
});

it('presents combat artwork for both fighters and confirmed damage rather than recomputing printed values', () => {
  const [event] = presentationEvents(null, initial(), [
    {
      type: 'combat',
      sequence: 1,
      revision: 1,
      audience: 'all',
      combat: {
        attacker: 'a:main',
        defender: 'b:main',
        attack: { id: 'a', definition: 'medusa-snipe' },
        defense: { id: 'b', definition: 'medusa-feint' },
        boosts: [],
        damage: 2,
      },
    },
  ]);
  expect(event.review?.participants).toMatchObject([
    {
      fighter: { name: 'Medusa', player: 'Arden', artwork: 'medusa' },
      role: 'Attack',
      card: 'medusa-snipe',
    },
    {
      fighter: { name: 'Medusa', player: 'Briar', artwork: 'medusa' },
      role: 'Defense',
      card: 'medusa-feint',
    },
  ]);
  expect(event.review?.result).toBe('Medusa takes 2 damage.');
});

it('keeps action, card ability, status and direct effect readouts in confirmed sequence order', () => {
  const outcomes: Outcome[] = [
    {
      type: 'played',
      player: 'a',
      fighter: 'a:main',
      card: { id: 'card', definition: 'medusa-winged-frenzy' },
      sequence: 1,
      revision: 1,
      audience: 'all',
    },
    {
      type: 'ability',
      fighter: 'b:main',
      name: 'Dash',
      sequence: 2,
      revision: 1,
      audience: 'all',
    },
    {
      type: 'status',
      fighter: 'a:main',
      status: 'burn',
      stacks: 1,
      sequence: 3,
      revision: 1,
      audience: 'all',
    },
    {
      type: 'damage',
      fighter: 'a:main',
      amount: 1,
      reason: 'ability',
      sequence: 4,
      revision: 1,
      audience: 'all',
    },
    { type: 'heal', fighter: 'b:main', amount: 2, sequence: 5, revision: 1, audience: 'all' },
  ];
  const events = presentationEvents(null, initial(), outcomes);
  expect(events.map((event) => event.id)).toEqual([1, 2, 3, 4, 5].map((id) => `outcome:${id}`));
  expect(events.every((event) => event.review)).toBe(true);
  expect(events[1].review?.participants[0].card).toBe('medusa-dash');
  expect(events[1].review?.explanation).toContain('Move your fighter');
  expect(events[2].review?.result).toContain('take 1 damage');
  expect(events[3].review?.explanation).toBe('1 damage is dealt.');
  expect(events[4].review?.explanation).toBe('2 health is restored.');
});

it.each(['discarding', 'ability-choice'] as const)(
  'does not present an action card discarded during %s as a played action',
  (type) => {
    const before = initial(),
      game = initial();
    before.phase = { type, player: 'a' };
    game.revision = 1;
    const [event] = presentationEvents(before, game, [
      {
        type: 'played',
        player: 'a',
        fighter: 'a:main',
        card: { id: 'discarded', definition: 'medusa-winged-frenzy' },
        sequence: 1,
        revision: 1,
        audience: 'all',
      },
    ]);
    expect(event.review).toBeUndefined();
    expect(event.detail).toContain('Card discarded');
  },
);

it('presents public boost payments with their purpose and bonus, and includes the bonus in combat', () => {
  const payment = { id: 'boost', definition: 'medusa-gaze-of-stone' };
  const events = presentationEvents(null, initial(), [
    {
      type: 'boost',
      player: 'a',
      fighter: 'a:main',
      card: payment,
      purpose: 'attack',
      amount: 4,
      sequence: 1,
      revision: 1,
      audience: 'all',
    },
    {
      type: 'combat',
      combat: {
        attacker: 'a:main',
        defender: 'b:main',
        attack: { id: 'attack', definition: 'medusa-snipe' },
        defense: null,
        boosts: [{ card: payment, amount: 4 }],
        damage: 7,
      },
      sequence: 2,
      revision: 1,
      audience: 'all',
    },
  ]);
  expect(events[0]).toMatchObject({
    title: 'Attack boosted',
    detail: 'Arden · Gaze of Stone · +4',
  });
  expect(events[0].review?.explanation).toContain('Its own effects do not resolve');
  expect(events[1].detail).toContain('+4 BOOST');
  expect(events[1].review?.participants.at(-1)).toMatchObject({
    role: 'BOOST +4',
    card: 'medusa-gaze-of-stone',
  });
  expect(events[1].review?.result).toBe('Medusa takes 7 damage.');
});

it('presents revival at its confirmed destination without movement from the defeated position', () => {
  const before = initial(),
    game = initial();
  game.players[0].character = 'medusa';
  game.fighters[0].character = 'medusa';
  game.fighters[0].definition = 'medusa';
  game.fighters.push({
    ...game.fighters[0],
    id: 'a:ally-2',
    role: 'ally',
    definition: 'medusa-harpy',
    hp: 1,
    position: 'center',
  });
  before.fighters.push({ ...game.fighters[2], hp: 0, defeated: true, position: 'n5' });
  const events = presentationEvents(before, game, [
    {
      type: 'revived',
      fighter: 'a:ally-2',
      position: 'center',
      audience: 'all',
      sequence: 1,
      revision: 1,
    },
  ]);
  expect(events).toHaveLength(1);
  expect(events[0].detail).toContain('Harpy 2');
  expect(
    events[0].effects.every(
      (effect) => effect.type !== 'move' && 'node' in effect && effect.node === 'center',
    ),
  ).toBe(true);
});

it.each([false, true])('distinguishes a zero BOOST from a cancelled payment (%s)', (cancelled) => {
  const payment = { id: 'payment', definition: 'medusa-gaze-of-stone' };
  const events = presentationEvents(null, initial(), [
    {
      type: 'boost',
      fighter: 'a:main',
      player: 'a',
      card: payment,
      amount: 0,
      purpose: 'attack',
      cancelled,
      sequence: 1,
      revision: 1,
      audience: 'all',
    },
    {
      type: 'combat',
      combat: {
        attacker: 'a:main',
        defender: 'b:main',
        attack: { id: 'attack', definition: 'medusa-snipe' },
        defense: null,
        boosts: [{ card: payment, amount: 0, cancelled }],
        damage: 3,
      },
      sequence: 2,
      revision: 1,
      audience: 'all',
    },
  ]);
  expect(events[0].title).toBe(cancelled ? 'BOOST cancelled' : 'Attack boosted');
  expect(events[1].review?.participants.at(-1)?.role).toBe(
    cancelled ? 'BOOST cancelled' : 'BOOST +0',
  );
});

it('keeps an explicit public hand reveal readable after subsequent snapshots without reading private hands', () => {
  const game = initial();
  game.hand = [{ id: 'private', definition: 'medusa-gaze-of-stone' }];
  const cards = [{ id: 'revealed', definition: 'sherlock-holmes-elementary' }];
  const events = presentationEvents(null, game, [
    { type: 'hand-revealed', player: 'b', cards, sequence: 1, revision: 1, audience: 'all' },
  ]);
  expect(events).toHaveLength(1);
  expect(events[0].title).toBe('Hand revealed');
  expect(events[0].review?.cards).toEqual(['sherlock-holmes-elementary']);
  expect(events[0].review?.explanation).toContain('Briar');
  expect(JSON.stringify(events)).not.toContain('medusa-gaze-of-stone');
  game.hand = [];
  expect(events[0].review?.cards).toEqual(['sherlock-holmes-elementary']);
});

it('attributes a defense BOOST to the defender in the notice, combat values and review', () => {
  const payment = { id: 'payment', definition: 'geralt-of-rivia-damn-youre-ugly' };
  const events = presentationEvents(null, initial(), [
    {
      type: 'boost',
      player: 'b',
      fighter: 'b:main',
      card: payment,
      purpose: 'defense',
      amount: 4,
      sequence: 1,
      revision: 1,
      audience: 'all',
    },
    {
      type: 'combat',
      combat: {
        attacker: 'a:main',
        defender: 'b:main',
        attack: { id: 'a', definition: 'medusa-snipe' },
        defense: { id: 'b', definition: 'geralt-of-rivia-rend' },
        boosts: [{ card: payment, amount: 4, field: 'defense' }],
        damage: 0,
      },
      sequence: 2,
      revision: 1,
      audience: 'all',
    },
  ]);
  expect(events[0].title).toBe('Defense boosted');
  expect(events[0].review?.explanation).toContain('this defense');
  expect(events[1].detail).toContain('· Rend 3 +4 BOOST');
  expect(events[1].review?.participants.at(-1)?.fighter.player).toBe('Briar');
  expect(events[1].review?.explanation).toContain('adds 4 to the defense');
});
