import { describe, expect, it } from 'vitest';
import {
  boostValue,
  cardEligible,
  createGame,
  deploymentSpaces,
  execute,
  fighterDefinition,
  type Command,
  type Definitions,
  type GameState,
  type Outcome,
} from '@open-boards/game';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { basic as content, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import inventory from '../../../../docs/characters/yennefer-triss/inventory.json';

const character = 'yennefer-triss';
const id = (slug: string) => `${character}-${slug}`;
function setup(
  hero: 'yennefer' | 'triss' | 'pending' = 'yennefer',
  roster = [character, 'vanguard'],
) {
  const defs: Definitions = structuredClone({
    ...content,
    characters: { ...content.characters, ...neutral.characters },
    cards: { ...content.cards, ...neutral.cards },
  });
  let state = createGame(
    roster.map((character, i) => ({
      id: `p${i}`,
      name: `Seat ${i}`,
      character,
      deck: defs.characters[character].deck
        .flatMap(({ card, count }) => Array<string>(count).fill(card))
        .map((definition, j) => ({ id: `p${i}-${j}`, definition })),
    })),
    defs,
    731,
  );
  let next = 0;
  const h = {
    defs,
    get state() {
      return state;
    },
    fighter(id = 'p0:main') {
      return state.fighters.find((f) => f.id === id)!;
    },
    reconnect() {
      state = JSON.parse(JSON.stringify(state)) as GameState;
    },
    run(command: Command, actor = 'p0') {
      return execute(
        state,
        actor,
        { id: `c-${state.revision}`, revision: state.revision, command },
        defs,
      );
    },
    apply(command: Command, actor = 'p0'): Outcome[] {
      const r = h.run(command, actor);
      if (!r.ok) throw new Error(r.message);
      state = r.state;
      return r.outcomes;
    },
    choose(options?: string | string[]) {
      h.reconnect();
      const c = state.resolution.choice!;
      return h.apply(
        {
          type: 'choose',
          choice: c.id,
          options: Array.isArray(options) ? options : [options ?? c.options[0].id],
        },
        c.player,
      );
    },
    give(definitions: string[], player = 'p0') {
      const p = state.players.find((p) => p.id === player)!;
      p.hand = definitions.map((definition) => ({ id: `${player}-test-${next++}`, definition }));
      return p.hand;
    },
    deploy() {
      while (state.phase.type === 'placing-allies') {
        const f = state.fighters.find((f) => !f.defeated && f.position === null)!;
        h.apply(
          {
            type: 'place-ally',
            fighter: f.id,
            position: deploymentSpaces(state, f.id, defs.map)[0],
          },
          f.player,
        );
      }
    },
    attack(slug: string, fighter = 'p0:main', target = 'p1:main') {
      h.fighter(fighter).position = 'n0';
      h.fighter(target).position = 'n1';
      const p = state.players.find((p) => p.id === h.fighter(fighter).player)!;
      p.hand[0].definition = slug;
      return h.apply({ type: 'attack', fighter, target, card: p.hand[0].id }, p.id);
    },
    defend(definition: string | null = null, player = 'p1') {
      const p = state.players.find((p) => p.id === player)!;
      if (definition) p.hand[0].definition = definition;
      return h.apply({ type: 'defend', card: definition ? p.hand[0].id : null }, player);
    },
    action(slug: string, fighter = 'p0:main') {
      state.players[0].hand[0].definition = id(slug);
      return h.apply({ type: 'play-action', fighter, card: state.players[0].hand[0].id });
    },
  };
  if (hero !== 'pending') {
    while (state.resolution.choice?.prompt.startsWith('Rival Heroes'))
      h.choose(hero === 'triss' ? id('triss') : character);
    h.deploy();
  }
  return h;
}
function privateChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const c = h.state.resolution.choice!;
  const other = c.player === 'p0' ? 'p1' : 'p0';
  expect(projectGame(h.state, other, false).choice).toBeNull();
  expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
  const before = structuredClone(h.state);
  const command: Command = {
    type: 'choose',
    choice: c.id,
    options: c.options.slice(0, c.min).map((o) => o.id),
  };
  expect(h.run(command, other)).toMatchObject({ ok: false, error: 'ILLEGAL' });
  expect(h.run({ ...command, options: ['$forged'] }, c.player).ok).toBe(false);
  expect(h.state).toEqual(before);
}

