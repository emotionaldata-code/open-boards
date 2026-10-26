import { finishActions } from '../../../../tests/finish-actions';
import { completeDeckSelection } from '../../../../tests/complete-deck-selection';
import { describe, expect, it } from 'vitest';
import {
  createGame,
  deploymentSpaces,
  execute,
  validateDefinitions,
  type Command,
  type Definitions,
  type GameState,
  type Outcome,
} from '@open-boards/game';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { basic as content, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import inventory from '../../../../docs/characters/bigfoot/inventory.json';

function setup(edit: (defs: Definitions) => void = () => {}, roster = ['bigfoot', 'vanguard']) {
  const defs = structuredClone({
    ...content,
    characters: { ...content.characters, ...neutral.characters },
    cards: { ...content.cards, ...neutral.cards },
  });
  edit(defs);
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
    finishTurn(actor = 'p0') {
      const result = finishActions(state, defs, actor);
      state = result.state;
      return result.outcomes;
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
      const result = h.run(command, actor);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      return result.outcomes;
    },
    choose(option?: string | string[]) {
      h.reconnect();
      const c = state.resolution.choice!;
      return h.apply(
        {
          type: 'choose',
          choice: c.id,
          options: Array.isArray(option) ? option : [option ?? c.options[0].id],
        },
        c.player,
      );
    },
    action(slug: string, fighter = 'p0:main') {
      const card = state.players[0].hand[0];
      card.definition = `bigfoot-${slug}`;
      return h.apply({ type: 'play-action', fighter, card: card.id });
    },
    attack(slug: string, attacking = 'p0:main', defending = 'p1:main') {
      h.fighter(attacking).position = 'n0';
      h.fighter(defending).position = 'n1';
      const actor = h.fighter(attacking).player;
      state.turn = state.players.findIndex((p) => p.id === actor);
      const card = state.players[state.turn].hand[0];
      card.definition = slug;
      return h.apply(
        { type: 'attack', fighter: attacking, target: defending, card: card.id },
        actor,
      );
    },
    defend(slug: string | null = null, actor = 'p1') {
      const p = state.players.find((p) => p.id === actor)!;
      if (slug) p.hand[0].definition = slug;
      return h.apply({ type: 'defend', card: slug ? p.hand[0].id : null }, actor);
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
  h.fighter('p0:ally-1').position = 'n21';
  return h;
}

function privateChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const c = h.state.resolution.choice!;
  const before = structuredClone(h.state);
  const opponent = c.player === 'p0' ? 'p1' : 'p0';
  expect(projectGame(h.state, opponent, false).choice).toBeNull();
  expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
  const command: Command = { type: 'choose', choice: c.id, options: [c.options[0].id] };
  expect(h.run(command, opponent)).toMatchObject({ ok: false, error: 'ILLEGAL' });
  expect(h.run({ ...command, options: ['$forged'] }, c.player).ok).toBe(false);
  expect(h.run({ ...command, options: [c.options[0].id, c.options[0].id] }, c.player).ok).toBe(
    false,
  );
  expect(execute(h.state, c.player, { id: 'stale', revision: -1, command }, h.defs)).toMatchObject({
    error: 'STALE',
  });
  expect(h.state).toEqual(before);
}

describe('complete printed Bigfoot deck', () => {
  it('preserves all source quantities, values, BOOSTs, restrictions, stats and rules', () => {
    validateDefinitions(content);
    expect(deckDefinitions('bigfoot')).toHaveLength(30);
    expect(content.characters.bigfoot).toMatchObject({
      hp: 16,
      movement: 3,
      attackType: 'melee',
      ally: { count: 1, hp: 6, attackType: 'melee' },
    });
    expect(content.characters.bigfoot.deck).toHaveLength(11);
    for (const card of inventory.cards) {
      const { id, name, category, usableBy, value, boost, count } = card;
      expect(content.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(deckDefinitions('bigfoot').filter((id) => id === card.id)).toHaveLength(count);
      for (const text of Object.values(card.sourceRules))
        expect(content.cards[id].description).toContain(text);
    }
  });

  it.each(['MAIN', 'ALLY'] as const)(
    'rejects every %s card played by the wrong fighter atomically',
    (tag) => {
      for (const card of inventory.cards.filter((c) => c.usableBy === tag)) {
        const h = setup(),
          wrong = tag === 'MAIN' ? 'p0:ally-1' : 'p0:main';
        const instance = h.state.players[0].hand[0];
        instance.definition = card.id;
        h.fighter(wrong).position = 'n0';
        h.fighter('p1:main').position = 'n1';
        const before = structuredClone(h.state);
        const command: Command =
          card.category === 'action'
            ? { type: 'play-action', fighter: wrong, card: instance.id }
            : { type: 'attack', fighter: wrong, target: 'p1:main', card: instance.id };
        expect(h.run(command).ok).toBe(false);
        expect(h.state).toEqual(before);
      }
    },
  );

  it.each(['use', 'skip'])(
    'Loner by Nature offers the owner a private optional draw (%s)',
    (option) => {
      const h = setup();
      h.fighter().position = 'n0';
      h.fighter('p1:main').position = 'n22';
      h.state.actions = 1;
      h.apply({ type: 'maneuver' });
      h.apply({ type: 'finish-maneuver' });
      privateChoice(h);
      expect(h.state.resolution.choice?.prompt).toBe('Loner by Nature');
      const hand = h.state.players[0].hand.length;
      h.choose(option);
      expect(h.state.players[0].hand).toHaveLength(hand + (option === 'use' ? 1 : 0));
      expect(h.state.turn).toBe(1);
    },
  );

  it.each(['p1:main', 'p1:ally-1'])(
    'an opposing hero or ally in any shared zone blocks Loner (%s)',
    (enemy) => {
      const h = setup(() => {}, ['bigfoot', 'bigfoot']);
      h.fighter().position = 'n0';
      h.fighter('p1:main').position = 'n22';
      h.fighter('p1:ally-1').position = 'n23';
      h.fighter(enemy).position = 'n1';
      h.state.actions = 1;
      h.apply({ type: 'maneuver' });
      h.apply({ type: 'finish-maneuver' });
      expect(h.state.resolution.choice).toBeNull();
      expect(h.state.turn).toBe(1);
    },
  );

  it('Loner ignores friendly Jackalope and defeated opponents, then checks the hand limit after drawing', () => {
    const h = setup(() => {}, ['bigfoot', 'bigfoot']);
    h.fighter().position = 'n0';
    h.fighter('p0:ally-1').position = 'n5';
    h.fighter('p1:main').position = 'n22';
    h.fighter('p1:ally-1').position = 'n1';
    h.fighter('p1:ally-1').hp = 0;
    h.fighter('p1:ally-1').defeated = true;
    h.finishTurn();
    privateChoice(h);
    expect(h.state.phase.type).not.toBe('discarding');
    h.choose('use');
    expect(h.state.players[0].hand).toHaveLength(8);
    expect(h.state.phase.type).toBe('discarding');
    h.apply({ type: 'discard', cards: [h.state.players[0].hand[0].id] });
    expect(h.state.players[0].hand).toHaveLength(7);
    expect(h.state.turn).toBe(1);
  });

  it.each(['n0', 'n2'])(
    'a fighter in either zone of Bigfoot’s multizone space blocks Loner (%s)',
    (space) => {
      const h = setup();
      h.fighter().position = 'n1';
      h.fighter('p1:main').position = space;
      h.finishTurn();
      expect(h.state.resolution.choice).toBeNull();
      expect(h.state.turn).toBe(1);
    },
  );

  it('the opponent’s turn end never invokes Bigfoot’s draw', () => {
    const h = setup();
    h.state.turn = 1;
    h.state.actions = 1;
    h.apply({ type: 'maneuver' }, 'p1');
    h.apply({ type: 'finish-maneuver' }, 'p1');
    expect(h.state.turn).toBe(0);
    expect(h.state.resolution.choice).toBeNull();
  });

  it('Larger Than Life has its printed six attack without effects', () => {
    const h = setup();
    h.attack('bigfoot-larger-than-life');
    h.defend();
    expect(h.state.revealed?.damage).toBe(6);
    expect(h.state.resolution.choice).toBeNull();
  });

  it('Savagery hits every adjacent fighter, including Jackalope, but not Bigfoot or distant pieces', () => {
    const h = setup(() => {}, ['bigfoot', 'bigfoot']);
    h.fighter('p0:ally-1').position = 'n5';
    h.fighter('p1:ally-1').position = 'n13';
    h.attack('bigfoot-savagery');
    h.defend();
    expect(h.fighter().hp).toBe(16);
    expect(h.fighter('p0:ally-1').hp).toBe(5);
    expect(h.fighter('p1:main').hp).toBe(11);
    expect(h.fighter('p1:ally-1').hp).toBe(6);
  });

  it.each(['bigfoot-feint', 'bigfoot-it-s-just-your-imagination', 'guard'])(
    'Savagery causes no splash after cancellation or a blocked attack (%s)',
    (defense) => {
      const h = setup((d) => {
        d.cards.guard.value = 5;
      });
      h.fighter('p0:ally-1').position = 'n5';
      h.attack('bigfoot-savagery');
      h.defend(defense);
      expect(h.fighter('p0:ally-1').hp).toBe(6);
    },
  );

  it.each(['p0:main', 'p0:ally-1'])(
    'Hoax moves exactly its acting fighter %s through enemies with private recovery',
    (actor) => {
      const h = setup();
      h.attack('bigfoot-hoax', actor);
      h.defend();
      privateChoice(h);
      const options = h.state.resolution.choice!.options.map((o) => o.id);
      expect(options).toContain('n2');
      expect(options).not.toContain('n1');
      h.choose('n2');
      expect(h.fighter(actor).position).toBe('n2');
    },
  );

  it('Crash Through the Trees moves only Bigfoot up to five through enemies, with Stay and no occupied endpoint', () => {
    const h = setup();
    h.fighter().position = 'n0';
    h.fighter('p1:main').position = 'n1';
    h.action('crash-through-the-trees');
    privateChoice(h);
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain('$stay');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain('n1');
    h.choose('n2');
    expect(h.fighter().position).toBe('n2');
    expect(h.fighter('p0:ally-1').position).toBe('n21');
  });

  it.each(['p0:main', 'p1:main'])(
    'Jackalope Horns moves Jackalope then damages the exact adjacent friendly/enemy %s',
    (target) => {
      const h = setup();
      h.fighter('p0:ally-1').position = 'n0';
      h.fighter(target).position = 'n2';
      const hp = h.fighter(target).hp;
      h.action('jackalope-horns', 'p0:ally-1');
      privateChoice(h);
      h.choose('n1');
      privateChoice(h);
      expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain(target);
      h.choose(target);
      expect(h.fighter(target).hp).toBe(hp - 2);
      expect(h.fighter('p0:ally-1').position).toBe('n1');
    },
  );

  it('Jackalope Horns can Stay and has no damage prompt when no adjacent fighter remains', () => {
    const h = setup();
    h.action('jackalope-horns', 'p0:ally-1');
    h.choose('$stay');
    expect(h.state.resolution.choice).toBeNull();
  });

  it.each(['p0:main', 'p0:ally-1'])(
    'Disengage places only the playing fighter %s in an empty shared-zone space',
    (actor) => {
      const h = setup();
      h.attack('bigfoot-disengage', actor);
      h.defend();
      privateChoice(h);
      const options = h.state.resolution.choice!.options.map((o) => o.id);
      expect(options).not.toContain('$stay');
      expect(options).not.toContain('n0');
      expect(options).not.toContain('n1');
      expect(options).not.toContain('n22');
      h.choose('n5');
      expect(h.fighter(actor).position).toBe('n5');
    },
  );

  it.each(['self', 'opponent'])(
    'Skirmish lets the winner move the chosen combatant (%s)',
    (target) => {
      const h = setup();
      h.attack('bigfoot-skirmish');
      h.defend();
      privateChoice(h);
      h.choose(target);
      privateChoice(h);
      h.choose(target === 'self' ? 'n5' : 'n2');
      expect(h.fighter(target === 'self' ? 'p0:main' : 'p1:main').position).toBe(
        target === 'self' ? 'n5' : 'n2',
      );
    },
  );

  it('Skirmish opens no movement choice after a loss and Feint cancels Hoax', () => {
    const h = setup();
    h.attack('bigfoot-skirmish');
    h.defend('bigfoot-hoax');
    h.choose('$stay');
    expect(h.state.resolution.choice).toBeNull();
    const g = setup();
    g.attack('bigfoot-hoax');
    g.defend('bigfoot-feint');
    expect(g.state.resolution.choice).toBeNull();
  });

  it.each(['p0:main', 'p0:ally-1'])(
    'Momentous Shift uses the exact %s position at turn start',
    (actor) => {
      for (const changed of [false, true]) {
        const h = setup();
        h.fighter(actor).position = 'n0';
        h.state.resolution.turnPositions[actor] = changed ? 'n5' : 'n0';
        h.attack('bigfoot-momentous-shift', actor);
        h.defend();
        expect(h.state.revealed?.damage).toBe(changed ? 5 : 3);
      }
    },
  );

  it.each(['guard', null])('Regroup draws once on a loss and twice on a win (%s)', (defense) => {
    const h = setup();
    h.attack('bigfoot-regroup');
    const count = h.state.players[0].hand.length;
    h.defend(defense);
    expect(h.state.players[0].hand).toHaveLength(count + (defense ? 1 : 2));
  });

  it('a defeated Jackalope resolves committed Regroup for its living owner', () => {
    const h = setup((d) => {
      d.cards.strike.value = 10;
    });
    h.attack('strike', 'p1:main', 'p0:ally-1');
    const count = h.state.players[0].hand.length;
    h.defend('bigfoot-regroup', 'p0');
    expect(h.fighter('p0:ally-1').defeated).toBe(true);
    expect(h.state.players[0].hand).toHaveLength(count);
  });
});

describe('Bigfoot roster deployment', () => {
  it(
    'retains full ally counts across every supported two/four-seat deployment',
    { timeout: 120_000 },
    () => {
      const ids = Object.keys(content.characters);
      for (const count of [2, 4])
        for (let n = 0; n < ids.length ** count; n++) {
          let code = n;
          const roster = Array.from({ length: count }, () => {
            const id = ids[code % ids.length];
            code = Math.floor(code / ids.length);
            return id;
          });
          if (!roster.includes('bigfoot')) continue;
          let state = createGame(
            roster.map((character, i) => ({
              id: `p${i}`,
              name: `Seat ${i}`,
              character,
              deck: deckDefinitions(character).map((definition, j) => ({
                id: `p${i}-${j}`,
                definition,
              })),
            })),
            content,
          );
          state = completeDeckSelection(state, content);
          while (state.phase.type === 'placing-allies') {
            const f = state.fighters.find((f) => f.position === null)!;
            const position = deploymentSpaces(state, f.id, content.map)[0];
            expect(position).toBeDefined();
            const result = execute(
              state,
              f.player,
              {
                id: `deploy-${state.revision}`,
                revision: state.revision,
                command: { type: 'place-ally', fighter: f.id, position },
              },
              content,
            );
            if (!result.ok) throw new Error(result.message);
            state = result.state;
          }
          expect(state.fighters.every((f) => f.position !== null)).toBe(true);
        }
    },
  );
});
