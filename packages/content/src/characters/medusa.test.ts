import { finishActions } from '../../../../tests/finish-actions';
import { completeDeckSelection } from '../../../../tests/complete-deck-selection';
import { describe, expect, it } from 'vitest';
import {
  createGame,
  deploymentSpaces,
  execute,
  sharesZone,
  type Command,
  type Definitions,
  type GameState,
} from '@open-boards/game';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { basic as content, characters } from '../index';
import { basic as rules } from '../../../../tests/rules-fixture';
const basic: Definitions = {
  ...content,
  characters: { ...characters, ...rules.characters },
  cards: {
    ...content.cards,
    ...rules.cards,
    'heavy-strike': { ...rules.cards.strike, id: 'heavy-strike', name: 'Heavy strike', value: 5 },
  },
};
const deckDefinitions = (character: string) =>
  basic.characters[character].deck.flatMap(({ card, count }) => Array<string>(count).fill(card));
import inventory from '../../../../docs/characters/drafts/medusa/inventory.json';

function setup(roster = ['medusa', 'vanguard']) {
  let state = createGame(
    roster.map((character, i) => ({
      id: `p${i}`,
      name: `Seat ${i}`,
      character,
      deck: deckDefinitions(character).map((definition, j) => ({ id: `p${i}-${j}`, definition })),
    })),
    basic,
  );
  const h = {
    get state() {
      return state;
    },
    fighter(id = 'p0:main') {
      return state.fighters.find((f) => f.id === id)!;
    },
    reconnect() {
      state = JSON.parse(JSON.stringify(state)) as GameState;
    },
    finishTurn(actor = 'p0') {
      const result = finishActions(state, basic, actor);
      state = result.state;
      return result;
    },
    apply(command: Command, actor = 'p0') {
      const envelope = { id: `c-${state.revision}`, revision: state.revision, command };
      const result = execute(state, actor, envelope, basic);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      expect(execute(state, actor, envelope, basic)).toMatchObject({
        ok: false,
        error: 'DUPLICATE',
      });
      return result.outcomes;
    },
    choose(option?: string) {
      h.reconnect();
      const c = state.resolution.choice!;
      return h.apply(
        { type: 'choose', choice: c.id, options: [option ?? c.options[0].id] },
        c.player,
      );
    },
    action(name: string, fighter = 'p0:main') {
      state.players[0].hand[0].definition = `medusa-${name}`;
      return h.apply({ type: 'play-action', fighter, card: state.players[0].hand[0].id });
    },
    fight(
      attack: string,
      defense: string | null = null,
      attacking = 'p0:main',
      defending = 'p1:main',
    ) {
      h.fighter(attacking).position = 'n0';
      h.fighter(defending).position = 'n1';
      const a = h.fighter(attacking).player,
        d = h.fighter(defending).player;
      state.turn = state.players.findIndex((p) => p.id === a);
      const ac = state.players.find((p) => p.id === a)!.hand[0];
      ac.definition = attack;
      const dc = state.players.find((p) => p.id === d)!.hand[0];
      if (defense) dc.definition = defense;
      h.apply({ type: 'attack', fighter: attacking, target: defending, card: ac.id }, a);
      return h.apply({ type: 'defend', card: defense ? dc.id : null }, d);
    },
    finishGroup() {
      while (state.resolution.choice?.prompt === 'Choose the next fighter') {
        h.choose();
        if (String(state.resolution.choice?.prompt) === 'Choose a destination') h.choose('$stay');
      }
    },
  };
  state = completeDeckSelection(state, basic);
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => !f.defeated && f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, basic.map)[0] },
      f.player,
    );
  }
  if (state.resolution.choice?.prompt === 'Petrifying gaze') h.choose('skip');
  return h;
}