describe('Yennefer & Triss printed deck and setup', () => {
  it('preserves all 30 copies, eleven designs, printed values, BOOSTs, names and every source clause', () => {
    expect(deckDefinitions(character)).toHaveLength(30);
    expect(content.characters[character].deck).toHaveLength(11);
    for (const card of inventory.deck.cards) {
      const rule = content.cards[id(card.slug)];
      expect(rule).toMatchObject({
        name: card.title,
        boost: card.boost,
        value: card.value ?? 0,
        category: card.type === 'scheme' ? 'action' : card.type,
        usableBy: 'BOTH',
      });
      expect(content.characters[character].deck.find((c) => c.card === rule.id)?.count).toBe(
        card.quantity,
      );
      for (const text of [card.basicText, card.immediateText, card.duringText, card.afterText])
        if (text) expect(rule.description).toContain(text);
    }
  });
  it.each(['yennefer', 'triss'] as const)(
    'chooses %s before any cards are dealt and keeps exact identities, health and restrictions after recovery',
    (hero) => {
      const h = setup('pending');
      expect(h.state.players.every((p) => p.hand.length === 0)).toBe(true);
      privateChoice(h);
      h.choose(hero === 'triss' ? id('triss') : character);
      h.deploy();
      h.reconnect();
      const main = h.fighter(),
        ally = h.fighter('p0:ally-1');
      expect([main.hp, ally.hp]).toEqual([14, 6]);
      expect(fighterDefinition(main, h.defs).name).toBe(hero === 'triss' ? 'Triss' : 'Yennefer');
      expect(fighterDefinition(ally, h.defs).hp).toBe(6);
      expect(cardEligible(h.defs.cards[id('incinerate')], main)).toBe(hero === 'yennefer');
      expect(cardEligible(h.defs.cards[id('incinerate')], ally)).toBe(hero === 'triss');
      expect(cardEligible(h.defs.cards[id('merigolds-hailstorm')], main)).toBe(hero === 'triss');
      expect(h.state.players.every((p) => p.hand.length === 5)).toBe(true);
    },
  );
  it('chooses and legally deploys four independent pairs at full sidekick counts', () => {
    const h = setup('triss', Array<string>(4).fill(character));
    expect(h.state.fighters).toHaveLength(8);
    expect(new Set(h.state.fighters.map((f) => f.position)).size).toBe(8);
    expect(
      h.state.fighters.filter((f) => f.role === 'main').every((f) => f.definition === id('triss')),
    ).toBe(true);
  });
  it('rejects a named card played by the wrong identity without mutation', () => {
    const h = setup('triss');
    h.give([id('incinerate')]);
    h.fighter().position = 'n0';
    h.fighter('p1:main').position = 'n1';
    const before = structuredClone(h.state);
    expect(
      h.run({
        type: 'attack',
        fighter: 'p0:main',
        card: h.state.players[0].hand[0].id,
        target: 'p1:main',
      }),
    ).toMatchObject({ ok: false, error: 'ILLEGAL' });
    expect(h.state).toEqual(before);
  });
});

