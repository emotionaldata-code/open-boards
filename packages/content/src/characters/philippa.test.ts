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
import inventory from '../../../../docs/characters/philippa/inventory.json';

function setup(
  edit: (defs: Definitions) => void = () => {},
  roster = ['philippa', 'vanguard'],
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
      const outcomes = h.apply(
        {
          type: 'choose',
          choice: c.id,
          options: Array.isArray(option) ? option : [option ?? c.options[0].id],
        },
        c.player,
      );
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
      return outcomes;
    },
    action(slug: string, fighter = 'p0:main') {
      const card = state.players[0].hand[0];
      card.definition = `philippa-${slug}`;
      return h.apply({ type: 'play-action', fighter, card: card.id });
    },
    attack(
      slug: string,
      attacking = 'p0:main',
      defending = attacking.startsWith('p1') ? 'p0:main' : 'p1:main',
    ) {
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
  if (!keepStartChoice) state = completeDeckSelection(state, defs);
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => !f.defeated && f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  if (!keepStartChoice)
    while (state.resolution.choice?.prompt.startsWith('Curiouser')) h.choose('big');
  return h;
}

function privateChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const c = h.state.resolution.choice!;
  const before = structuredClone(h.state);
  expect(projectGame(h.state, c.player === 'p0' ? 'p1' : 'p0', false).choice).toBeNull();
  expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
  expect(h.run({ type: 'choose', choice: c.id, options: ['$forged'] }, c.player).ok).toBe(false);
  expect(h.run({ type: 'choose', choice: c.id, options: [c.options[0].id] }, 'spectator').ok).toBe(
    false,
  );
  expect(h.state).toEqual(before);
}

