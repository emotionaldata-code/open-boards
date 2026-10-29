import { finishActions } from '../../../../tests/finish-actions';
import { describe, expect, it } from 'vitest';
import {
  createGame,
  execute,
  deploymentSpaces,
  validPath,
  reachablePaths,
  canAttack,
  sharesZone,
  validateDefinitions,
  forfeit,
  type Command,
  type Definitions,
  type GameState,
} from '@open-boards/game';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { basic as content, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import inventory from '../../../../docs/characters/invisible-man/inventory.json';

function setup(
  edit: (defs: Definitions) => void = () => {},
  roster = ['invisible-man', 'vanguard'],
  deploy = true,
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
    tokens(owner = 'p0:main') {
      return state.boardTokens!.filter((t) => t.owner === owner);
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
    apply(command: Command, actor = 'p0') {
      const r = h.run(command, actor);
      if (!r.ok) throw new Error(r.message);
      state = r.state;
      return r.outcomes;
    },
    choose(id?: string) {
      h.reconnect();
      const c = state.resolution.choice!;
      return h.apply({ type: 'choose', choice: c.id, options: [id ?? c.options[0].id] }, c.player);
    },
    action(slug: string) {
      state.players[0].hand[0].definition = `invisible-man-${slug}`;
      return h.apply({
        type: 'play-action',
        fighter: 'p0:main',
        card: state.players[0].hand[0].id,
      });
    },
    attack(slug: string, from = 'p0:main', to = 'p1:main') {
      h.fighter(from).position = 'n0';
      h.fighter(to).position = 'n1';
      const p = state.players.find((p) => p.id === h.fighter(from).player)!;
      state.turn = state.players.indexOf(p);
      p.hand[0].definition = slug;
      return h.apply({ type: 'attack', fighter: from, target: to, card: p.hand[0].id }, p.id);
    },
    defend(slug?: string, actor = 'p1') {
      const p = state.players.find((p) => p.id === actor)!;
      if (slug) p.hand[0].definition = slug;
      return h.apply({ type: 'defend', card: slug ? p.hand[0].id : null }, actor);
    },
    finishChoices() {
      let steps = 0;
      while (state.resolution.choice) {
        if (++steps > 100) throw new Error('Unbounded choice');
        const c = state.resolution.choice;
        h.choose(c.options.find((o) => ['skip', '$skip', '$stay'].includes(o.id))?.id);
      }
    },
  };
  if (deploy) {
    let steps = 0;
    while (state.phase.type === 'placing-allies' || state.resolution.choice) {
      if (++steps > 100) throw new Error('Unbounded setup');
      if (state.phase.type === 'placing-allies') {
        const f = state.fighters.find((f) => !f.defeated && f.position === null)!;
        const position = deploymentSpaces(state, f.id, defs.map)[0];
        expect(position).toBeDefined();
        h.apply({ type: 'place-ally', fighter: f.id, position }, f.player);
      } else {
        expect(state.resolution.choice!.options.length).toBeGreaterThan(0);
        h.choose(
          state.resolution.choice!.options.find((o) => ['skip', '$skip'].includes(o.id))?.id,
        );
      }
    }
  }
  return h;
}
function privacy(h: ReturnType<typeof setup>) {
  h.reconnect();
  const c = h.state.resolution.choice!;
  const before = structuredClone(h.state);
  const other = c.player === 'p0' ? 'p1' : 'p0';
  expect(projectGame(h.state, other, false).choice).toBeNull();
  expect(JSON.stringify(projectGame(h.state, other, false))).not.toContain('continuations');
  expect(h.run({ type: 'choose', choice: c.id, options: [c.options[0].id] }, other).ok).toBe(false);
  expect(h.run({ type: 'choose', choice: c.id, options: ['forged'] }, c.player).ok).toBe(false);
  expect(h.state).toEqual(before);
}

describe('Invisible Man source and setup', () => {
  it('preserves all 30 copies, 14 designs, printed BOOSTs, MAIN restrictions and source text', () => {
    validateDefinitions(content);
    expect(deckDefinitions('invisible-man')).toHaveLength(30);
    expect(content.characters['invisible-man'].deck).toHaveLength(14);
    expect(content.characters['invisible-man']).toMatchObject({
      hp: 15,
      movement: 2,
      attackType: 'melee',
      boardTokens: { count: 3 },
    });
    expect(content.characters['invisible-man'].ally).toBeUndefined();
    for (const c of inventory.deck.cards) {
      const id = `invisible-man-${c.slug}`;
      const card = content.cards[id];
      expect(content.characters['invisible-man'].deck.find((e) => e.card === id)?.count).toBe(
        c.quantity,
      );
      expect(card).toMatchObject({
        boost: c.boost,
        usableBy: 'MAIN',
        value: c.type === 'scheme' ? 0 : c.value,
      });
      for (const text of [c.basicText, c.immediateText, c.duringText, c.afterText])
        if (text) expect(card.description).toContain(text);
    }
  });
  it('places three distinct nonblocking tokens on empty spaces in the owner zone before first turn', () => {
    const h = setup(undefined, undefined, false);
    expect(h.state.phase.type).toBe('ability-choice');
    privacy(h);
    const hero = h.fighter();
    for (let i = 0; i < 3; i++) {
      const c = h.state.resolution.choice!;
      expect(
        c.options.every(
          (o) =>
            sharesZone(h.defs.map, hero.position, o.id) &&
            !h.state.fighters.some((f) => f.position === o.id),
        ),
      ).toBe(true);
      expect(c.options.some((o) => h.tokens().some((t) => t.position === o.id))).toBe(false);
      h.choose();
    }
    expect(new Set(h.tokens().map((t) => t.position)).size).toBe(3);
    expect(h.state.phase.type).toBe('taking-actions');
    expect(h.state.fighters).toHaveLength(2);
  });
  it('keeps all four owners independent and exposes only public token positions', () => {
    const h = setup(undefined, Array(4).fill('invisible-man'));
    expect(h.state.boardTokens).toHaveLength(12);
    for (const p of h.state.players) expect(h.tokens(`${p.id}:main`)).toHaveLength(3);
    expect(projectGame(h.state, 'p1', false).boardTokens).toEqual(h.state.boardTokens);
  });
  it('cleans only the eliminated owner tokens on natural defeat and forfeit', () => {
    const h = setup(undefined, ['invisible-man', 'invisible-man']);
    h.fighter('p1:main').hp = 1;
    h.attack('strike');
    h.defend();
    expect(h.tokens('p1:main')).toHaveLength(0);
    expect(h.tokens()).toHaveLength(3);
    const h2 = setup(undefined, ['invisible-man', 'invisible-man']);
    const r = forfeit(h2.state, 'p0', h2.defs);
    expect(r.state.boardTokens?.every((t) => t.owner === 'p1:main')).toBe(true);
  });
});

describe('fog movement and cover', () => {
  it('connects only the owner fog spaces for ordinary movement and never attack adjacency', () => {
    const h = setup();
    h.fighter().position = 'n0';
    h.tokens()[0].position = 'n0';
    h.tokens()[1].position = 'n24';
    expect(validPath(h.state, h.fighter(), ['n24'], h.defs.map, 1)).toBe(true);
    expect(
      reachablePaths(projectGame(h.state, 'p0', false), h.fighter(), h.defs.map, 1).n24,
    ).toEqual(['n24']);
    h.fighter('p1:main').position = 'n24';
    expect(canAttack(h.fighter(), h.fighter('p1:main'), h.defs)).toBe(false);
    expect(validPath(h.state, h.fighter(), ['n24'], h.defs.map, 1)).toBe(false);
    expect(validPath(h.state, h.fighter('p1:main'), ['n0'], h.defs.map, 1)).toBe(false);
  });
  it.each([true, false])('adds cover to an actual defense card only (fog=%s)', (fog) => {
    const h = setup();
    h.tokens().forEach((t) => (t.position = 'n24'));
    if (fog) h.tokens()[0].position = 'n1';
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('guard', 'p0');
    expect(h.fighter().hp).toBe(fog ? 15 : 14);
  });
  it('does not add defense without a card, and cover persists after Feint', () => {
    const h = setup();
    h.tokens()[0].position = 'n1';
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend(undefined, 'p0');
    expect(h.fighter().hp).toBe(11);
    const h2 = setup();
    h2.tokens()[0].position = 'n1';
    h2.attack('medusa-feint', 'p1:main', 'p0:main');
    h2.defend('invisible-man-coded-notes', 'p0');
    expect(h2.state.resolution.choice).toBeNull();
    expect(h2.fighter().hp).toBe(15);
  });
});

describe('printed combat cards', () => {
  it('Covert Preparation draws then delegates a different token, retaining privacy across reconnect', () => {
    const h = setup();
    h.attack('invisible-man-covert-preparation');
    const n = h.state.players[0].hand.length;
    h.defend();
    expect(h.state.players[0].hand.length).toBe(n + 1);
    privacy(h);
    h.choose('p0:token-1');
    h.choose('$stay');
    expect(h.state.resolution.choice?.player).toBe('p1');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain('p0:token-1');
    privacy(h);
    h.choose('p0:token-2');
    h.choose('$stay');
    expect(h.state.resolution.choice).toBeNull();
  });
  it('bounded fog movement passes through fighters and tokens and uses normal movement connections', () => {
    const h = setup();
    h.tokens()[0].position = 'n0';
    h.attack('invisible-man-covert-preparation');
    h.defend();
    h.choose('p0:token-1');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain('n1');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain('n24');
    h.choose('n1');
    expect(h.tokens()[0].position).toBe('n1');
  });
  it.each([true, false])(
    'Dreaming of Revenge damages every enemy on owner fog only when self has cover (%s)',
    (covered) => {
      const h = setup(undefined, ['invisible-man', 'medusa']);
      h.tokens().forEach((t) => (t.position = 'n24'));
      if (covered) h.tokens()[0].position = 'n0';
      h.tokens()[1].position = 'n1';
      h.fighter('p1:ally-2').position = 'n1';
      h.attack('invisible-man-dreaming-of-revenge');
      h.defend('guard');
      h.finishChoices();
      expect(h.fighter('p1:main').hp).toBe(covered ? 15 : 16);
      expect(h.fighter('p1:ally-2').defeated).toBe(covered);
      expect(h.fighter('p1:ally-1').hp).toBe(1);
    },
  );
  it.each(['discard', 'decline', 'empty'])(
    'Confound respects the opponent decision (%s)',
    (decision) => {
      const h = setup();
      if (decision === 'empty') h.state.players[1].hand = [];
      h.attack('invisible-man-confound');
      h.defend();
      if (decision !== 'empty') {
        expect(h.state.resolution.choice?.player).toBe('p1');
        if (decision === 'decline') h.choose('$decline');
      }
      if (decision === 'discard') {
        privacy(h);
        h.choose();
        expect(h.state.resolution.choice).toBeNull();
      } else {
        expect(h.state.resolution.choice?.prompt).toContain('next token');
        h.finishChoices();
        expect(h.state.resolution.choice).toBeNull();
      }
    },
  );
  it('Impossible to See blocks later card value changes while retaining other opposing effects', () => {
    const h = setup((d) => {
      d.cards.strike.abilities = [
        {
          id: 'extra',
          name: 'Extra',
          description: 'Extra',
          trigger: 'before-combat',
          effects: [
            { type: 'modify', field: 'attack', amount: 8 },
            { type: 'draw', count: 1 },
          ],
        },
      ];
    });
    h.attack('strike', 'p1:main', 'p0:main');
    const n = h.state.players[1].hand.length;
    h.defend('invisible-man-impossible-to-see', 'p0');
    expect(h.fighter().hp).toBe(15);
    expect(h.state.players[1].hand.length).toBe(n + 1);
  });
  it('Impossible to See retains fighter bonuses and loses to defender-first cancellation', () => {
    const h = setup((d) => {
      d.characters.vanguard.abilities = [
        {
          id: 'power',
          name: 'Power',
          description: 'Power',
          trigger: 'before-combat',
          effects: [{ type: 'modify', field: 'attack', amount: 6 }],
        },
      ];
    });
    h.tokens().forEach((t) => (t.position = 'n24'));
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('invisible-man-impossible-to-see', 'p0');
    expect(h.fighter().hp).toBe(11);
    const h2 = setup();
    h2.attack('invisible-man-impossible-to-see');
    h2.defend('medusa-feint');
    expect(h2.state.revealed?.damage).toBe(0);
    expect(h2.fighter('p1:main').hp).toBe(15);
  });
  it('Surprise Attack cancels immediately and relocates only fog under the actor', () => {
    const h = setup();
    h.tokens()[0].position = 'n0';
    h.attack('invisible-man-surprise-attack');
    h.defend('medusa-feint');
    expect(h.state.resolution.choice).toBeNull(); // defending Feint cancels first
    const h2 = setup();
    h2.tokens()[0].position = 'n0';
    h2.attack('invisible-man-surprise-attack');
    h2.defend('invisible-man-coded-notes');
    expect(h2.state.resolution.choice?.prompt).toBe('Choose a token');
    h2.choose();
    expect(h2.state.resolution.choice?.options.map((o) => o.id)).not.toContain('n0');
    h2.choose('n24');
    expect(h2.tokens()[0].position).toBe('n24');
  });
  it('Slip Away moves one token to an empty space then places the exact hero there', () => {
    const h = setup();
    h.attack('invisible-man-slip-away');
    h.defend();
    h.choose();
    privacy(h);
    expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain('n1');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain('n0');
    h.choose('n24');
    expect(h.fighter().position).toBe('n24');
    expect(h.tokens()[0].position).toBe('n24');
  });
  it.each([true, false])(
    'Emerge From Mist checks the turn-start snapshot, not current fog (%s)',
    (started) => {
      const h = setup();
      h.tokens().forEach((t) => (t.position = started ? 'n0' : 'n24'));
      h.fighter().position = 'n0';
      h.finishTurn();
      h.finishTurn('p1');
      h.tokens().forEach((t) => (t.position = started ? 'n24' : 'n0'));
      h.attack('invisible-man-emerge-from-mist');
      h.defend();
      expect(h.state.revealed?.damage).toBe(started ? 5 : 3);
    },
  );
  it.each(['travel', 'fog'])('Lurking draws and resolves its chosen branch (%s)', (branch) => {
    const h = setup();
    h.tokens()[0].position = 'n24';
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('invisible-man-lurking', 'p0');
    h.choose(branch);
    if (branch === 'travel') {
      expect(h.state.resolution.choice?.options.map((o) => o.id)).toContain('n24');
      h.choose('n24');
      expect(h.fighter().position).toBe('n24');
    } else {
      h.choose();
      h.choose('$stay');
      expect(h.fighter().position).toBe('n1');
    }
  });
  it('Into Thin Air finishes fighter movement before the opponent moves owner fog', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('invisible-man-into-thin-air', 'p0');
    h.choose('$stay');
    expect(h.state.resolution.choice?.player).toBe('p1');
    h.choose();
    h.choose('$stay');
    expect(h.state.resolution.choice).toBeNull();
  });
  it('Coded Notes draws three, then privately returns two cards in chosen top-to-bottom order', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    const n = h.state.players[0].hand.length;
    h.defend('invisible-man-coded-notes', 'p0');
    expect(h.state.players[0].hand.length).toBe(n + 2);
    privacy(h);
    const first = h.state.players[0].hand.at(-1)!.id;
    h.choose(first);
    privacy(h);
    expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain(first);
    const second = h.state.resolution.choice!.options[0].id;
    h.choose(second);
    expect(h.state.players[0].deck.slice(0, 2).map((c) => c.id)).toEqual([first, second]);
    expect(h.state.players[0].hand.length).toBe(n);
  });
});