describe('sorceress combat rules', () => {
  it('offers Yennefer’s uncancellable BOOST immediately after defense and pays/discards exactly once', () => {
    const h = setup();
    h.give([id('echoing-blast'), 'guard']);
    h.attack(id('echoing-blast'));
    expect(h.state.phase.type).toBe('awaiting-defense');
    h.defend('medusa-feint');
    expect(h.state.resolution.choice?.prompt).toBe('Boost attack');
    privateChoice(h);
    h.choose(h.state.resolution.choice!.options[0].id);
    expect(h.state.revealed?.damage).toBe(3);
    expect(h.state.players[0].discard.filter((c) => c.definition === 'guard')).toHaveLength(1);
    expect(h.state.players[0].hand.some((c) => c.definition === id('echoing-blast'))).toBe(false);
  });
  it.each(['boost-first', 'card-first'])(
    'orders Yennefer’s immediate card and passive: %s',
    (order) => {
      const h = setup();
      h.give([id('telepathy'), 'guard']);
      h.attack(id('telepathy'));
      h.defend('guard');
      expect(h.state.resolution.choice?.prompt).toBe('Choose the next immediate effect');
      privateChoice(h);
      const c = h.state.resolution.choice!;
      h.choose(
        c.options.find(
          (o) => o.label === (order === 'boost-first' ? 'Sorceress of Vengerberg' : 'Telepathy'),
        )!.id,
      );
      if (order === 'boost-first') {
        h.choose('$skip');
        h.choose('$decline');
      } else {
        h.choose('$decline');
        h.choose('$skip');
      }
      expect(h.state.phase.type).toBe('taking-actions');
    },
  );
  it('never grants either hero special to the sidekick', () => {
    const h = setup('triss');
    h.give([id('incinerate')]);
    h.attack(id('incinerate'), 'p0:ally-1');
    h.defend();
    expect(h.state.resolution.choice?.player).not.toBe('p0');
    if (h.state.resolution.choice) h.choose('$decline');
    expect(h.state.revealed?.boosts).toHaveLength(0);
  });
  it('keeps Incinerate uncancellable and offers an exact two-card payment that ignores the whole attack', () => {
    const h = setup();
    h.give([id('incinerate'), 'guard']);
    h.give(['guard', 'adapt', 'strike'], 'p1');
    h.attack(id('incinerate'));
    h.defend('medusa-feint');
    h.choose('$skip');
    privateChoice(h);
    h.choose('pay');
    privateChoice(h);
    expect(h.state.resolution.choice).toMatchObject({ min: 2, max: 2 });
    const options = h.state.resolution.choice!.options.map((o) => o.id);
    h.choose(options);
    expect(h.state.revealed?.damage).toBe(0);
    expect(h.state.players[1].hand).toHaveLength(0);
  });
  it('does not offer a partial Incinerate payment with fewer than two cards', () => {
    const h = setup('triss');
    h.give([id('incinerate')]);
    h.give(['guard'], 'p1');
    h.attack(id('incinerate'), 'p0:ally-1');
    h.defend();
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.revealed?.damage).toBe(7);
  });
  it.each(['hand', 'health', 'deck'])(
    'delegates Hailstorm’s %s consequence to the opponent',
    (option) => {
      const h = setup('triss');
      h.give([id('merigolds-hailstorm')]);
      h.give(['guard', 'adapt', 'strike'], 'p1');
      h.attack(id('merigolds-hailstorm'));
      h.defend('guard');
      expect(h.state.resolution.choice?.player).toBe('p1');
      privateChoice(h);
      const deck = h.state.players[1].deck.length;
      h.choose(option);
      if (option === 'hand') {
        h.choose(h.state.resolution.choice!.options.map((o) => o.id));
        expect(h.state.players[1].hand).toHaveLength(0);
      }
      if (option === 'health') expect(h.fighter('p1:main').hp).toBe(11);
      if (option === 'deck') expect(h.state.players[1].deck).toHaveLength(deck - 4);
    },
  );
  it.each(['self', 'opponent'])(
    'Portal To Anywhere places the exact %s combatant then grants an action',
    (target) => {
      const h = setup('triss');
      h.give([id('portal-to-anywhere')]);
      h.attack(id('portal-to-anywhere'));
      h.defend('guard');
      privateChoice(h);
      h.choose(target === 'self' ? 'p0:main' : 'p1:main');
      privateChoice(h);
      h.choose('n10');
      expect(h.fighter(target === 'self' ? 'p0:main' : 'p1:main').position).toBe('n10');
      expect(h.state.actions).toBe(2);
    },
  );
  it.each([null, 'guard'])(
    'Echoing Blast returns only its exact instance after winning, defense=%s',
    (defense) => {
      const h = setup('triss');
      const cards = h.give([id('echoing-blast'), id('echoing-blast')]);
      const played = cards[0].id;
      h.attack(id('echoing-blast'));
      h.defend(defense);
      expect(h.state.players[0].hand.some((c) => c.id === played)).toBe(defense === null);
      expect(h.state.players[0].hand.some((c) => c.id === cards[1].id)).toBe(true);
    },
  );
  it.each([true, false])(
    'Ball Lightning discards from exactly the required owners when won=%s',
    (won) => {
      const h = setup('triss');
      h.give([id('ball-lightning'), 'guard']);
      h.give(['guard', 'adapt'], 'p1');
      h.attack(id('ball-lightning'));
      h.defend(won ? null : 'guard');
      if (!won) {
        expect(h.state.resolution.choice?.player).toBe('p0');
        h.choose();
      }
      expect(h.state.resolution.choice?.player).toBe('p1');
      h.choose();
      expect(h.state.players[0].hand).toHaveLength(won ? 1 : 0);
    },
  );
  it('Quick And Ready places the sidekick in its own zone and draws for its owner', () => {
    const h = setup('triss');
    h.give([id('quick-and-ready')]);
    h.fighter().position = 'n20';
    h.attack(id('quick-and-ready'), 'p0:ally-1');
    h.defend('guard');
    const c = h.state.resolution.choice!;
    expect(c.options.some((o) => o.id === 'n0')).toBe(true);
    h.choose('n0');
    expect(h.state.players[0].hand).toHaveLength(1);
  });
  it('Magical Barrier immediately heals the exact defending sidekick', () => {
    const h = setup();
    h.state.turn = 1;
    h.fighter('p0:ally-1').hp = 4;
    h.give([id('magical-barrier')]);
    h.give(['strike'], 'p1');
    h.attack('strike', 'p1:main', 'p0:ally-1');
    h.defend(id('magical-barrier'), 'p0');
    expect(h.fighter('p0:ally-1').hp).toBe(5);
  });
  it('Paralyzing Fetters locks card effects to the opposing printed value while retaining hero BOOST', () => {
    const h = setup();
    h.give([id('echoing-blast'), 'guard']);
    h.give([id('paralyzing-fetters')], 'p1');
    h.attack(id('echoing-blast'));
    h.defend(id('paralyzing-fetters'));
    h.choose();
    expect(h.state.revealed?.damage).toBe(3);
  });
});