describe('complete printed Medusa deck', () => {
  it('preserves all 30 copies, 11 designs, BOOST values, restrictions and corrected printed clauses', () => {
    expect(characters.medusa).toMatchObject({
      hp: 16,
      movement: 3,
      attackType: 'ranged',
      ally: { id: 'medusa-harpy', hp: 1, count: 3, attackType: 'melee' },
    });
    expect(deckDefinitions('medusa')).toHaveLength(30);
    expect(characters.medusa.deck).toHaveLength(11);
    for (const card of inventory.cards) {
      expect(basic.cards[card.id]).toMatchObject({
        name: card.name,
        usableBy: card.usableBy,
        category: card.category,
        value: card.value,
        boost: card.boost,
      });
      expect(characters.medusa.deck.find((entry) => entry.card === card.id)?.count).toBe(
        card.count,
      );
      for (const text of Object.values(card.sourceRules))
        expect(basic.cards[card.id].description).toContain(text);
    }
  });
  it('offers the main fighter passive at turn start with enemy-only exact fighter selection and Skip', () => {
    const h = setup(['medusa', 'medusa']);
    h.fighter('p1:main').position = 'n1';
    h.fighter('p1:ally-2').position = 'n9';
    h.finishTurn();
    h.choose('skip');
    h.finishTurn('p1');
    expect(h.state.resolution.choice?.prompt).toBe('Petrifying gaze');
    h.choose('use');
    const ids = h.state.resolution.choice!.options.map((o) => o.id);
    expect(ids).toContain('p1:ally-2');
    expect(ids.every((id) => id.startsWith('p1:'))).toBe(true);
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    h.choose('p1:ally-2');
    expect(h.fighter('p1:ally-2').defeated).toBe(true);
    expect(h.fighter().hp).toBe(16);
    expect(h.state.actions).toBe(2);
  });
  it.each(['p0:main', 'p0:ally-1'])(
    'Dash moves the exact acting fighter %s in both roles',
    (fighter) => {
      for (const defending of [false, true]) {
        const h = setup();
        h.fight(
          defending ? 'adapt' : 'medusa-dash',
          defending ? 'medusa-dash' : null,
          defending ? 'p1:main' : fighter,
          defending ? fighter : 'p1:main',
        );
        // Equal printed values leave the defending Harpy alive.
        expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
        const destination = h.state.resolution.choice!.options.find((o) => o.id !== '$stay')!.id;
        h.choose(destination);
        expect(h.fighter(fighter).position).toBe(destination);
      }
    },
  );
  it('Gaze damages only the opposing fighter on a win; a block prevents its bonus', () => {
    const h = setup();
    h.fight('medusa-gaze-of-stone');
    expect(h.fighter('p1:main').hp).toBe(5);
    const blocked = setup();
    blocked.fight('medusa-gaze-of-stone', 'guard');
    expect(blocked.fighter('p1:main').hp).toBe(15);
  });
  it.each(['p0:main', 'p0:ally-2'])(
    'A Momentary Glance can target any exact fighter in Medusa’s zone (%s)',
    (target) => {
      const h = setup();
      h.action('a-momentary-glance');
      expect(h.state.resolution.choice!.options.map((o) => o.id)).toContain(target);
      h.choose(target);
      expect(h.fighter(target).hp).toBe(target === 'p0:main' ? 14 : 0);
      expect(h.state.players[0].discard.at(-1)?.definition).toBe('medusa-a-momentary-glance');
    },
  );
  it.each([
    ['medusa-hiss-and-slither', 'p0:main', true],
    ['medusa-clutching-claws', 'p0:ally-1', true],
    ['medusa-clutching-claws', 'p0:ally-1', false],
  ] as const)(
    '%s gives the opposing owner a private discard, including a defeated Harpy’s committed effect',
    (card, fighter, defending) => {
      const h = setup();
      h.fight(
        defending ? 'strike' : card,
        defending ? card : null,
        defending ? 'p1:main' : fighter,
        defending ? fighter : 'p1:main',
      );
      expect(h.state.resolution.choice?.player).toBe('p1');
      expect(projectGame(h.state, 'p0', false).choice).toBeNull();
      const selected = h.state.resolution.choice!.options[0].id;
      h.choose(selected);
      expect(h.state.players[1].discard.some((c) => c.id === selected)).toBe(true);
      if (defending && fighter.includes('ally')) expect(h.fighter(fighter).defeated).toBe(true);
    },
  );
  it.each([false, true])(
    'Hounds moves every surviving owned Harpy once in either combat role (defending=%s)',
    (defending) => {
      const h = setup();
      h.fight(
        defending ? 'heavy-strike' : 'medusa-the-hounds-of-mighty-zeus',
        defending ? 'medusa-the-hounds-of-mighty-zeus' : null,
        defending ? 'p1:main' : 'p0:ally-1',
        defending ? 'p0:ally-1' : 'p1:main',
      );
      expect(h.state.resolution.choice?.prompt).toBe('Choose the next fighter');
      expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(
        defending ? ['p0:ally-2', 'p0:ally-3'] : ['p0:ally-1', 'p0:ally-2', 'p0:ally-3'],
      );
      h.finishGroup();
      expect(h.state.resolution.choice).toBeNull();
    },
  );
  it.each(['p0:main', 'p0:ally-1'])(
    'Winged Frenzy uses Medusa’s position after movement when played by %s',
    (fighter) => {
      const h = setup();
      Object.assign(h.fighter('p0:ally-3'), { defeated: true, hp: 0 });
      h.action('winged-frenzy', fighter);
      h.choose('p0:main');
      h.choose('n2');
      expect(h.fighter().position).toBe('n2');
      h.finishGroup();
      expect(h.state.resolution.choice?.prompt).toBe('Return a defeated ally');
      h.choose('p0:ally-3');
      expect(h.state.resolution.choice?.prompt).toBe('Choose where to return the ally');
      expect(
        h.state.resolution.choice!.options.every((o) => sharesZone(basic.map, 'n2', o.id)),
      ).toBe(true);
      expect(
        h.state.resolution.choice!.options.some((o) => !sharesZone(basic.map, 'n0', o.id)),
      ).toBe(true);
      const destination = h.state.resolution.choice!.options[0].id,
        outcomes = h.choose(destination);
      expect(outcomes).toContainEqual(
        expect.objectContaining({ type: 'revived', fighter: 'p0:ally-3', position: destination }),
      );
      expect(outcomes.some((o) => o.type === 'move' && o.fighter === 'p0:ally-3')).toBe(false);
      expect(h.fighter('p0:ally-3')).toMatchObject({
        hp: 1,
        defeated: false,
        position: destination,
      });
    },
  );
  it('Second Shot reuses a private optional BOOST and publicly discards the payment; Skip costs no card', () => {
    const h = setup();
    h.fight('medusa-second-shot-3');
    expect(h.state.resolution.choice?.prompt).toBe('Boost attack');
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    const payment = h.state.players[0].hand[0];
    const amount = basic.cards[payment.definition].boost;
    h.choose(payment.id);
    expect(h.state.revealed?.damage).toBe(3 + amount);
    expect(h.state.players[0].discard.map((card) => card.id)).toEqual([
      payment.id,
      h.state.revealed!.attack.id,
    ]);
    const skip = setup();
    skip.fight('medusa-second-shot-3');
    skip.choose('$skip');
    expect(skip.state.revealed?.damage).toBe(3);
    expect(skip.state.players[0].hand).toHaveLength(4);
  });
  it.each(['p0:main', 'p0:ally-1'])(
    'Snipe and Regroup draw for the owner of %s, including a lost defense',
    (fighter) => {
      for (const [card, defending, expected] of [
        ['snipe', false, 1],
        ['snipe', true, 1],
        ['regroup', false, 2],
        ['regroup', true, 1],
      ] as const) {
        const h = setup();
        const before = h.state.players[0].deck.length;
        h.fight(
          defending ? 'strike' : `medusa-${card}`,
          defending ? `medusa-${card}` : null,
          defending ? 'p1:main' : fighter,
          defending ? fighter : 'p1:main',
        );
        expect(h.state.players[0].deck).toHaveLength(before - expected);
      }
      const block = setup();
      const before = block.state.players[0].deck.length;
      block.fight('medusa-regroup', 'medusa-regroup', 'p1:main', fighter);
      expect(block.state.players[0].deck).toHaveLength(before - 2);
    },
  );
  it.each([
    'medusa-second-shot-3',
    'medusa-gaze-of-stone',
    'medusa-the-hounds-of-mighty-zeus',
    'medusa-feint',
  ])('Feint suppresses %s without an extra prompt or payment', (card) => {
    const h = setup(['medusa', 'medusa']);
    const attacker = card.includes('hounds') ? 'p0:ally-1' : 'p0:main';
    const outcomes = h.fight(card, 'medusa-feint', attacker);
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.revealed?.boosts).toEqual([]);
    expect(h.state.players[0].hand).toHaveLength(4);
    expect(outcomes.filter((o) => o.type === 'ability').map((o) => o.name)).toEqual(['Feint']);
    expect(h.state.revealed?.damage).toBe(Math.max(0, basic.cards[card].value - 2));
  });
  it.each([
    'medusa-dash',
    'medusa-snipe',
    'medusa-regroup',
    'medusa-the-hounds-of-mighty-zeus',
    'medusa-clutching-claws',
    'medusa-feint',
  ])('attacking Feint suppresses defending %s', (card) => {
    const h = setup(['medusa', 'medusa']);
    const defender = ['medusa-the-hounds-of-mighty-zeus', 'medusa-clutching-claws'].includes(card)
      ? 'p1:ally-1'
      : 'p1:main';
    h.fight('medusa-feint', card, 'p0:main', defender);
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.players[1].deck).toHaveLength(25);
    expect(h.state.revealed?.damage).toBe(Math.max(0, 2 - basic.cards[card].value));
  });
});

it('legally deploys every two/four-seat roster combination with Medusa and retains all three numbered Harpies', async () => {
  const ids = Object.keys(characters);
  for (const seats of [2, 4]) {
    for (let index = 0; index < ids.length ** seats; index++) {
      if (index % 256 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const roster = Array.from(
        { length: seats },
        (_, seat) => ids[Math.floor(index / ids.length ** seat) % ids.length],
      );
      const h = setup(roster);
      const positions = h.state.fighters.filter((f) => !f.defeated).map((f) => f.position);
      expect(positions.every((p) => p !== null)).toBe(true);
      expect(new Set(positions).size).toBe(positions.length);
      roster.forEach((character, seat) => {
        if (character === 'medusa')
          expect(
            h.state.fighters
              .filter((f) => f.player === `p${seat}` && f.role === 'ally')
              .map((f) => f.id),
          ).toEqual([`p${seat}:ally-1`, `p${seat}:ally-2`, `p${seat}:ally-3`]);
      });
    }
  }
}, 300000);