describe('printed schemes', () => {
  it.each([true, false])(
    'Reign of Terror requires fog and can target any enemy (%s)',
    (covered) => {
      const h = setup();
      h.fighter().position = 'n0';
      h.tokens().forEach((t) => (t.position = covered ? 'n0' : 'n24'));
      h.action('reign-of-terror');
      if (covered) h.choose('p1:main');
      expect(h.fighter('p1:main').hp).toBe(covered ? 13 : 15);
    },
  );
  it.each([1, 2])(
    'Vanish heals, removes without defeat, ends the turn and restores placement after the off-board start snapshot (actions=%s)',
    (actions) => {
      const h = setup();
      h.state.actions = actions;
      h.fighter().hp = 10;
      h.action('vanish');
      expect(h.fighter()).toMatchObject({ hp: 11, position: null, defeated: false });
      expect(h.state.turn).toBe(1);
      expect(h.state.players[0].eliminated).toBe(false);
      expect(canAttack(h.fighter('p1:main'), h.fighter(), h.defs)).toBe(false);
      h.finishTurn('p1');
      privacy(h);
      expect(h.state.resolution.choice?.options.map((o) => o.id)).not.toContain(
        h.fighter('p1:main').position,
      );
      h.choose('n24');
      expect(h.fighter().position).toBe('n24');
      expect(h.state.resolution.turnPositions['p0:main']).toBeNull();
      expect(h.state.turn).toBe(0);
      expect(h.state.actions).toBe(2);
    },
  );
  it.each([true, false])(
    'Step Lightly deals exact adjacent damage then delegates fog movement (%s)',
    (covered) => {
      const h = setup();
      h.fighter().position = 'n0';
      h.fighter('p1:main').position = 'n1';
      h.tokens().forEach((t) => (t.position = covered ? 'n0' : 'n24'));
      h.action('step-lightly');
      h.choose('p1:main');
      expect(h.fighter('p1:main').hp).toBe(covered ? 12 : 14);
      h.choose('p1');
      expect(h.state.resolution.choice?.player).toBe('p1');
      h.choose();
      h.choose('$stay');
    },
  );
  it('Rolling Fog relocates any token and refunds exactly one action', () => {
    const h = setup();
    h.action('rolling-fog');
    h.choose('p0:token-3');
    h.choose('n24');
    expect(h.tokens()[2].position).toBe('n24');
    expect(h.state.actions).toBe(2);
    expect(h.state.players[0].discard).toHaveLength(1);
  });
});