describe('schemes, ongoing BOOST values and simultaneous reveals', () => {
  it('Advisor heals each living fighter, draws, then increases owner BOOST values and expires without attacking', () => {
    const h = setup('triss');
    h.give([id('advisor-to-the-king'), 'guard']);
    h.fighter().hp = 10;
    h.fighter('p0:ally-1').hp = 3;
    h.fighter().position = 'n0';
    h.fighter('p0:ally-1').position = 'n1';
    h.fighter('p1:main').position = 'n20';
    h.action('advisor-to-the-king');
    while (h.state.resolution.choice?.prompt === 'Choose the next fighter') h.choose();
    if (h.state.resolution.choice?.prompt === 'Choose a fighter') h.choose('p0:ally-1');
    expect([h.fighter().hp, h.fighter('p0:ally-1').hp]).toEqual([11, 2]);
    expect(h.state.players[0].ongoing).toHaveLength(1);
    expect(boostValue(h.state.players[0], { id: 'x', definition: 'guard' }, h.defs)).toBe(3);
    h.apply({ type: 'maneuver' });
    h.apply({ type: 'finish-maneuver' });
    expect(h.state.players[0].ongoing).toHaveLength(0);
  });
  it('Lodge keeps every commitment secret, retains revealed cards in hand, draws for all and damages all tied winners', () => {
    const h = setup();
    h.give([id('lodge-of-sorceresses'), 'guard']);
    h.give(['guard'], 'p1');
    const own = h.state.players[0].hand[1].id;
    h.action('lodge-of-sorceresses');
    privateChoice(h);
    const first = h.choose(own);
    expect(first.some((o) => o.type === 'hand-revealed')).toBe(false);
    privateChoice(h);
    expect(JSON.stringify(projectGame(h.state, 'p1', false))).not.toContain(own);
    const second = h.choose();
    expect(second.filter((o) => o.type === 'hand-revealed')).toHaveLength(2);
    expect(h.state.players[0].hand.some((c) => c.id === own)).toBe(true);
    expect(h.state.players.map((p) => p.hand.length)).toEqual([3, 3]);
    expect([h.fighter().hp, h.fighter('p1:main').hp]).toEqual([12, 13]);
  });
  it('compares actual Lodge draws, including an empty hand and a short deck', () => {
    const h = setup();
    h.give([id('lodge-of-sorceresses'), 'guard']);
    h.give([], 'p1');
    h.state.players[0].deck = h.state.players[0].deck.slice(0, 1);
    h.action('lodge-of-sorceresses');
    h.choose();
    expect(h.state.players[1].hand).toHaveLength(0);
    expect(h.fighter().hp).toBe(11); // one missing draw (2) plus one actual-draw winner damage
  });
  it('Triss’s damage happens after Lodge resolves and can target a friendly sidekick', () => {
    const h = setup('triss');
    h.fighter().position = 'n0';
    h.fighter('p0:ally-1').position = 'n1';
    h.fighter('p1:main').position = 'n20';
    h.give([id('lodge-of-sorceresses'), 'adapt']);
    h.give(['guard'], 'p1');
    h.action('lodge-of-sorceresses');
    h.choose();
    h.choose();
    expect(h.state.resolution.choice?.prompt).toBe('Choose a fighter');
    expect(h.fighter('p1:main').hp).toBe(13);
    h.choose('p0:ally-1');
    expect(h.fighter('p0:ally-1').hp).toBe(4);
  });
});

