import { expect, it } from 'vitest';
import { validateDefinitions, type Command, type Definitions } from '@open-boards/game';
import { basic as content, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/harry-houdini/inventory.json';

const id = (s: string) => `harry-houdini-${s}`;
function setup(
  edit: (defs: Definitions) => void = () => {},
  roster = ['harry-houdini', 'vanguard'],
) {
  const defs = structuredClone({
    ...content,
    characters: { ...content.characters, ...neutral.characters },
    cards: { ...content.cards, ...neutral.cards },
  });
  edit(defs);
  const h = deckHarness(defs, roster);
  h.fighter().position = 'n0';
  h.fighter('p0:ally-1').position = 'n5';
  h.fighter('p1:main').position = 'n1';
  return h;
}
function privateChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const c = h.state.resolution.choice!,
    before = structuredClone(h.state);
  const command: Command = { type: 'choose', choice: c.id, options: [c.options[0].id] };
  expect(projectGame(h.state, c.player === 'p0' ? 'p1' : 'p0', false).choice).toBeNull();
  expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
  expect(h.run(command, c.player === 'p0' ? 'p1' : 'p0').ok).toBe(false);
  expect(h.run({ ...command, options: ['$forged'] }, c.player).ok).toBe(false);
  expect(h.state).toEqual(before);
}
it('preserves all 30 cards, 13 designs, printed BOOSTs and fighter restrictions', () => {
  validateDefinitions(content);
  expect(content.characters['harry-houdini']).toMatchObject({
    hp: 14,
    movement: 2,
    attackType: 'melee',
    ally: { hp: 5, count: 1, attackType: 'melee' },
  });
  expect(deckDefinitions('harry-houdini')).toHaveLength(30);
  expect(content.characters['harry-houdini'].deck).toHaveLength(13);
  for (const source of inventory.deck.cards) {
    const c = content.cards[id(source.slug)];
    expect(c).toMatchObject({
      name: source.title,
      category: source.type === 'scheme' ? 'action' : source.type,
      value: source.value ?? 0,
      boost: source.boost,
      usableBy: { HOUDINI: 'MAIN', BESS: 'ALLY', ANY: 'BOTH' }[source.characterName],
    });
    expect(deckDefinitions('harry-houdini').filter((x) => x === c.id)).toHaveLength(
      source.quantity,
    );
    for (const clause of [
      source.basicText,
      source.immediateText,
      source.duringText,
      source.afterText,
    ].filter(Boolean))
      expect(c.description).toContain(clause);
  }
});
it('Escape Artist replaces only Houdini’s Maneuver movement and retains Bess movement', () => {
  const h = setup();
  h.apply({ type: 'maneuver' });
  h.apply({ type: 'boost-maneuver', card: h.state.players[0].hand[0].id });
  privateChoice(h);
  h.choose('use');
  privateChoice(h);
  h.choose('n20');
  expect(h.fighter().position).toBe('n20');
  expect(h.state.maneuver?.remaining).toEqual(['p0:ally-1']);
  expect(h.state.phase.type).toBe('choosing-movement');
});
it('resolves printed BOOST bonuses even for a card Bess could not play', () => {
  const h = setup();
  h.state.players[0].hand[1].definition = id('sleight-of-hand');
  const before = h.state.players[0].hand.length;
  h.apply({ type: 'maneuver' });
  h.apply({ type: 'boost-maneuver', card: h.state.players[0].hand[1].id });
  expect(h.state.players[0].hand).toHaveLength(before + 1);
  h.choose('skip');
});
it('requires both Big Reveal payments together and recovers only its exact paid instances', () => {
  const h = setup();
  h.state.players[0].hand[1].definition = id('flourish');
  h.state.players[0].hand[2].definition = id('sleight-of-hand');
  h.attack(id('the-big-reveal'));
  h.defend();
  h.choose('boost');
  privateChoice(h);
  const choice = h.state.resolution.choice!,
    options = choice.options.slice(0, 2).map((o) => o.id);
  expect(choice.min).toBe(2);
  expect(h.run({ type: 'choose', choice: choice.id, options: [options[0]] }).ok).toBe(false);
  const deck = h.state.players[0].deck.length;
  h.apply({ type: 'choose', choice: choice.id, options });
  expect(h.state.players[0].deck).toHaveLength(deck - 2);
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(
    expect.arrayContaining(options),
  );
  expect(h.state.resolution.choice!.options).toHaveLength(2);
  h.choose(options[0]);
  expect(h.state.players[0].hand.some((c) => c.id === options[0])).toBe(true);
});
it('Smoke and Mirrors transfers attacks and defenses to the exchanged fighter', () => {
  for (const attacking of [true, false]) {
    const h = setup();
    if (attacking) {
      h.attack(id('smoke-and-mirrors'));
      h.defend();
    } else {
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend(id('smoke-and-mirrors'), 'p0');
    }
    h.choose('use');
    expect(h.fighter().position).toBe('n5');
    expect(h.fighter('p0:ally-1').position).toBe('n0');
    expect(attacking ? h.state.revealed?.attacker : h.state.revealed?.defender).toBe('p0:ally-1');
  }
});
it('All Part of the Show saves the hero and Bess from lethal combat without eliminating their owner', () => {
  for (const defender of ['p0:main', 'p0:ally-1']) {
    const h = setup((d) => {
      d.cards.strike.value = 10;
    });
    h.fighter(defender).position = 'n0';
    h.fighter(defender).hp = 1;
    h.attack('strike', 'p1:main', defender);
    h.defend(id('all-part-of-the-show'), 'p0');
    privateChoice(h);
    h.choose('n20');
    expect(h.fighter(defender)).toMatchObject({ hp: 4, defeated: false, position: 'n20' });
    expect(h.state.players[0].eliminated).toBe(false);
  }
});
it('Secrets reveals only itself, preserves the card and cancels the complete inspection timing step', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [
      { type: 'discard', target: 'opponent', chooser: 'self', count: 1 },
      { type: 'draw', count: 1 },
    ];
  });
  h.state.players[0].hand[1].definition = id('a-magician-never-reveals-his-secrets');
  h.state.players[1].hand[0].definition = 'prepare';
  h.state.turn = 1;
  h.defs.cards.prepare.effects = [
    {
      type: 'choose-player',
      relation: 'opponent',
      effects: [
        { type: 'discard', target: 'chosen', chooser: 'self', count: 1 },
        { type: 'draw', count: 1 },
      ],
    },
  ];
  const hand = h.state.players[0].hand.length,
    deck = h.state.players[1].deck.length;
  h.action('prepare', 'p1:main');
  h.choose('p0');
  privateChoice(h);
  const secret = h.state.players[0].hand.find(
    (c) => c.definition === id('a-magician-never-reveals-his-secrets'),
  )!;
  h.choose(secret.id);
  expect(h.state.players[0].hand).toHaveLength(hand);
  expect(h.state.players[1].deck).toHaveLength(deck);
});
it('Bess draws for an opponent’s discard effect, while ordinary play and BOOST payment do not trigger it', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [
      {
        type: 'choose-player',
        relation: 'opponent',
        effects: [{ type: 'discard', target: 'chosen', count: 1 }],
      },
    ];
  });
  h.state.players[0].hand[0].definition = id('and-the-beautiful-bess');
  const before = h.state.players[0].hand.length;
  h.state.turn = 1;
  h.action('prepare', 'p1:main');
  h.choose('p0');
  h.choose(h.state.players[0].hand[0].id);
  expect(h.state.players[0].hand).toHaveLength(before);
});
it('Sleight of Hand cannot return itself when no different legal attack exists', () => {
  const h = setup();
  h.state.players[0].hand = h.state.players[0].hand.slice(0, 1);
  h.attack(id('sleight-of-hand'));
  h.defend();
  h.choose('use');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.players[0].hand).toHaveLength(0);
  expect(h.state.players[0].discard.some((c) => c.definition === id('sleight-of-hand'))).toBe(true);
});
it('Sleight of Hand replaces the exact card and resolves the new immediate and later effects', () => {
  const h = setup();
  h.state.players[0].hand[1].definition = id('misdirection');
  h.attack(id('sleight-of-hand'));
  h.defend('guard');
  h.choose('use');
  h.choose(); // private look at own hand
  privateChoice(h);
  const replacement = h.state.resolution.choice!.options.find(
    (o) => o.card?.definition === id('misdirection'),
  )!;
  expect(
    h.state.resolution.choice!.options.some((o) => o.card?.definition === id('sleight-of-hand')),
  ).toBe(false);
  h.choose(replacement.id);
  expect(h.state.revealed?.attack.definition).toBe(id('misdirection'));
  expect(h.state.players[0].hand.some((c) => c.definition === id('sleight-of-hand'))).toBe(true);
});
it('Grand Escape boosts defense, resolves payment healing, then places the winning exact fighter', () => {
  const h = setup();
  h.fighter().hp = 3;
  h.state.players[0].hand[1].definition = id('all-part-of-the-show');
  h.attack('strike', 'p1:main', 'p0:main');
  h.defend(id('grand-escape'), 'p0');
  const payment = h.state.resolution.choice!.options.find(
    (o) => o.card?.definition === id('all-part-of-the-show'),
  )!;
  h.choose(payment.id);
  expect(h.fighter().hp).toBe(5);
  expect(h.state.revealed?.damage).toBe(0);
  h.choose('n20');
  expect(h.fighter().position).toBe('n20');
});
it('Illusion offers the opposing owner an immediate BOOST before Houdini’s during-combat BOOST', () => {
  const h = setup();
  h.attack(id('an-illusion-of-my-own-design'));
  h.defend('guard');
  expect(h.state.resolution.choice!.player).toBe('p1');
  privateChoice(h);
  h.choose(h.state.resolution.choice!.options.find((o) => o.card)!.id);
  expect(h.state.resolution.choice!.player).toBe('p0');
  h.choose('$skip');
  expect(h.state.revealed?.boosts).toHaveLength(1);
  expect(h.state.revealed?.boosts[0].field).toBe('defense');
});
it('Set the Stage uses Bess, draws three, then privately returns an exact card to the deck top', () => {
  const h = setup();
  const before = h.state.players[0].hand.length;
  h.action(id('set-the-stage'), 'p0:ally-1');
  expect(h.state.players[0].hand).toHaveLength(before + 2);
  privateChoice(h);
  const card = h.state.resolution.choice!.options[0].id;
  h.choose(card);
  expect(h.state.players[0].deck[0].id).toBe(card);
});
it('Vanishing Act moves the chosen opposing combatant through enemies and For My Next Trick grants its draw/action', () => {
  const h = setup();
  h.attack(id('vanishing-act'));
  h.defend();
  h.choose('p1:main');
  const origin = h.fighter('p1:main').position;
  h.choose(h.state.resolution.choice!.options.find((o) => o.id !== '$stay')!.id);
  expect(h.fighter('p1:main').position).not.toBe(origin);
  h.fighter('p1:main').position = 'n1';
  const before = h.state.players[0].hand.length;
  h.attack(id('for-my-next-trick'));
  h.defend();
  h.choose('p0:ally-1');
  h.choose('$stay');
  expect(h.state.players[0].hand).toHaveLength(before);
  expect(h.state.actions).toBe(1);
});
it('rejects Houdini-only and Bess-only cards from the wrong fighter without state mutation', () => {
  const h = setup();
  for (const [definition, fighter, command] of [
    [id('the-big-reveal'), 'p0:ally-1', 'attack'],
    [id('set-the-stage'), 'p0:main', 'play-action'],
  ] as const) {
    h.state.players[0].hand[0].definition = definition;
    const before = structuredClone(h.state),
      card = h.state.players[0].hand[0].id;
    const result =
      command === 'attack'
        ? h.run({ type: command, fighter, target: 'p1:main', card })
        : h.run({ type: command, fighter, card });
    expect(result.ok).toBe(false);
    expect(h.state).toEqual(before);
  }
});
it('Big Reveal cannot recover another grant’s BOOST, and never accepts a single payment', () => {
  const h = setup((d) => {
    d.cards[id('the-big-reveal')].abilities!.unshift({
      id: 'other-grant',
      name: 'Other grant',
      description: 'Other grant',
      trigger: 'combat-reveal',
      effects: [{ type: 'boost-combat', grant: 'other-grant' }],
    });
  });
  for (const c of h.state.players[0].hand.slice(1)) c.definition = id('vanishing-act');
  h.attack(id('the-big-reveal'));
  h.defend();
  const other = h.state.resolution.choice!.options.find((o) => o.card)!.id;
  h.choose(other);
  h.choose('boost');
  const choice = h.state.resolution.choice!,
    selected = choice.options.slice(0, 2).map((o) => o.id);
  h.apply({ type: 'choose', choice: choice.id, options: selected });
  expect(h.state.resolution.choice!.options.map((o) => o.id).sort()).toEqual([...selected].sort());
  expect(h.state.resolution.choice!.options.some((o) => o.id === other)).toBe(false);
});
it('deploys the full Bess count in supported two- and four-seat matches', () => {
  for (const roster of [
    ['harry-houdini', 'harry-houdini'],
    ['harry-houdini', 'medusa', 'harry-houdini', 'medusa'],
  ]) {
    const h = setup(() => {}, roster);
    const owners = h.state.players.filter((p) => p.character === 'harry-houdini');
    for (const owner of owners)
      expect(
        h.state.fighters.filter(
          (f) => f.player === owner.id && f.role === 'ally' && f.position !== null && !f.defeated,
        ),
      ).toHaveLength(1);
    expect(h.state.phase.type).toBe('taking-actions');
  }
});
it('Smoke and Mirrors retains an opposing card’s earlier granted BOOST on the exchanged attack', () => {
  const h = setup((d) => {
    d.cards.guard.abilities = [
      {
        id: 'gift',
        name: 'Gift',
        description: 'Gift',
        trigger: 'combat-reveal',
        effects: [{ type: 'boost-combat', target: 'opponent', grant: 'gift' }],
      },
    ];
  });
  h.state.players[0].hand[1].definition = id('vanishing-act');
  h.attack(id('smoke-and-mirrors'));
  h.defend('guard');
  h.choose(
    h.state.resolution.choice!.options.find((o) => o.card?.definition === id('vanishing-act'))!.id,
  );
  h.choose('use');
  expect(h.state.revealed?.attacker).toBe('p0:ally-1');
  expect(h.state.revealed?.damage).toBe(2);
});