it('deploys full allies and all tokens for every ordered two/four-seat roster containing Invisible Man', async () => {
  const ids = Object.keys(content.characters);
  for (const count of [2, 4])
    for (let n = 0; n < ids.length ** count; n++) {
      if (n % 256 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      let code = n;
      const roster = Array.from({ length: count }, () => {
        const id = ids[code % ids.length];
        code = Math.floor(code / ids.length);
        return id;
      });
      if (!roster.includes('invisible-man')) continue;
      const h = setup(undefined, roster);
      expect(
        h.state.fighters.every((f) =>
          f.role === 'ally' && content.characters[f.character].ally?.startsOffBoard
            ? f.defeated && f.position === null
            : f.position !== null,
        ),
      ).toBe(true);
      expect(h.state.boardTokens!.every((t) => t.position !== null)).toBe(true);
      for (const [i, id] of roster.entries())
        expect(
          h.state.fighters.filter((f) => f.player === `p${i}` && f.role === 'ally'),
        ).toHaveLength(content.characters[id].ally?.count ?? 0);
    }
}, 180000);

it('fog uses secret passages, passes through pieces and cannot end on another fog token', () => {
  const h = setup();
  h.tokens()[0].position = 'n7';
  h.tokens()[1].position = 'n6';
  h.tokens()[2].position = 'n24';
  h.attack('invisible-man-covert-preparation');
  h.defend();
  h.choose('p0:token-1');
  const options = h.state.resolution.choice!.options.map((o) => o.id);
  expect(options).toContain('n21');
  expect(options).not.toContain('n6');
  const before = structuredClone(h.state);
  expect(h.run({ type: 'choose', choice: h.state.resolution.choice!.id, options: ['n6'] }).ok).toBe(
    false,
  );
  expect(h.state).toEqual(before);
  h.choose('n21');
  expect(h.tokens()[0].position).toBe('n21');
});

it.each([true, false])(
  'Impossible to See preserves Arthur’s character BOOST of three (cover=%s)',
  (cover) => {
    const h = setup(undefined, ['invisible-man', 'king-arthur']);
    h.tokens().forEach((t, i) => (t.position = ['n5', 'n9', 'n24'][i]));
    if (cover) h.tokens()[0].position = 'n1';
    h.state.players[1].hand[1].definition = 'invisible-man-vanish';
    h.attack('king-arthur-excalibur', 'p1:main', 'p0:main');
    h.choose('p1-1');
    h.defend('invisible-man-impossible-to-see', 'p0');
    expect(h.fighter().hp).toBe(cover ? 15 : 14);
    expect(h.state.revealed?.boosts[0].amount).toBe(3);
  },
);

it('returning with Vanish onto fog does not enable Emerge From Mist that turn', () => {
  const h = setup();
  h.action('vanish');
  h.finishTurn('p1');
  h.choose(h.tokens()[0].position!);
  expect(h.state.resolution.turnPositions['p0:main']).toBeNull();
  h.attack('invisible-man-emerge-from-mist');
  h.defend();
  expect(h.state.revealed?.damage).toBe(3);
});

it('Vanish makes the owner dormant after the action and skips forced hand-limit discards', () => {
  const h = setup();
  for (let i = 0; i < 5; i++)
    h.state.players[0].hand.push({ id: `extra-${i}`, definition: 'adapt' });
  h.action('vanish');
  expect(h.state.resolution.dormant).toContain('p0');
  expect(h.state.players[0].hand).toHaveLength(9);
  expect(h.state.phase.type).toBe('taking-actions');
  expect(h.state.turn).toBe(1);
});