describe('chosen hero and sidekick defeat', () => {
  it.each(['yennefer', 'triss'] as const)(
    'keeps the owner active when %s’s sidekick is defeated',
    (hero) => {
      const h = setup(hero);
      h.state.turn = 1;
      h.fighter('p0:ally-1').hp = 1;
      h.give(['strike'], 'p1');
      h.attack('strike', 'p1:main', 'p0:ally-1');
      h.defend(null, 'p0');
      expect(h.fighter('p0:ally-1').defeated).toBe(true);
      expect(h.fighter().defeated).toBe(false);
      expect(h.state.players[0].eliminated).toBe(false);
      expect(h.state.phase.type).toBe('taking-actions');
    },
  );
  it.each(['yennefer', 'triss'] as const)(
    'eliminates the owner only when the chosen %s hero is defeated',
    (hero) => {
      const h = setup(hero);
      h.state.turn = 1;
      h.fighter().hp = 1;
      h.give(['strike'], 'p1');
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend(null, 'p0');
      expect(h.state.players[0].eliminated).toBe(true);
      expect(h.fighter('p0:ally-1').defeated).toBe(true);
      expect(h.state.phase).toEqual({ type: 'finished', winner: 'p1' });
    },
  );
});

it('cancels Telepathy while its immediate effect is waiting alongside Yennefer’s uncancellable special', () => {
  const h = setup();
  h.give([id('telepathy'), 'guard']);
  h.attack(id('telepathy'));
  h.defend('medusa-feint');
  expect(h.state.resolution.choice?.prompt).toBe('Boost attack');
  h.choose('$skip');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.players[1].hand).toHaveLength(4);
});
