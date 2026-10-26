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
import inventory from '../../../../docs/characters/darth-vader/inventory.json';

function setup(
  edit: (defs: Definitions) => void = () => {},
  roster = ['darth-vader', 'vanguard'],
  keepStartChoice = false,
) {
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
      card.definition = `darth-vader-${slug}`;
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
  if (!keepStartChoice && state.resolution.choice?.prompt.startsWith('Discard')) h.choose([]);
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

const prefix = 'darth-vader-';
const id = (name: string) => prefix + name;

describe('complete Darth Vader source deck', () => {
  it('preserves every quantity, printed value, BOOST, restriction and timed clause', () => {
    validateDefinitions(content);
    expect(content.characters['darth-vader']).toMatchObject({
      hp: 20,
      movement: 2,
      attackType: 'melee',
    });
    expect(content.characters['darth-vader'].ally).toBeUndefined();
    expect(deckDefinitions('darth-vader')).toHaveLength(30);
    expect(content.characters['darth-vader'].deck).toHaveLength(12);
    for (const source of inventory.cards) {
      const card = Object.values(content.cards).find((c) => c.name === source.title)!;
      expect(card).toMatchObject({
        usableBy: 'MAIN',
        value: source.value ?? 0,
        boost: source.boost,
      });
      expect(deckDefinitions('darth-vader').filter((c) => c === card.id)).toHaveLength(
        source.quantity,
      );
      for (const clause of [
        source.basicText,
        source.immediateText,
        source.duringText,
        source.afterText,
      ])
        if (clause) expect(card.description).toContain(clause.trim());
    }
  });
  it('offers one private payment at turn start, supports skipping and exposes no continuations', () => {
    const h = setup(() => {}, undefined, true);
    privateChoice(h);
    const view = projectGame(h.state, 'p0', false);
    expect(JSON.stringify(view)).not.toContain('continuations');
    h.choose([]);
    expect(h.state.phase.type).toBe('taking-actions');
    expect(h.state.players[0].hand).toHaveLength(5);
  });
  it('pays before choosing an exact friendly or enemy fighter, retaining BOOST after JSON recovery', () => {
    const h = setup(() => {}, ['darth-vader', 'medusa'], true);
    // First turn starts after all Harpies have deployed.
    const card = h.state.players[0].hand[0];
    card.definition = id('i-have-you-now');
    h.fighter('p1:ally-2').position = 'n1';
    h.fighter('p1:main').position = 'n13';
    h.choose(card.id);
    expect(h.state.players[0].discard.map((c) => c.id)).toContain(card.id);
    privateChoice(h);
    const options = h.state.resolution.choice!.options.map((o) => o.id);
    expect(options).toContain('p0:main');
    expect(options).toContain('p1:ally-2');
    expect(options).not.toContain('p1:main');
    h.choose('p1:ally-2');
    expect(h.fighter('p1:ally-2').defeated).toBe(true);
    expect(h.fighter('p1:main').hp).toBe(16);
  });
  it('can target Vader himself and skips the target prompt if no card was discarded', () => {
    const h = setup(() => {}, undefined, true);
    const card = h.state.players[0].hand[0];
    card.definition = id('i-have-you-now');
    h.choose(card.id);
    h.choose('p0:main');
    expect(h.fighter().hp).toBe(17);
  });
  it('uses the attack value 4 and suppresses every pending opposing card effect', () => {
    const h = setup((defs) => {
      defs.cards.guard.abilities = [
        {
          id: 'guard-draw',
          name: 'Guard draw',
          description: 'Draw',
          trigger: 'after-combat',
          effects: [{ type: 'draw', count: 2 }],
        },
      ];
    });
    h.attack(id('dark-lords-presence'));
    h.defend('guard');
    expect(h.fighter('p1:main').hp).toBe(14);
    expect(h.state.players[1].hand).toHaveLength(4);
  });
  it('keeps Dark Lord’s Presence at defense 1 and wins immediate cancellation priority', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend(id('dark-lords-presence'), 'p0');
    expect(h.fighter().hp).toBe(17);
  });
  it.each([true, false])('delegates Inner Conflict only after a win (winning=%s)', (win) => {
    const h = setup();
    h.attack(id('inner-conflict'));
    h.defend(win ? null : 'guard');
    expect(h.state.resolution.choice!.player).toBe(win ? 'p1' : 'p0');
    privateChoice(h);
    h.choose('draw');
    expect(h.state.players[0].hand).toHaveLength(5);
    expect(h.state.players[1].hand).toHaveLength(win ? 6 : 5);
  });
  it('retains both owners through the delegated discard and nested JSON choices', () => {
    const h = setup();
    h.attack(id('inner-conflict'));
    h.defend();
    h.choose('discard');
    privateChoice(h);
    h.choose();
    privateChoice(h);
    h.choose();
    expect(h.state.players[0].hand).toHaveLength(3);
    expect(h.state.players[1].hand).toHaveLength(4);
  });
  it('Surrounded by Fear damages every adjacent fighter, including a third player', () => {
    const h = setup(() => {}, ['darth-vader', 'vanguard', 'ranger', 'vanguard']);
    h.fighter('p2:main').position = 'n9';
    h.fighter('p3:main').position = 'n15';
    h.attack(id('surrounded-by-fear'));
    h.defend();
    while (h.state.resolution.choice) h.choose();
    expect(h.fighter().hp).toBe(20);
    expect(h.fighter('p1:main').hp).toBe(10);
    expect(h.fighter('p2:main').hp).toBe(14);
    expect(h.fighter('p3:main').hp).toBe(15);
  });
  it('Surrounded by Fear has no damage after a loss', () => {
    const h = setup((defs) => {
      defs.cards.guard.value = 6;
    });
    h.attack(id('surrounded-by-fear'));
    h.defend('guard');
    expect(h.fighter('p1:main').hp).toBe(15);
    expect(h.state.resolution.choice).toBeNull();
  });
  it('locks adjacent opponents against movement and placement, then expires at turn end', () => {
    const h = setup((defs) => {
      defs.cards.guard.abilities = [
        {
          id: 'retreat',
          name: 'Retreat',
          description: 'Move',
          trigger: 'after-combat',
          effects: [
            { type: 'move', distance: 4 },
            { type: 'teleport', includeOrigin: true },
          ],
        },
      ];
    });
    h.attack(id('there-is-no-escape'));
    h.defend('guard');
    while (h.state.resolution.choice) {
      expect(h.state.resolution.choice.options.every((o) => ['$stay', 'n1'].includes(o.id))).toBe(
        true,
      );
      h.choose();
    }
    expect(h.fighter('p1:main').position).toBe('n1');
    h.finishTurn();
    expect(h.state.resolution.movementLocks).not.toContain('p1:main');
  });
  it('does not lock a ranged opponent outside adjacency, and Feint cancels the lock', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    h.fighter('p1:main').position = 'n13';
    h.defend(id('there-is-no-escape'), 'p0');
    expect(h.state.resolution.movementLocks ?? []).toEqual([]);
    const c = setup();
    c.attack(id('there-is-no-escape'));
    c.defend('medusa-feint');
    expect(c.state.resolution.movementLocks ?? []).toEqual([]);
  });
  it.each([0, 1, 2])(
    'All Too Easy discards random cards only at two damage (damage=%s)',
    (damage) => {
      const h = setup((defs) => {
        defs.cards.guard.value = 5 - damage;
      });
      h.attack(id('all-too-easy'));
      h.reconnect();
      h.defend('guard');
      expect(h.state.players[1].hand).toHaveLength(damage >= 2 ? 2 : 4);
      expect(h.state.resolution.choice).toBeNull();
    },
  );
  it('random discards consume the serialized seed deterministically', () => {
    const a = setup(),
      b = setup();
    a.attack(id('all-too-easy'));
    b.attack(id('all-too-easy'));
    a.reconnect();
    a.defend();
    b.defend();
    expect(a.state.players[1].discard).toEqual(b.state.players[1].discard);
  });
  it('recycles a chosen prior discard, excludes both combat commitments and creates no draw', () => {
    const h = setup();
    h.state.players[0].discard.push({ id: 'prior', definition: id('unstoppable') });
    h.attack(id('by-the-emperors-will'));
    h.defend();
    h.choose('use');
    privateChoice(h);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['prior']);
    const n = h.state.players[0].deck.length;
    h.choose('prior');
    expect(h.state.players[0].deck).toHaveLength(n + 1);
    expect(h.state.players[0].deck.some((c) => c.id === 'prior')).toBe(true);
    expect(h.state.players[0].hand).toHaveLength(4);
  });
  it.each([0, 1])('pays an additional action only when available (remaining=%s)', (actions) => {
    const h = setup();
    h.state.actions = actions + 1;
    h.attack(id('i-have-you-now'));
    h.defend();
    if (actions) {
      privateChoice(h);
      h.choose('spend');
    }
    expect(h.fighter('p1:main').hp).toBe(actions ? 6 : 12);
    expect(h.state.turn).toBe(1);
    expect(h.state.actions).toBe(2);
  });
  it('may decline the additional action and Feint prevents the payment', () => {
    const h = setup();
    h.attack(id('i-have-you-now'));
    h.defend();
    h.choose('skip');
    expect(h.state.actions).toBe(1);
    expect(h.fighter('p1:main').hp).toBe(12);
    const c = setup();
    c.attack(id('i-have-you-now'));
    c.defend('medusa-feint');
    expect(c.state.actions).toBe(1);
    expect(c.state.resolution.choice).toBeNull();
  });
  it('Form V Mastery publicly discards the top opposing card and adds twice its BOOST', () => {
    const h = setup();
    h.state.players[1].deck[0].definition = 'guard';
    const top = h.state.players[1].deck[0].id;
    h.attack('strike', 'p1:main', 'p0:main');
    const outcomes = h.defend(id('form-v-mastery'), 'p0');
    expect(h.fighter().hp).toBe(20);
    expect(h.state.players[1].discard.some((c) => c.id === top)).toBe(true);
    expect(outcomes.some((o) => o.type === 'played' && o.card.id === top)).toBe(true);
  });
  it('Form V Mastery neither draws nor exhausts an empty opposing deck, and is cancellable', () => {
    const h = setup();
    h.state.players[1].deck = [];
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend(id('form-v-mastery'), 'p0');
    expect(h.fighter().hp).toBe(16);
    expect(h.fighter('p1:main').hp).toBe(15);
    const c = setup();
    const n = c.state.players[1].deck.length;
    c.attack('medusa-feint', 'p1:main', 'p0:main');
    c.defend(id('form-v-mastery'), 'p0');
    expect(c.state.players[1].deck).toHaveLength(n);
  });
  it('draws exactly the combat damage received, including zero', () => {
    for (const damage of [0, 2]) {
      const h = setup((defs) => {
        defs.cards.strike.value = damage + 2;
      });
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend(id('power-of-the-dark-side'), 'p0');
      expect(h.state.players[0].hand).toHaveLength(4 + damage);
    }
  });
  it('Hunt Down and Destroy crosses enemies and refunds only when adjacent after moving', () => {
    const h = setup();
    h.fighter('p1:main').position = 'n1';
    h.action('hunt-down-and-destroy');
    privateChoice(h);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).not.toContain('n1');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toContain('n2');
    h.choose('n2');
    expect(h.state.actions).toBe(2);
    const c = setup();
    c.action('hunt-down-and-destroy');
    c.choose('$stay');
    expect(c.state.actions).toBe(1);
  });
  it('Meditation Chamber offers only free current-mode starting spaces including its origin', () => {
    const h = setup();
    h.action('meditation-chamber');
    privateChoice(h);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['n0']);
    h.choose('n0');
    expect(h.state.actions).toBe(2);
    expect(h.state.players[0].hand).toHaveLength(5);
    const c = setup(() => {}, ['darth-vader', 'vanguard', 'ranger', 'vanguard']);
    c.fighter('p2:main').position = 'n15';
    c.action('meditation-chamber');
    expect(c.state.resolution.choice!.options.map((o) => o.id).sort()).toEqual(['n0', 'n4']);
    c.choose('n4');
    expect(c.fighter().position).toBe('n4');
  });
  it('Unstoppable draws before healing and caps recovery at maximum health', () => {
    const h = setup();
    h.fighter().hp = 19;
    h.action('unstoppable');
    expect(h.fighter().hp).toBe(20);
    expect(h.state.players[0].hand).toHaveLength(6);
    const c = setup();
    c.fighter().hp = 3;
    c.state.players[0].deck = [];
    c.action('unstoppable');
    expect(c.fighter().defeated).toBe(true);
  });
  it('deploys all full-count allies in every two/four-seat roster containing Vader', () => {
    const ids = Object.keys(content.characters);
    for (const size of [2, 4]) {
      for (let n = 0; n < ids.length ** size; n++) {
        let code = n;
        const roster = Array.from({ length: size }, () => {
          const character = ids[code % ids.length];
          code = Math.floor(code / ids.length);
          return character;
        });
        if (!roster.includes('darth-vader')) continue;
        let state = createGame(
          Array.from({ length: size }, (_, i) => ({
            id: `p${i}`,
            name: `Seat ${i}`,
            character: roster[i],
            deck: deckDefinitions(roster[i]).map((definition, j) => ({
              id: `p${i}-${j}`,
              definition,
            })),
          })),
          content,
          13,
        );
        state = completeDeckSelection(state, content);
        while (state.phase.type === 'placing-allies') {
          const fighter = state.fighters.find((f) => f.position === null)!;
          const result = execute(
            state,
            fighter.player,
            {
              id: `deploy-${state.revision}`,
              revision: state.revision,
              command: {
                type: 'place-ally',
                fighter: fighter.id,
                position: deploymentSpaces(state, fighter.id, content.map)[0],
              },
            },
            content,
          );
          if (!result.ok) throw new Error(result.message);
          state = result.state;
        }
        expect(state.fighters.every((f) => f.position !== null)).toBe(true);
      }
    }
  }, 120000);
});
