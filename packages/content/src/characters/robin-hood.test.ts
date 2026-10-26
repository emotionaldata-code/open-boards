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
import inventory from '../../../../docs/characters/robin-hood/inventory.json';

function setup(edit: (defs: Definitions) => void = () => {}, roster = ['robin-hood', 'vanguard']) {
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
      card.definition = `robin-hood-${slug}`;
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
  for (let i = 1; i <= 4; i++) h.fighter(`p0:ally-${i}`).position = `n${20 + i}`;
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

describe('printed Robin Hood deck', () => {
  it('preserves every source design, copy, value, BOOST, restriction and clause', () => {
    validateDefinitions(content);
    expect(content.characters['robin-hood']).toMatchObject({
      hp: 13,
      movement: 2,
      attackType: 'ranged',
      ally: { count: 4, hp: 1, attackType: 'melee' },
    });
    expect(deckDefinitions('robin-hood')).toHaveLength(30);
    expect(content.characters['robin-hood'].deck).toHaveLength(11);
    for (const c of inventory.cards) {
      const { id, name, category, usableBy, value, boost, count } = c;
      expect(content.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(deckDefinitions('robin-hood').filter((id) => id === c.id)).toHaveLength(count);
      for (const text of Object.values(c.sourceRules))
        expect(content.cards[id].description).toContain(text);
    }
  });

  it.each(['MAIN', 'ALLY'] as const)('rejects all incorrect %s users atomically', (tag) => {
    for (const c of inventory.cards.filter((c) => c.usableBy === tag)) {
      const h = setup(),
        wrong = tag === 'MAIN' ? 'p0:ally-1' : 'p0:main';
      const instance = h.state.players[0].hand[0];
      instance.definition = c.id;
      h.fighter(wrong).position = 'n0';
      h.fighter('p1:main').position = 'n1';
      const before = structuredClone(h.state);
      const command: Command =
        c.category === 'action'
          ? { type: 'play-action', fighter: wrong, card: instance.id }
          : { type: 'attack', fighter: wrong, target: 'p1:main', card: instance.id };
      expect(h.run(command).ok).toBe(false);
      expect(h.state).toEqual(before);
    }
  });

  it.each(['p0:main', 'p0:ally-1', 'p0:ally-4'])(
    'Hit and Run moves only the attacking piece %s, even after Feint',
    (attacker) => {
      const h = setup();
      h.attack('robin-hood-snark', attacker);
      h.defend('robin-hood-feint');
      const positions = h.state.fighters.map((f) => f.position);
      expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
      privateChoice(h);
      const destination = h.state.resolution.choice!.options.find((o) => o.id !== '$stay')!.id;
      h.choose(destination);
      expect(h.fighter(attacker).position).not.toBe(
        positions[h.state.fighters.findIndex((f) => f.id === attacker)],
      );
      expect(h.state.fighters.filter((f) => f.id !== attacker).map((f) => f.position)).toEqual(
        positions.filter((_, i) => h.state.fighters[i].id !== attacker),
      );
      expect(h.state.resolution.choice).toBeNull();
    },
  );

  it('Hit and Run permits Stay, never triggers on defense, and never moves a defeated Outlaw', () => {
    const h = setup();
    h.attack('robin-hood-a-hunter-s-eye');
    h.defend();
    h.choose('$stay');
    expect(h.fighter().position).toBe('n0');
    const k = setup();
    k.attack('strike', 'p1:main', 'p0:ally-1');
    k.defend('robin-hood-snark', 'p0');
    expect(k.fighter('p0:ally-1').defeated).toBe(true);
    expect(k.state.resolution.choice).toBeNull();
    const m = setup();
    m.attack('robin-hood-snark', 'p0:ally-1');
    m.defs.cards.guard.abilities = [
      {
        id: 'retaliation',
        name: 'Retaliation',
        description: 'Damage the attacker.',
        trigger: 'after-combat',
        effects: [{ type: 'damage', target: 'opponent', amount: 1 }],
      },
    ];
    m.defend('guard');
    expect(m.fighter('p0:ally-1').defeated).toBe(true);
    expect(m.state.resolution.choice).toBeNull();
  });

  it.each(['discard', 'draw'])(
    'Steal From the Rich delegates %s privately to the selected opponent after its first draw',
    (option) => {
      const h = setup(undefined, ['robin-hood', 'vanguard', 'ranger', 'vanguard']);
      const before = h.state.players.map((p) => p.hand.length);
      h.action('steal-from-the-rich');
      expect(h.state.players[0].hand).toHaveLength(before[0]);
      privateChoice(h);
      h.choose('p2');
      privateChoice(h);
      expect(h.state.resolution.choice?.player).toBe('p2');
      h.choose(option);
      if (option === 'discard') {
        privateChoice(h);
        expect(h.state.resolution.choice?.player).toBe('p2');
        const card = h.state.resolution.choice!.options[0].id;
        h.choose(card);
        expect(h.state.players[2].discard.map((c) => c.id)).toContain(card);
      }
      expect(h.state.players.map((p) => p.hand.length)).toEqual([
        before[0] + (option === 'draw' ? 1 : 0),
        before[1],
        before[2] - (option === 'discard' ? 1 : 0),
        before[3],
      ]);
      expect(h.state.actions).toBe(1);
      expect(h.state.resolution.choice).toBeNull();
    },
  );

  it('Steal From the Rich draws again when the selected opponent has no hand', () => {
    const h = setup();
    h.state.players[1].hand = [];
    h.action('steal-from-the-rich');
    h.choose('p1');
    expect(h.state.players[0].hand).toHaveLength(6);
    expect(h.state.resolution.choice).toBeNull();
  });

  it.each([0, 1, 3])(
    'Disarming Shot draws exactly %i resolved combat damage before Hit and Run',
    (damage) => {
      const h = setup((d) => {
        d.cards.guard.value = 4 - damage;
      });
      h.attack('robin-hood-disarming-shot');
      const before = h.state.players[0].hand.length;
      h.defend('guard');
      expect(h.state.revealed?.damage).toBe(damage);
      expect(h.state.players[0].hand).toHaveLength(before + damage);
      expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
    },
  );

  it('Disarming Shot respects damage prevention and Feint cancellation', () => {
    const h = setup((d) => {
      d.characters.vanguard.abilities = [
        {
          id: 'ward',
          name: 'Ward',
          description: 'Prevent damage.',
          trigger: 'before-damage',
          effects: [{ type: 'cancel' }],
        },
      ];
    });
    h.attack('robin-hood-disarming-shot');
    h.defend();
    expect(h.state.players[0].hand).toHaveLength(4);
    expect(h.state.revealed?.damage).toBe(0);
    const k = setup();
    k.attack('robin-hood-disarming-shot');
    k.defend('robin-hood-feint');
    expect(k.state.players[0].hand).toHaveLength(4);
    expect(k.state.revealed?.damage).toBe(2);
    expect(k.state.resolution.choice?.prompt).toBe('Choose a destination');
  });

  it('Piercing Shot draws twice before movement and Feint cancels only the card effect', () => {
    for (const feint of [false, true]) {
      const h = setup();
      h.attack('robin-hood-piercing-shot');
      h.defend(feint ? 'robin-hood-feint' : null);
      expect(h.state.players[0].hand).toHaveLength(feint ? 4 : 6);
      expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
    }
  });

  it('Highway Robbery cancels the defense effects and ignores its full defense value immediately', () => {
    const h = setup((d) => {
      d.cards.guard.value = 7;
      d.cards.guard.abilities = [
        {
          id: 'draw',
          name: 'Draw',
          description: 'Draw.',
          trigger: 'after-combat',
          effects: [{ type: 'draw', count: 2 }],
        },
      ];
    });
    h.attack('robin-hood-highway-robbery', 'p0:ally-4');
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(2);
    expect(h.state.players[1].hand).toHaveLength(4);
    expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
  });

  it('defender-first Feint cancels both Highway Robbery effects', () => {
    const h = setup();
    h.attack('robin-hood-highway-robbery', 'p0:ally-1');
    h.defend('robin-hood-feint');
    expect(h.state.revealed?.damage).toBe(0);
    expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
  });

  it.each(['p0:main', 'p0:ally-3'])(
    'Defenders of Sherwood draws and revives exact Outlaw 4 in Robin’s zone when played by %s',
    (defender) => {
      const h = setup();
      h.fighter('p0:ally-4').hp = 0;
      h.fighter('p0:ally-4').defeated = true;
      h.attack('strike', 'p1:main', defender);
      const before = h.state.players[0].hand.length;
      h.defend('robin-hood-defenders-of-sherwood', 'p0');
      expect(h.state.players[0].hand).toHaveLength(before);
      privateChoice(h);
      expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain('p0:ally-4');
      h.choose('p0:ally-4');
      privateChoice(h);
      const destination = h.state.resolution.choice!.options[0].id;
      h.choose(destination);
      expect(h.fighter('p0:ally-4')).toMatchObject({
        hp: 1,
        defeated: false,
        position: destination,
      });
      expect(h.state.resolution.choice).toBeNull();
    },
  );

  it('Defenders of Sherwood still draws without defeated allies and Feint suppresses revival', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('robin-hood-defenders-of-sherwood', 'p0');
    expect(h.state.players[0].hand).toHaveLength(5);
    expect(h.state.resolution.choice).toBeNull();
    const k = setup();
    k.fighter('p0:ally-4').defeated = true;
    k.fighter('p0:ally-4').hp = 0;
    k.attack('robin-hood-feint', 'p1:main', 'p0:main');
    k.defend('robin-hood-defenders-of-sherwood', 'p0');
    expect(k.state.players[0].hand).toHaveLength(4);
    expect(k.fighter('p0:ally-4').defeated).toBe(true);
    expect(k.state.resolution.choice).toBeNull();
  });

  it.each([true, false])(
    'Snark tests adjacency after combat, before retreat (adjacent=%s)',
    (near) => {
      const h = setup();
      h.attack('robin-hood-snark');
      if (!near) h.fighter('p1:main').position = 'n8';
      h.defend();
      expect(h.state.players[0].hand).toHaveLength(near ? 5 : 4);
      expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
    },
  );

  it('Wily Fighting damages adjacent enemies only, before Hit and Run', () => {
    const h = setup(undefined, ['robin-hood', 'vanguard', 'ranger', 'vanguard']);
    h.attack('robin-hood-wily-fighting');
    h.fighter('p2:main').position = 'n5';
    h.fighter('p3:main').position = 'n8';
    h.fighter('p0:ally-1').position = 'n10';
    h.defend();
    expect(h.state.revealed?.damage).toBe(3);
    const hp = h.fighter('p1:main').hp;
    privateChoice(h);
    h.choose('p2:main');
    expect(h.fighter('p2:main').hp).toBe(14);
    privateChoice(h);
    h.choose('p1:main');
    expect(h.fighter('p1:main').hp).toBe(hp - 1);
    expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
    expect(h.fighter('p3:main').hp).toBe(15);
    expect(h.fighter('p0:ally-1').hp).toBe(1);
  });

  it.each([true, false])(
    'Regroup draws the winning or losing amount exactly once (won=%s)',
    (won) => {
      const h = setup();
      h.attack('robin-hood-regroup');
      h.defend(won ? null : 'guard');
      expect(h.state.players[0].hand).toHaveLength(won ? 6 : 5);
      expect(h.state.resolution.choice?.prompt).toBe('Choose a destination');
    },
  );

  it('Ambush discards randomly and adds the printed BOOST; an empty hand adds nothing', () => {
    for (const empty of [false, true]) {
      const h = setup();
      h.attack('robin-hood-ambush', 'p0:ally-2');
      if (empty) h.state.players[1].hand = [];
      else
        h.state.players[1].hand.forEach((c) => {
          c.definition = 'robin-hood-a-hunter-s-eye';
        });
      h.defend();
      expect(h.state.revealed?.damage).toBe(empty ? 2 : 6);
      expect(h.state.players[1].hand).toHaveLength(empty ? 0 : 4);
    }
  });
});
describe('Robin Hood roster deployment', () => {
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
          if (!roster.includes('robin-hood')) continue;
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

it('Hit and Run stays within two steps, permits passages and rejects occupied or distant spaces', () => {
  const h = setup();
  h.attack('robin-hood-a-hunter-s-eye');
  h.defend();
  const choice = h.state.resolution.choice!;
  expect(choice.options.map((o) => o.id).sort()).toEqual(
    ['$stay', 'n5', 'n6', 'n7', 'n9', 'n10', 'n11', 'n16'].sort(),
  );
  const before = structuredClone(h.state);
  for (const destination of ['n1', 'n12', 'n21']) {
    expect(h.run({ type: 'choose', choice: choice.id, options: [destination] }).ok).toBe(false);
    expect(h.state).toEqual(before);
  }
});

it('a defeated Outlaw can return itself with Defenders of Sherwood, retaining its stable fourth identity', () => {
  const h = setup();
  h.attack('strike', 'p1:main', 'p0:ally-4');
  h.defend('robin-hood-defenders-of-sherwood', 'p0');
  expect(h.fighter('p0:ally-4').defeated).toBe(true);
  expect(h.state.players[0].hand).toHaveLength(5);
  h.choose('p0:ally-4');
  h.choose();
  expect(h.fighter('p0:ally-4')).toMatchObject({ id: 'p0:ally-4', hp: 1, defeated: false });
  expect(h.state.resolution.choice).toBeNull();
});