describe('Philippa printed deck', () => {
  it('preserves the exact source inventory, fighter stats, tags, BOOST and every timed clause', () => {
    expect(() => validateDefinitions(content)).not.toThrow();
    expect(deckDefinitions('philippa')).toHaveLength(30);
    expect(content.characters.philippa).toMatchObject({
      hp: 12,
      movement: 2,
      attackType: 'ranged',
      ally: { hp: 6, count: 1, attackType: 'melee' },
    });
    expect(content.characters.philippa.deck).toHaveLength(13);
    for (const card of inventory.deck.cards) {
      const id = `philippa-${card.slug}`;
      expect(content.characters.philippa.deck.find((entry) => entry.card === id)?.count).toBe(
        card.quantity,
      );
      expect(content.cards[id]).toMatchObject({
        name: card.title,
        value: card.value ?? 0,
        boost: card.boost,
        category: card.type === 'scheme' ? 'action' : card.type,
        usableBy: { PHILIPPA: 'MAIN', DIJKSTRA: 'ALLY', ANY: 'BOTH' }[card.characterName],
      });
      for (const text of [card.basicText, card.immediateText, card.duringText, card.afterText])
        if (text) expect(content.cards[id].description).toContain(text);
    }
  });

  it.each([0, 1, 3, 4, 5])(
    'Two Steps Ahead fills a %i-card hand to four only when offered and accepted',
    (size) => {
      const h = setup();
      h.state.players[0].hand = h.state.players[0].hand.slice(0, size);
      // End with a harmless action without drawing or changing the tested hand size.
      const id = 'end-action';
      h.defs.cards[id] = {
        id,
        name: 'End action',
        category: 'action',
        usableBy: 'MAIN',
        value: 0,
        boost: 0,
        effects: [],
      };
      h.state.players[0].hand.push({ id, definition: id });
      h.state.actions = 1;
      h.apply({ type: 'play-action', fighter: 'p0:main', card: id });
      if (size < 4) {
        privateChoice(h);
        h.choose('use');
        expect(h.state.players[0].hand).toHaveLength(4);
      } else expect(h.state.resolution.choice).toBeNull();
      expect(h.state.turn).toBe(1);
    },
  );

  it('Backup Plan sets health downward as well as upward and never affects Dijkstra', () => {
    const h = setup();
    h.action('backup-plan');
    privateChoice(h);
    h.choose('health');
    expect(h.fighter().hp).toBe(5);
    expect(h.fighter('p0:ally-1').hp).toBe(6);
    const k = setup();
    k.fighter().hp = 1;
    k.action('backup-plan');
    k.choose('health');
    expect(k.fighter().hp).toBe(5);
    const d = setup();
    d.action('backup-plan');
    d.choose('draw');
    expect(d.state.players[0].hand).toHaveLength(7);
  });

  it('Dijkstra privately chooses an opponent who reveals exactly four; only those can be discarded', () => {
    const h = setup();
    h.action('spymasters-ruse', 'p0:ally-1');
    privateChoice(h);
    h.choose('p1');
    const excluded = h.state.players[1].hand.at(-1)!.id;
    for (let i = 0; i < 4; i++) {
      privateChoice(h);
      expect(h.state.resolution.choice!.player).toBe('p1');
      h.choose();
    }
    privateChoice(h);
    const c = h.state.resolution.choice!;
    expect(c.player).toBe('p0');
    expect(c.options).toHaveLength(4);
    expect(c.options.some((o) => o.id === excluded)).toBe(false);
    h.choose(c.options.slice(0, 2).map((o) => o.id));
    expect(h.state.players[1].discard).toHaveLength(2);
    expect(h.state.players[1].hand).toHaveLength(5);
  });

  it.each([0, 1, 2, 3])('Spymaster’s Ruse does what it can with %i cards', (count) => {
    const h = setup();
    h.state.players[1].hand = h.state.players[1].hand.slice(0, count);
    h.action('spymasters-ruse', 'p0:ally-1');
    h.choose('p1');
    for (let i = 0; i < count; i++) h.choose();
    if (count)
      h.choose(h.state.resolution.choice!.options.slice(0, Math.min(2, count)).map((o) => o.id));
    expect(h.state.players[1].discard).toHaveLength(Math.min(2, count));
    expect(h.state.players[1].hand).toHaveLength(count - Math.min(2, count) + 2);
  });

  it('Polymorphy remains public, replaces the previous copy, and gives both fighters move 5 plus BOOST', async () => {
    const { maneuverMovement, movement } = await import('@open-boards/game');
    const h = setup();
    h.action('polymorphy');
    privateChoice(h);
    h.choose('n0');
    expect(h.state.players[0].ongoing).toHaveLength(1);
    expect(movement(h.fighter(), h.defs, h.state)).toBe(5);
    expect(movement(h.fighter('p0:ally-1'), h.defs, h.state)).toBe(5);
    h.apply({ type: 'maneuver' });
    const card = h.state.players[0].hand[0];
    card.definition = 'philippa-polymorphy';
    h.apply({ type: 'boost-maneuver', card: card.id });
    expect(maneuverMovement(h.state, h.fighter(), h.defs)).toBe(8);
    h.fighter('p1:main').position = 'n1';
    h.apply({ type: 'finish-maneuver' });
    expect(h.state.players[0].ongoing).toHaveLength(1);
    h.finishTurn('p1');
    h.action('polymorphy');
    h.choose('n0');
    expect(h.state.players[0].ongoing).toHaveLength(1);
    expect(
      h.state.players[0].discard.filter((c) => c.definition === 'philippa-polymorphy'),
    ).toHaveLength(2);
  });

  it('Polymorphy expires only at its owner’s turn end when no enemy shares Philippa’s zone', () => {
    const h = setup();
    h.action('polymorphy');
    h.choose('n0');
    h.fighter('p1:main').position = 'n27';
    h.finishTurn();
    expect(h.state.players[0].ongoing).toEqual([]);
    expect(h.state.players[0].discard.some((c) => c.definition === 'philippa-polymorphy')).toBe(
      true,
    );
  });

  it.each(['p0:main', 'p0:ally-1'])('Regicide is six against a hero for %s', (fighter) => {
    const h = setup();
    h.attack('philippa-regicide', fighter);
    const out = h.defend();
    expect(out.find((o) => o.type === 'combat')).toMatchObject({ combat: { damage: 6 } });
  });

  it('Paralyzing Fetters locks the opposing card against its later printed-value replacement', () => {
    const h = setup();
    h.attack('philippa-regicide', 'p1:main', 'p0:main');
    const out = h.defend('philippa-paralyzing-fetters', 'p0');
    expect(out.find((o) => o.type === 'combat')).toMatchObject({
      combat: { damage: 2 },
    });
  });

  it('Do My Bidding privately replaces only the legal attacker commitment', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:ally-1');
    h.defend('philippa-do-my-bidding', 'p0');
    privateChoice(h);
    h.choose();
    privateChoice(h);
    expect(h.state.resolution.choice!.options.some((o) => o.card?.definition === 'strike')).toBe(
      true,
    );
    expect(
      h.state.resolution.choice!.options.every((o) =>
        ['attack', 'versatile'].includes(h.defs.cards[o.card!.definition].category),
      ),
    ).toBe(true);
    h.choose(h.state.resolution.choice!.options.find((o) => o.card?.definition === 'strike')!.id);
    expect(h.fighter('p0:ally-1').hp).toBe(5);
  });

  it('Blinding Dust damage uses the exact discarded BOOST and can be declined', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('philippa-blinding-dust', 'p0');
    const c = h.state.resolution.choice!;
    privateChoice(h);
    const selected = c.options.find((o) => o.card)!;
    const boost = h.defs.cards[selected.card!.definition].boost;
    h.choose(selected.id);
    expect(h.fighter('p1:main').hp).toBe(15 - boost);
    const k = setup();
    k.attack('strike', 'p1:main');
    k.defend('philippa-blinding-dust', 'p0');
    k.choose('$decline');
    expect(k.fighter('p1:main').hp).toBe(15);
  });

  it.each(['$decline', 'pay'])('Redanian Plot delegates immediate payment (%s)', (option) => {
    const h = setup();
    h.attack('philippa-redanian-plot');
    h.defend('guard');
    expect(h.state.resolution.choice!.player).toBe('p1');
    privateChoice(h);
    const id =
      option === 'pay' ? h.state.resolution.choice!.options.find((o) => o.card)!.id : option;
    const out = h.choose(id);
    expect(out.find((o) => o.type === 'combat')).toMatchObject({
      combat: { damage: option === 'pay' ? 0 : 2 },
    });
  });

  it('Cunning damages only the opposing fighter when its owner declines', () => {
    const h = setup();
    h.attack('philippa-cunning');
    h.defend('guard');
    privateChoice(h);
    h.choose('$decline');
    expect(h.fighter('p1:main').hp).toBe(12);
  });

  it('Spellbreaker cancels the opposing card and ends the active opponent’s turn on defense', () => {
    const h = setup();
    h.attack('philippa-regicide', 'p1:main');
    const out = h.defend('philippa-spellbreaker', 'p0');
    expect(out.find((o) => o.type === 'combat')).toMatchObject({ combat: { damage: 2 } });
    expect(h.state.turn).toBe(0);
  });

  it('Chain Lightning chooses exactly one of Philippa’s zones at a junction', () => {
    const h = setup();
    h.attack('philippa-chain-lightning');
    h.fighter().position = 'n1';
    h.fighter('p0:ally-1').position = 'n2';
    h.fighter('p1:main').position = 'n0';
    h.defend('guard');
    privateChoice(h);
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['brown', 'gold']);
    h.choose('gold');
    expect(h.fighter('p1:main').hp).toBe(15);
    expect(h.fighter('p0:ally-1').hp).toBe(6);
  });

  it.each([false, true])(
    'Lightning Bolt checks actual Maneuver history (maneuver=%s)',
    (maneuver) => {
      const h = setup();
      if (maneuver) {
        h.apply({ type: 'maneuver' });
        h.apply({ type: 'finish-maneuver' });
      }
      h.attack('philippa-lightning-bolt');
      h.defend('guard');
      if (!maneuver) {
        privateChoice(h);
        h.choose('p1:main');
      }
      expect(h.fighter('p1:main').hp).toBe(maneuver ? 15 : 14);
    },
  );

  it.each([0, 2, 4])(
    'Owlform accepts %i private discards and adds one per actual card',
    (count) => {
      const h = setup();
      h.attack('philippa-owlform');
      h.defend('guard');
      privateChoice(h);
      const options = h.state.resolution.choice!.options.slice(0, count).map((o) => o.id);
      const out = h.choose(options);
      expect(out.find((o) => o.type === 'combat')).toMatchObject({ combat: { damage: count } });
    },
  );
});

