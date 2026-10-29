import { expect, it } from 'vitest';
import { validateDefinitions, type Command, type Definitions } from '@open-boards/game';
import { basic as content, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame, projectOutcomes } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/sun-wukong/inventory.json';

const id = (s: string) => `sun-wukong-${s}`;
function setup(edit: (defs: Definitions) => void = () => {}, roster = ['sun-wukong', 'vanguard']) {
  const defs = structuredClone({
    ...content,
    characters: { ...content.characters, ...neutral.characters },
    cards: { ...content.cards, ...neutral.cards },
  });
  edit(defs);
  const h = deckHarness(defs, roster);
  if (h.state.resolution.choice?.prompt === 'Clone Summoning') h.choose('skip');
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}
function clone(h: ReturnType<typeof setup>, n = 1, position = 'n5') {
  const f = h.fighter(`p0:ally-${n}`);
  f.defeated = false;
  f.hp = 1;
  f.position = position;
  return f;
}
function privateChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const c = h.state.resolution.choice!,
    before = structuredClone(h.state);
  const cmd: Command = { type: 'choose', choice: c.id, options: [c.options[0].id] };
  expect(projectGame(h.state, c.player === 'p0' ? 'p1' : 'p0', false).choice).toBeNull();
  expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
  expect(h.run(cmd, c.player === 'p0' ? 'p1' : 'p0').ok).toBe(false);
  expect(h.run({ ...cmd, options: ['$forged'] }, c.player).ok).toBe(false);
  expect(h.state).toEqual(before);
}

