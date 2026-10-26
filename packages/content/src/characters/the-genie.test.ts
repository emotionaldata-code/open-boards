import { completeDeckSelection } from '../../../../tests/complete-deck-selection';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createGame,
  execute,
  deploymentSpaces,
  validateDefinitions,
  type Command,
  type Definitions,
  type GameState,
} from '@open-boards/game';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { basic as content, deckDefinitions } from '../index';
import { basic as rules } from '../../../../tests/rules-fixture';
import inventory from '../../../../docs/characters/drafts/the-genie/inventory.json';

const card = (slug: string) => `the-genie-${slug}`;
function setup(roster = ['the-genie', 'vanguard'], edit: (defs: Definitions) => void = () => {}) {
  const defs: Definitions = structuredClone({
    ...content,
    characters: { ...content.characters, ...rules.characters },
    cards: {
      ...content.cards,
      ...rules.cards,
      heavy: { ...rules.cards.strike, id: 'heavy', category: 'versatile', value: 5, boost: 2 },
    },
  });
  edit(defs);
  validateDefinitions(defs);
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
  );
  const h = {
    defs,
    get state() {
      return state;
    },
    fighter(id = 'p0:main') {
      return state.fighters.find((f) => f.id === id)!;
    },
    recover() {
      state = JSON.parse(JSON.stringify(state)) as GameState;
    },
    run(command: Command, actor = 'p0') {
      return execute(
        state,
        actor,
        { id: `genie-${state.revision}`, revision: state.revision, command },
        defs,
      );
    },
    apply(command: Command, actor = 'p0') {
      const result = h.run(command, actor);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      return result.outcomes;
    },
    choose(options?: string | string[]) {
      h.recover();
      const c = state.resolution.choice!;
      return h.apply(
        {
          type: 'choose',
          choice: c.id,
          options: typeof options === 'string' ? [options] : (options ?? [c.options[0].id]),
        },
        c.player,
      );
    },
    action(slug: string) {
      const c = state.players[0].hand[0];
      c.definition = card(slug);
      return h.apply({ type: 'play-action', fighter: 'p0:main', card: c.id });
    },
    fight(attack: string, defense: string | null, reverse = false) {
      const a = reverse ? 1 : 0,
        d = 1 - a;
      h.fighter(`p${a}:main`).position = 'n0';
      h.fighter(`p${d}:main`).position = 'n1';
      state.turn = a;
      const ac = state.players[a].hand[0],
        dc = state.players[d].hand[0];
      ac.definition = attack;
      if (defense) dc.definition = defense;
      h.apply(
        { type: 'attack', fighter: `p${a}:main`, target: `p${d}:main`, card: ac.id },
        `p${a}`,
      );
      return h.apply({ type: 'defend', card: defense ? dc.id : null }, `p${d}`);
    },
    groups() {
      while (state.resolution.choice?.prompt === 'Choose the next fighter') h.choose();
    },
  };
  state = completeDeckSelection(state, defs);
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  if (state.resolution.choice) h.choose('skip');
  return h;
}