describe('Philippa roster deployment', () => {
  it(
    'retains full ally counts across every supported two/four-seat deployment',
    { timeout: 240_000 },
    async () => {
      const ids = Object.keys(content.characters);
      for (const count of [2, 4])
        for (let n = 0; n < ids.length ** count; n++) {
          let code = n;
          const roster = Array.from({ length: count }, () => {
            const id = ids[code % ids.length];
            code = Math.floor(code / ids.length);
            return id;
          });
          if (!roster.includes('philippa')) continue;
          if (n % 250 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
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
            const f = state.fighters.find((f) => !f.defeated && f.position === null)!;
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
          expect(
            state.fighters.every((f) =>
              f.role === 'ally' && content.characters[f.character].ally?.startsOffBoard
                ? f.defeated && f.position === null
                : f.position !== null,
            ),
          ).toBe(true);
        }
    },
  );
});

it('Two Steps Ahead can be skipped and its exhaustion also affects living Dijkstra', () => {
  const h = setup();
  h.defs.cards.strike.effects = [];
  h.defs.cards.strike.category = 'action';
  h.state.players[0].hand = [{ id: 'last', definition: 'strike' }];
  h.state.actions = 1;
  h.apply({ type: 'play-action', fighter: 'p0:main', card: 'last' });
  h.choose('skip');
  expect(h.state.players[0].hand).toHaveLength(0);
  const k = setup();
  k.defs.cards.strike.effects = [];
  k.defs.cards.strike.category = 'action';
  k.state.players[0].hand = [{ id: 'last', definition: 'strike' }];
  k.state.players[0].deck = k.state.players[0].deck.slice(0, 2);
  k.state.actions = 1;
  k.apply({ type: 'play-action', fighter: 'p0:main', card: 'last' });
  k.choose('use');
  expect(k.fighter().hp).toBe(8);
  expect(k.fighter('p0:ally-1').hp).toBe(2);
});

it('Regicide remains four against a sidekick and Owlform is cancelled before offering discards', () => {
  const h = setup(undefined, ['philippa', 'philippa']);
  h.attack('philippa-regicide', 'p0:main', 'p1:ally-1');
  h.defend();
  expect(h.fighter('p1:ally-1').hp).toBe(2);
  const k = setup();
  k.attack('philippa-owlform');
  k.defend('philippa-spellbreaker');
  expect(k.state.resolution.choice).toBeNull();
  expect(k.state.players[0].hand).toHaveLength(4);
});

it.each(inventory.deck.cards)(
  'enforces printed fighter eligibility for $title without mutating illegal commands',
  (card) => {
    const allowed = card.characterName === 'DIJKSTRA' ? 'p0:ally-1' : 'p0:main';
    for (const fighter of ['p0:main', 'p0:ally-1']) {
      const h = setup();
      h.fighter(fighter).position = 'n0';
      h.fighter('p1:main').position = 'n1';
      if (card.type === 'defense') h.attack('strike', 'p1:main', fighter);
      h.state.players[0].hand[0].definition = `philippa-${card.slug}`;
      const command: Command =
        card.type === 'scheme'
          ? { type: 'play-action', fighter, card: h.state.players[0].hand[0].id }
          : card.type === 'defense'
            ? { type: 'defend', card: h.state.players[0].hand[0].id }
            : { type: 'attack', fighter, target: 'p1:main', card: h.state.players[0].hand[0].id };
      const before = structuredClone(h.state);
      const result = h.run(command);
      expect(result.ok).toBe(card.characterName === 'ANY' || fighter === allowed);
      expect(h.state).toEqual(before);
    }
  },
);

it('Paralyzing Fetters preserves a character-granted BOOST while locking the opposing card’s value', () => {
  const h = setup((d) => {
    d.characters.vanguard.abilities = [
      {
        id: 'special-boost',
        name: 'Special BOOST',
        description: 'BOOST the attack',
        trigger: 'before-attack',
        effects: [{ type: 'boost-attack' }],
      },
    ];
  });
  h.attack('strike', 'p1:main');
  privateChoice(h);
  const payment = h.state.resolution.choice!.options.find((o) => o.card)!;
  const boost = h.defs.cards[payment.card!.definition].boost;
  h.choose(payment.id);
  h.defend('philippa-paralyzing-fetters', 'p0');
  expect(h.fighter().hp).toBe(12 - (4 + boost - 2));
});