it('preserves the exact source inventory, all clauses and BOOST values', () => {
  validateDefinitions(content);
  expect(content.characters['sun-wukong']).toMatchObject({
    hp: 17,
    movement: 2,
    attackType: 'melee',
    ally: { count: 3, hp: 1, startsOffBoard: true },
  });
  expect(deckDefinitions('sun-wukong')).toHaveLength(30);
  expect(content.characters['sun-wukong'].deck).toHaveLength(12);
  for (const s of inventory.deck.cards) {
    const c = content.cards[id(s.slug)];
    expect(c).toMatchObject({
      name: s.title,
      category: s.type === 'scheme' ? 'action' : s.type,
      value: s.value ?? 0,
      boost: s.boost,
      usableBy: 'BOTH',
    });
    expect(deckDefinitions('sun-wukong').filter((x) => x === c.id)).toHaveLength(s.quantity);
    for (const clause of [s.basicText, s.immediateText, s.duringText, s.afterText].filter(Boolean))
      expect(c.description).toContain(clause);
  }
});
it('starts with three reserve Clones and legal full-count two/four-seat rosters', () => {
  for (const other of Object.keys(content.characters))
    for (const roster of [
      ['sun-wukong', other],
      ['sun-wukong', other, 'sun-wukong', other],
    ]) {
      const h = setup(() => {}, roster);
      const allies = h.state.fighters.filter((f) => f.player === 'p0' && f.role === 'ally');
      expect(allies).toHaveLength(3);
      expect(allies.every((f) => f.defeated && f.hp === 0 && f.position === null)).toBe(true);
      expect(h.state.phase.type).not.toBe('placing-allies');
    }
});
it('summons at turn start, pays once after legal choices, and retains private reconnects', () => {
  const h = setup((d) => {
    d.characters['sun-wukong'].abilities![0].trigger = 'after-action';
  });
  h.action(id('phoenix-form'));
  h.choose('use');
  privateChoice(h);
  const destination = h.state.resolution.choice!.options[0].id;
  h.choose(destination);
  privateChoice(h);
  h.choose('p0:ally-2');
  expect(h.fighter().hp).toBe(16);
  expect(h.fighter('p0:ally-2')).toMatchObject({ position: destination, hp: 1, defeated: false });
});
it('relocates a chosen living Clone only when all three are on the board', () => {
  const h = setup();
  clone(h, 1, 'n5');
  clone(h, 2, 'n15');
  clone(h, 3, 'n16');
  h.attack(id('sly-monkey'));
  h.defend();
  privateChoice(h);
  h.choose('n9');
  privateChoice(h);
  expect(h.state.resolution.choice!.options).toHaveLength(3);
  h.choose('p0:ally-3');
  expect(h.fighter().position).toBe('n9');
  expect(h.fighter('p0:ally-3').position).toBe('n0');
  expect(h.fighter().hp).toBe(17);
});
it('Sly Monkey leaves a reserve Clone in the vacated space and resets its physical state', () => {
  const h = setup();
  const f = h.fighter('p0:ally-1');
  f.statuses = [{ id: 'burn', stacks: 1 }];
  h.attack(id('sly-monkey'));
  h.defend();
  h.choose('n9');
  h.choose(f.id);
  expect(h.fighter().position).toBe('n9');
  expect(h.fighter(f.id)).toMatchObject({ defeated: false, hp: 1, position: 'n0', statuses: [] });
});
it('Sly Monkey cannot trigger when a Clone plays it, or after cancellation', () => {
  const h = setup();
  clone(h, 1, 'n0');
  h.fighter().position = 'n5';
  h.attack(id('sly-monkey'), 'p0:ally-1');
  h.defend();
  expect(h.state.resolution.choice).toBeNull();
  const k = setup();
  k.attack(id('sly-monkey'));
  k.defend('medusa-feint');
  expect(k.state.resolution.choice).toBeNull();
});
it('Sly Monkey does nothing when no empty zone destination exists', () => {
  const h = setup((d) => {
    d.map = {
      ...d.map,
      nodes: ['n0', 'n1', 'n2', 'n3'],
      portals: [],
      edges: [
        ['n0', 'n1'],
        ['n1', 'n2'],
        ['n2', 'n3'],
      ],
      zones: { n0: ['a'], n1: ['a'], n2: ['b'], n3: ['b'] },
      spawns: { 2: ['n0', 'n1'], 4: ['n0', 'n1', 'n2', 'n3'] },
    };
  });
  h.attack(id('sly-monkey'));
  h.defend();
  expect(h.state.resolution.choice).toBeNull();
  expect(h.fighter().position).toBe('n0');
  expect(h.state.fighters.filter((f) => f.role === 'ally' && !f.defeated)).toHaveLength(0);
});
it('Infinite Strikes counts other friendly adjacent fighters and gains an action', () => {
  const h = setup();
  clone(h, 1, 'n2');
  clone(h, 2, 'n3');
  clone(h, 3, 'n20');
  const adjacent = h.state.fighters.filter(
    (f) =>
      f.player === 'p0' &&
      f.role === 'ally' &&
      h.defs.map.edges.some(
        ([a, b]) => (a === 'n1' && b === f.position) || (b === 'n1' && a === f.position),
      ),
  ).length;
  h.attack(id('infinite-strikes'));
  h.defend();
  expect(h.state.revealed!.damage).toBe(2 + adjacent);
  expect(h.state.actions).toBe(2);
});
it.each([null, 'guard', 'adapt', 'medusa-feint'])(
  'Tricked You requires an uncancelled defended attack (%s)',
  (defense) => {
    const h = setup();
    h.attack(id('ruyi-jingo-bang'));
    h.defend(defense);
    if (defense && defense !== 'medusa-feint') {
      expect(h.state.phase).toMatchObject({
        type: 'awaiting-defense',
        bonus: { name: 'Tricked You', value: 4 },
      });
      h.defend();
      expect(h.state.revealed!.damage).toBe(4);
    } else expect(h.state.phase.type).toBe('taking-actions');
  },
);
it.each([true, false])(
  'Taunting Laughter lets the opponent pay or decline privately (pay=%s)',
  (pay) => {
    const h = setup();
    h.attack(id('taunting-laughter'));
    h.defend('guard');
    privateChoice(h);
    h.choose(pay ? h.state.resolution.choice!.options[0].id : '$decline');
    expect(h.state.revealed!.damage).toBe(pay ? 0 : 3);
  },
);
it('Taunting Laughter still offers payment without a defense and ignores empty hands', () => {
  const h = setup();
  h.attack(id('taunting-laughter'));
  h.defend();
  expect(h.state.resolution.choice!.player).toBe('p1');
  h.choose('$decline');
  expect(h.state.revealed!.damage).toBe(3);
  const k = setup();
  k.state.players[1].hand = [];
  k.attack(id('taunting-laughter'));
  k.defend();
  expect(k.state.revealed!.damage).toBe(3);
});
it('Ox Form is uncancellable and delegates defense BOOST to its opponent', () => {
  const h = setup();
  h.attack(id('ox-form'));
  h.defend('medusa-feint');
  privateChoice(h);
  expect(h.state.resolution.choice!.player).toBe('p1');
  const c = h.state.resolution.choice!.options.find((o) => o.card)!;
  const boost = h.defs.cards[c.card!.definition].boost;
  h.choose(c.id);
  expect(h.state.revealed!.damage).toBe(Math.max(0, 7 - 2 - boost));
});
it('Ox Form never offers a BOOST without an opposing card', () => {
  const h = setup();
  h.attack(id('ox-form'));
  h.defend();
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.revealed!.damage).toBe(7);
});
it('Tortoise Form grants a distinct, additive attack BOOST after Arthur’s special', () => {
  const h = setup(() => {}, ['sun-wukong', 'king-arthur']);
  h.attack('king-arthur-excalibur', 'p1:main', 'p0:main');
  privateChoice(h);
  h.choose(h.state.resolution.choice!.options.find((o) => o.card)!.id);
  h.defend(id('tortoise-form'), 'p0');
  privateChoice(h);
  expect(h.state.resolution.choice!.player).toBe('p1');
  h.choose(h.state.resolution.choice!.options.find((o) => o.card)!.id);
  expect(h.state.revealed!.boosts).toHaveLength(2);
});
it('Golden Chain Mail redirects combat damage, retains combat reason and awards the defender the win', () => {
  const h = setup((d) => {
    d.cards.strike.value = 7;
    d.cards[id('golden-chain-mail')].abilities!.push({
      id: 'victory',
      name: 'Victory',
      description: 'Victory',
      trigger: 'after-combat',
      when: { type: 'combat-result', result: 'won' },
      effects: [{ type: 'draw', count: 1 }],
    });
  });
  h.attack('strike', 'p1:main', 'p0:main');
  const before = h.state.players[0].hand.length;
  const outcomes = h.defend(id('golden-chain-mail'), 'p0');
  expect(h.fighter().hp).toBe(17);
  expect(h.fighter('p1:main').hp).toBe(12);
  expect(h.state.revealed!.damage).toBe(0);
  expect(h.state.players[0].hand).toHaveLength(before);
  expect(
    outcomes.some(
      (o) =>
        o.type === 'damage' && o.reason === 'combat' && o.fighter === 'p1:main' && o.amount === 3,
    ),
  ).toBe(true);
});
it('Golden Chain Mail is cancelled by Feint and never redirects after-combat ability damage', () => {
  const h = setup((d) => {
    d.cards['medusa-feint'].value = 7;
    d.cards['medusa-feint'].category = 'versatile';
  });
  h.attack('medusa-feint', 'p1:main', 'p0:main');
  h.defend(id('golden-chain-mail'), 'p0');
  expect(h.fighter().hp).toBe(14);
  expect(h.fighter('p1:main').hp).toBe(15);
});
it('Bewilderment prevents combat damage then places the exact Clone in any space', () => {
  const h = setup();
  clone(h, 1, 'n0');
  h.fighter().position = 'n5';
  h.attack('strike', 'p1:main', 'p0:ally-1');
  h.defend(id('bewilderment'), 'p0');
  expect(h.fighter('p0:ally-1').hp).toBe(1);
  privateChoice(h);
  h.choose('n20');
  expect(h.fighter('p0:ally-1').position).toBe('n20');
  expect(h.fighter().position).toBe('n5');
});
it('72 Transformations recovers only the three forms', () => {
  const h = setup();
  h.state.players[0].discard.push(
    { id: 'form', definition: id('phoenix-form') },
    { id: 'other', definition: id('sly-monkey') },
  );
  h.attack(id('72-transformations'));
  h.defend();
  privateChoice(h);
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['form']);
  h.choose();
  expect(h.state.players[0].hand.some((c) => c.id === 'form')).toBe(true);
});
it('Fiery Eyes privately selects an exact opposing card, puts it on the bottom, then both draw', () => {
  const h = setup();
  h.action(id('fiery-eyes-that-see'));
  h.choose('p1');
  privateChoice(h);
  const option = h.state.resolution.choice!.options[1],
    card = { ...option.card! };
  const oldTop = h.state.players[1].deck[0];
  const before = h.state.players.map((p) => p.hand.length);
  const outcomes = h.choose(option.id);
  expect(h.state.players[1].deck.at(-1)).toEqual(card);
  expect(h.state.players[1].hand).toContainEqual(oldTop);
  expect(h.state.players.map((p) => p.hand.length)).toEqual([before[0] + 1, before[1]]);
  expect(JSON.stringify(projectOutcomes(outcomes, 'spectator'))).not.toContain(card.id);
});
it('Fiery Eyes with an empty opposing hand still draws for both owners', () => {
  const h = setup();
  h.state.players[1].hand = [];
  h.action(id('fiery-eyes-that-see'));
  h.choose('p1');
  expect(h.state.players[1].hand).toHaveLength(1);
});
it('Phoenix Form heals Wukong rather than its Clone actor, counting only living board Clones', () => {
  const h = setup();
  clone(h);
  clone(h, 2, 'n15');
  h.fighter().hp = 10;
  h.action(id('phoenix-form'), 'p0:ally-1');
  expect(h.fighter().hp).toBe(12);
  expect(h.fighter('p0:ally-1').hp).toBe(1);
});
it('Wily Fighting damages adjacent enemies once and excludes friendly fighters', () => {
  const h = setup();
  clone(h);
  h.attack(id('wily-fighting'));
  h.defend('guard');
  expect(h.fighter('p1:main').hp).toBe(14);
  expect(h.fighter('p0:ally-1').hp).toBe(1);
});