describe('complete printed Genie deck', () => {
  it('preserves the source snapshot, all 30 copies, 12 designs, values, BOOST, ownership and every clause', () => {
    validateDefinitions(content);
    expect(
      createHash('sha256')
        .update(
          readFileSync(
            new URL('../../../../docs/characters/drafts/the-genie/source.json', import.meta.url),
          ),
        )
        .digest('hex'),
    ).toBe(inventory.sourceSnapshotSha256);
    expect(content.characters['the-genie']).toMatchObject({
      hp: 16,
      movement: 3,
      attackType: 'ranged',
    });
    expect(content.characters['the-genie'].ally).toBeUndefined();
    expect(deckDefinitions('the-genie')).toHaveLength(30);
    expect(content.characters['the-genie'].deck).toHaveLength(12);
    for (const c of inventory.cards) {
      expect(content.cards[c.id]).toMatchObject({
        name: c.name,
        value: c.value,
        boost: c.boost,
        category: c.category,
        usableBy: c.usableBy,
      });
      expect(deckDefinitions('the-genie').filter((id) => id === c.id)).toHaveLength(c.count);
      for (const text of Object.values(c.sourceRules))
        expect(content.cards[c.id].description).toContain(text.replaceAll('\r\n', '\n'));
    }
  });
  it('Infinite Power pays exactly one card before gaining one action, supports Skip, and requires a nonempty hand', () => {
    const h = setup();
    expect(h.state.actions).toBe(2);
    expect(h.state.players[0].hand).toHaveLength(5);
    h.apply({ type: 'end-turn' });
    h.apply({ type: 'end-turn' }, 'p1');
    expect(h.state.resolution.choice?.prompt).toBe('Infinite Power');
    h.choose('use');
    expect(h.state.actions).toBe(2);
    expect(h.state.resolution.choice?.min).toBe(1);
    h.choose();
    expect(h.state.actions).toBe(3);
    expect(h.state.players[0].hand).toHaveLength(4);
    expect(h.state.players[0].discard).toHaveLength(1);
    h.state.players[0].hand = [];
    h.apply({ type: 'end-turn' });
    h.apply({ type: 'end-turn' }, 'p1');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.actions).toBe(2);
  });
  it('Your Wish requires a win and two cards; benefit follows the complete payment', () => {
    const h = setup();
    h.fight(card('your-wish-is-my-command'), null);
    h.choose('use');
    const choice = h.state.resolution.choice!;
    expect(choice).toMatchObject({ min: 2, max: 2, player: 'p0' });
    expect(h.run({ type: 'choose', choice: choice.id, options: [choice.options[0].id] }).ok).toBe(
      false,
    );
    expect(h.state.actions).toBe(1);
    h.choose(choice.options.slice(0, 2).map((o) => o.id));
    expect(h.state.actions).toBe(2);
    const short = setup();
    short.state.players[0].hand.splice(2);
    short.fight(card('your-wish-is-my-command'), null);
    expect(short.state.resolution.choice).toBeNull();
    expect(short.state.actions).toBe(1);
    const loss = setup();
    loss.fight(card('your-wish-is-my-command'), 'heavy');
    expect(loss.state.resolution.choice).toBeNull();
  });
  it.each([false, true])(
    'Wishing draws for the opponent first, then its owner (defending=%s)',
    (reverse) => {
      const h = setup();
      const outcomes = h.fight(
        reverse ? 'strike' : card('wishing-for-more-wishes'),
        reverse ? card('wishing-for-more-wishes') : null,
        reverse,
      );
      expect(outcomes.filter((o) => o.type === 'draw').map((o) => o.player)).toEqual(['p1', 'p0']);
      expect(h.state.players[0].hand).toHaveLength(7);
      expect(h.state.players[1].hand).toHaveLength(reverse ? 5 : 6);
    },
  );
  it('Three Wishes gains an action before choosing, draws five, and each opponent discards exactly once', () => {
    const draw = setup();
    draw.action('three-wishes');
    expect(draw.state.actions).toBe(2);
    draw.choose('cards');
    expect(draw.state.players[0].hand).toHaveLength(9);
    const h = setup(['the-genie', 'medusa', 'vanguard', 'ranger']);
    h.action('three-wishes');
    h.choose('discard');
    while (h.state.resolution.choice) {
      const c = h.state.resolution.choice;
      if (c.prompt === 'Choose the next fighter') h.choose();
      else {
        expect(c.player).not.toBe('p0');
        h.choose(c.options.slice(0, 2).map((o) => o.id));
      }
    }
    expect(h.state.players.map((p) => p.hand.length)).toEqual([4, 3, 3, 3]);
  });
  it.each([false, true])(
    'Three Wishes locks values at four against setters, modifiers, BOOST and Feint (defending=%s)',
    (reverse) => {
      for (const opposing of [card('this-is-no-parlor-trick'), card('feint'), 'heavy']) {
        const h = setup(['the-genie', 'the-genie'], (d) => {
          d.statuses!['bonus'] = {
            id: 'bonus',
            name: 'Bonus',
            maxStacks: 1,
            modifiers: { attack: 9, defense: 9 },
          };
          d.cards.heavy.abilities = [
            {
              id: 'change',
              name: 'Change',
              description: 'Change',
              trigger: 'before-combat',
              effects: [
                { type: 'modify', field: reverse ? 'defense' : 'attack', amount: 10 },
                { type: 'set-combat-value', target: 'opponent', value: 1 },
              ],
            },
          ];
        });
        h.action('three-wishes');
        h.choose('power');
        h.fighter().statuses.push({ id: 'bonus', stacks: 1 });
        h.fight(
          reverse ? opposing : card('i-grant-you-death'),
          reverse ? card('back-in-the-lamp') : opposing,
          reverse,
        );
        if (h.state.resolution.choice?.prompt === 'I Grant You Death') h.choose('skip');
        expect(h.state.revealed?.damage).toBe(
          reverse
            ? opposing === 'heavy'
              ? 1
              : 0
            : opposing === 'heavy'
              ? 0
              : Math.max(0, 4 - content.cards[opposing].value),
        );
        expect(h.fighter().statuses.some((s) => s.id === 'fixed-four')).toBe(true);
      }
    },
  );
  it('the value lock expires at the owning turn end and does not change printed BOOST', () => {
    const h = setup();
    h.action('three-wishes');
    h.choose('power');
    h.apply({ type: 'end-turn' });
    expect(h.fighter().statuses).toEqual([]);
    expect(h.defs.cards[card('three-wishes')].boost).toBe(3);
    h.fight('heavy', card('back-in-the-lamp'), true);
    expect(h.state.revealed?.damage).toBe(5);
  });
  it.each([false, true])(
    'Parlor Trick reads the exact opposing BOOST, and Feint suppresses it (defending=%s)',
    (reverse) => {
      const h = setup();
      h.fight(
        reverse ? 'heavy' : card('this-is-no-parlor-trick'),
        reverse ? card('this-is-no-parlor-trick') : 'heavy',
        reverse,
      );
      expect(h.state.revealed?.damage).toBe(reverse ? 1 : 0);
      const feint = setup(['the-genie', 'the-genie']);
      feint.fight(
        reverse ? card('feint') : card('this-is-no-parlor-trick'),
        reverse ? card('this-is-no-parlor-trick') : card('feint'),
        reverse,
      );
      expect(feint.state.revealed?.damage).toBe(reverse ? 1 : 0);
      const undefended = setup();
      undefended.fight(card('this-is-no-parlor-trick'), null);
      expect(undefended.state.revealed?.damage).toBe(1);
    },
  );
  it.each([0, 1, 4])(
    'Torment draws the resolved combat damage %s and no incidental damage',
    (damage) => {
      const h = setup();
      h.defs.cards.heavy.value = damage + 1;
      h.fight('heavy', card('prisoners-torment'), true);
      expect(h.fighter().hp).toBe(16 - damage);
      expect(h.state.players[0].hand).toHaveLength(4 + damage);
    },
  );
  it('Torment uses normal exhaustion, suppressed Torment draws nothing, and lethal combat cannot draw', () => {
    const h = setup();
    h.state.players[0].deck.splice(1);
    h.fight('heavy', card('prisoners-torment'), true);
    expect(h.state.players[0].hand).toHaveLength(5);
    expect(h.fighter().hp).toBe(6); // Four combat damage + three missing draws.
    const feint = setup(['the-genie', 'the-genie']);
    feint.fight(card('feint'), card('prisoners-torment'), true);
    expect(feint.state.players[0].hand).toHaveLength(4);
    const lethal = setup();
    lethal.fighter().hp = 1;
    lethal.fight('heavy', card('prisoners-torment'), true);
    expect(lethal.state.players[0].hand).toHaveLength(4);
    expect(lethal.state.phase.type).toBe('finished');
  });
  it.each([false, true])(
    'Sultans reveals the exact hand only to its chooser, recovers and discards an exact instance (defending=%s)',
    (reverse) => {
      const h = setup();
      h.state.players[1].hand.forEach((c) => (c.definition = 'strike'));
      h.fight(
        reverse ? 'strike' : card('ive-made-sultans-out-of-less'),
        reverse ? card('ive-made-sultans-out-of-less') : null,
        reverse,
      );
      const c = h.state.resolution.choice!;
      const selected = c.options.at(-1)!;
      expect(c.player).toBe('p0');
      expect(c.options.every((o) => !!o.card)).toBe(true);
      expect(projectGame(h.state, 'p0', false).choice?.options).toEqual(c.options);
      for (const viewer of ['p1', 'spectator']) {
        const view = projectGame(h.state, viewer, false);
        expect(view.choice).toBeNull();
        expect(JSON.stringify({ ...view, hand: [] })).not.toContain(selected.id);
      }
      const command: Command = { type: 'choose', choice: c.id, options: [selected.id] };
      const before = JSON.stringify(h.state);
      expect(h.run(command, 'p1').ok).toBe(false);
      expect(h.run({ ...command, options: ['forged'] }).ok).toBe(false);
      expect(JSON.stringify(h.state)).toBe(before);
      h.recover();
      h.apply(command);
      expect(h.state.players[1].discard.some((x) => x.id === selected.id)).toBe(true);
      expect(h.state.players[1].hand.some((x) => x.id === selected.id)).toBe(false);
      expect(h.run(command).ok).toBe(false);
    },
  );
  it('Sultans skips an empty hand and Feint prevents inspection', () => {
    const h = setup();
    h.state.players[1].hand = [];
    // A declined defense needs no defending card instance.
    const ac = h.state.players[0].hand[0];
    ac.definition = card('ive-made-sultans-out-of-less');
    h.fighter().position = 'n0';
    h.fighter('p1:main').position = 'n1';
    h.apply({ type: 'attack', fighter: 'p0:main', target: 'p1:main', card: ac.id });
    h.apply({ type: 'defend', card: null }, 'p1');
    expect(h.state.resolution.choice).toBeNull();
    const feint = setup(['the-genie', 'the-genie']);
    feint.fight(card('ive-made-sultans-out-of-less'), card('feint'));
    expect(feint.state.resolution.choice).toBeNull();
  });
  it('Imprisoned Wrath pays two cards before choosing only adjacent enemies', () => {
    const h = setup();
    h.fight(card('imprisoned-wrath'), null);
    h.choose('use');
    h.choose(h.state.resolution.choice!.options.slice(0, 2).map((o) => o.id));
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual(['p1:main']);
    h.choose('p1:main');
    expect(h.fighter('p1:main').hp).toBe(10);
    const short = setup();
    short.state.players[0].hand.splice(2);
    short.fight(card('imprisoned-wrath'), null);
    expect(short.state.resolution.choice).toBeNull();
  });
  it('I Grant You Death may damage an adjacent friendly ally, and Careful requires a loss and an enemy', () => {
    const h = setup(['the-genie', 'vanguard'], (d) => {
      d.characters['the-genie'].ally = {
        id: 'helper',
        name: 'Helper',
        count: 1,
        hp: 2,
        attackType: 'melee',
      };
    });
    h.fighter('p0:ally-1').position = 'n9'; // n9 adjacent to n0 on the content map.
    h.fight(card('i-grant-you-death'), null);
    h.choose('use');
    const ids = h.state.resolution.choice!.options.map((o) => o.id);
    expect(ids).not.toContain('p0:main');
    expect(ids).toContain('p0:ally-1');
    h.choose('p0:ally-1');
    expect(h.fighter('p0:ally-1').hp).toBe(1);
    const loss = setup();
    loss.fight(card('careful-what-you-wish-for'), 'heavy');
    expect(loss.state.resolution.choice?.options.map((o) => o.id)).toEqual(['p1:main']);
    loss.choose();
    expect(loss.fighter('p1:main').hp).toBe(14);
    const win = setup();
    win.fight(card('careful-what-you-wish-for'), null);
    expect(win.state.resolution.choice).toBeNull();
  });
  it('I Am Freed requires an empty destination and damages every adjacent fighter after placing', () => {
    const h = setup(['the-genie', 'vanguard', 'ranger', 'vanguard']);
    h.fighter('p2:main').position = 'n3';
    h.fighter('p3:main').position = 'n4';
    h.fight(card('i-am-freed'), null);
    const c = h.state.resolution.choice!;
    expect(c.options.some((o) => o.id === '$stay' || o.id === 'n0' || o.id === 'n1')).toBe(false);
    expect(h.run({ type: 'choose', choice: c.id, options: ['$stay'] }).ok).toBe(false);
    h.choose('n2');
    h.groups();
    expect(h.fighter().position).toBe('n2');
    expect(h.fighter('p1:main').hp).toBe(11); // Three combat + one adjacent.
    expect(h.fighter('p2:main').hp).toBe(14); // Adjacent n3.
    expect(h.fighter('p3:main').hp).toBe(15); // Not adjacent n4.
  });
  it('Back in the Lamp heals before attack damage and an attacking Feint cannot undo resolved healing', () => {
    const h = setup(['the-genie', 'the-genie']);
    h.fighter().hp = 8;
    const outcomes = h.fight(card('feint'), card('back-in-the-lamp'), true);
    expect(h.fighter().hp).toBe(10);
    expect(outcomes.findIndex((o) => o.type === 'heal')).toBeLessThan(
      outcomes.findIndex((o) => o.type === 'damage'),
    );
  });
  it('value locks ignore later attack BOOST and do not invent a declined defense', () => {
    const h = setup(['the-genie', 'the-genie'], (d) => {
      d.cards[card('i-grant-you-death')].abilities!.unshift({
        id: 'boost',
        name: 'Boost',
        description: 'Boost',
        trigger: 'before-combat',
        effects: [{ type: 'boost-attack' }],
      });
    });
    h.action('three-wishes');
    h.choose('power');
    h.fight(card('i-grant-you-death'), null);
    expect(h.state.resolution.choice?.prompt).toBe('Boost attack');
    h.choose();
    h.choose('skip');
    expect(h.state.revealed?.damage).toBe(4);
    const declined = setup(['the-genie', 'the-genie']);
    declined.fighter('p1:main').statuses.push({ id: 'fixed-four', stacks: 1, turns: 1 });
    declined.fight('heavy', null);
    expect(declined.state.revealed?.damage).toBe(5);
  });
  it.each(
    inventory.cards
      .filter((c) => c.category !== 'action' && c.category !== 'defense')
      .map((c) => c.id),
  )('defending Feint suppresses the pending effects of %s', (attack) => {
    const h = setup(['the-genie', 'the-genie']);
    const outcomes = h.fight(attack, card('feint'));
    expect(h.state.resolution.choice).toBeNull();
    expect(h.fighter().position).toBe('n0');
    expect(h.state.players[0].hand).toHaveLength(4);
    expect(h.state.players[1].hand).toHaveLength(4);
    expect(outcomes.filter((o) => o.type === 'ability' && o.fighter === 'p0:main')).toEqual([]);
  });
  it('validates new hooks strictly and bounds expression-based quantities', () => {
    for (const effects of [
      [{ type: 'draw', count: -1 }],
      [{ type: 'draw', count: { event: 'unknown' } }],
      [{ type: 'discard', count: 1, chooser: 'nobody' }],
      [{ type: 'teleport', optional: 'false' }],
      [{ type: 'set-combat-value', value: 4 }],
    ]) {
      const defs = structuredClone(content);
      Object.assign(defs.cards[card('three-wishes')], { effects });
      expect(() => validateDefinitions(defs)).toThrow();
    }
    const h = setup(['the-genie', 'vanguard'], (d) => {
      d.characters['the-genie'].counters = { power: { initial: 100, max: 100 } };
      d.cards[card('three-wishes')].effects = [
        { type: 'draw', count: { stat: 'counter', name: 'power' } },
      ];
    });
    h.fighter().hp = 16;
    h.action('three-wishes');
    expect(h.state.players[0].deck).toHaveLength(0);
    expect(h.state.phase.type).toBe('finished');
  });
});
