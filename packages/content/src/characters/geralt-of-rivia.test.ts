import { finishActions } from '../../../../tests/finish-actions';
import { completeDeckSelection } from '../../../../tests/complete-deck-selection';
import { expect, it } from 'vitest';
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
import inventory from '../../../../docs/characters/geralt-of-rivia/inventory.json';

function setup(
  edit: (defs: Definitions) => void = () => {},
  roster = ['geralt-of-rivia', 'vanguard'],
  initialize = true,
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
      card.definition = `geralt-of-rivia-${slug}`;
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
  if (!initialize) return h;
  state = completeDeckSelection(state, defs);
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
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

const prefix = 'geralt-of-rivia-';
const card = (slug: string) => prefix + slug;

it('preserves the entire source pool, printed clauses, tags, values, counts and BOOSTs', () => {
  validateDefinitions(content);
  expect(deckDefinitions('geralt-of-rivia')).toHaveLength(36);
  expect(content.characters['geralt-of-rivia']).toMatchObject({
    hp: 16,
    movement: 2,
    attackType: 'melee',
    ally: { hp: 5, count: 1, attackType: 'ranged' },
  });
  expect(inventory.cards).toHaveLength(15);
  for (const entry of inventory.cards) {
    const { id, name, category, usableBy, value, boost, count } = entry;
    expect(content.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
    expect(deckDefinitions('geralt-of-rivia').filter((id) => id === entry.id)).toHaveLength(count);
    for (const text of Object.values(entry.sourceRules))
      if (text) expect(content.cards[id].description).toContain(text);
  }
});

it.each(
  ['steel', 'silver'].flatMap((sword) =>
    ['armor-of-the-forgotten-wolf', 'wolf-medallion'].flatMap((armor) =>
      ['blizzard', 'tawny-owl'].map((potion) => [sword, armor, potion]),
    ),
  ),
)(
  'chooses %s, %s and %s before the opening deal, retaining exactly 30 original instances',
  (sword, armor, potion) => {
    const h = setup(() => {}, ['geralt-of-rivia', 'vanguard'], false);
    const original = h.state.players[0].deck.map((c) => c.id);
    expect(h.state.players[0].hand).toEqual([]);
    for (const slug of [`gear-sword-of-${sword}`, `gear-${armor}`, `gear-${potion}`]) {
      privateChoice(h);
      h.choose(card(slug));
    }
    expect(h.state.phase.type).toBe('placing-allies');
    const chosen = [...h.state.players[0].deck, ...h.state.players[0].hand];
    expect(chosen).toHaveLength(30);
    expect(new Set(chosen.map((c) => c.id)).size).toBe(30);
    expect(new Set(chosen.map((c) => c.definition)).size).toBe(12);
    expect(h.state.players[0].hand).toHaveLength(5);
    expect(chosen.every((c) => original.includes(c.id))).toBe(true);
    expect(chosen.filter((c) => c.definition.includes('gear-'))).toHaveLength(6);
    expect(h.state.fighters.find((f) => f.role === 'ally')?.position).toBeNull();
  },
);

it('Rend BOOSTs attacks and defenses with the same printed payment and exact owner', () => {
  for (const defense of [false, true]) {
    const h = setup();
    h.attack(
      defense ? 'strike' : card('rend'),
      defense ? 'p1:main' : 'p0:main',
      defense ? 'p0:main' : 'p1:main',
    );
    h.defend(defense ? card('rend') : 'guard', defense ? 'p0' : 'p1');
    privateChoice(h);
    const payment = h.state.players[0].hand[0];
    payment.definition = card('damn-youre-ugly');
    const outcomes = h.choose(payment.id);
    expect(outcomes).toContainEqual(
      expect.objectContaining({
        type: 'boost',
        fighter: 'p0:main',
        purpose: defense ? 'defense' : 'attack',
        amount: 4,
      }),
    );
    expect(h.state.players[0].discard.filter((c) => c.id === payment.id)).toHaveLength(1);
    expect(h.state.revealed?.damage).toBe(defense ? 0 : 4);
  }
});

it('Feint suppresses Rend before its optional BOOST, preserving the printed three', () => {
  const h = setup();
  h.attack(card('rend'));
  h.defend('medusa-feint');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.revealed?.damage).toBe(1);
});

it.each([2, 3, 4, 5])(
  'Disciplined Duelist checks opposing printed value %i after combat',
  (value) => {
    const h = setup((d) => {
      d.cards.guard.value = value;
    });
    const hp = h.fighter('p1:main').hp;
    h.attack(card('disciplined-duelist'));
    h.defend('guard');
    if (value === 2) {
      privateChoice(h);
      h.choose('draw');
      expect(h.state.players[0].hand).toHaveLength(5);
    }
    if (value === 3) expect(h.fighter('p1:main').hp).toBe(hp - 2);
    if (value === 4) {
      privateChoice(h);
      expect(h.state.resolution.choice?.player).toBe('p1');
      h.choose();
      expect(h.state.players[1].hand).toHaveLength(3);
    }
    if (value === 5) expect(h.state.resolution.choice).toBeNull();
  },
);

it('Igni deals two to the opponent and one to every other adjacent fighter, including Dandelion', () => {
  const h = setup(() => {}, ['geralt-of-rivia', 'medusa']);
  h.fighter('p0:ally-1').position = 'n9';
  h.fighter('p1:ally-1').position = 'n5';
  h.fighter('p1:ally-2').position = 'n20';
  h.fighter('p1:ally-3').position = 'n21';
  h.attack(card('igni'));
  h.defend();
  while (h.state.resolution.choice) h.choose();
  expect(h.fighter('p1:main').hp).toBe(14);
  expect(h.fighter('p0:ally-1').hp).toBe(4);
  expect(h.fighter('p1:ally-1').defeated).toBe(true);
  expect(h.fighter('p1:ally-2').hp).toBe(1);
});

it.each(['damage', 'swap'])('Riposte can %s with a friendly adjacent Dandelion', (option) => {
  const h = setup();
  h.fighter('p0:ally-1').position = 'n9';
  h.attack(card('riposte'));
  h.defend('guard');
  privateChoice(h);
  h.choose(option);
  privateChoice(h);
  h.choose('p0:ally-1');
  expect(h.fighter('p0:ally-1').hp).toBe(option === 'damage' ? 4 : 5);
  expect(h.fighter().position).toBe(option === 'swap' ? 'n9' : 'n0');
});

it('Yrden locks only the opposing fighter until the current turn ends and still moves Geralt', () => {
  const h = setup();
  h.attack(card('yrden'));
  h.defend();
  privateChoice(h);
  h.choose('$stay');
  expect(projectGame(h.state, 'p1', false).movementLocks).toEqual(['p1:main']);
  h.state.players[0].hand[0].definition = card('riposte');
  h.attack(card('riposte'));
  h.defend();
  h.choose('swap');
  h.choose('p1:main');
  expect(h.fighter().position).toBe('n0');
  expect(h.fighter('p1:main').position).toBe('n1');
  expect(h.state.turn).toBe(1);
  expect(h.state.resolution.movementLocks).toEqual([]);
});

it('Annoying Tune moves the exact opponent and Plot Twist privately selects its owner’s card', () => {
  const h = setup();
  h.attack(card('annoying-tune'), 'p0:ally-1');
  h.defend();
  privateChoice(h);
  h.choose('n5');
  expect(h.fighter('p1:main').position).toBe('n5');
  h.attack(card('plot-twist'), 'p0:ally-1');
  h.defend();
  privateChoice(h);
  expect(h.state.resolution.choice?.options.every((o) => !!o.card)).toBe(true);
  const selected = h.state.resolution.choice!.options[0].id;
  h.choose(selected);
  expect(h.state.players[1].discard.some((c) => c.id === selected)).toBe(true);
  expect(h.state.players[0].hand).toHaveLength(4);
});

it.each(['deck', 'discard'] as const)(
  'Witcher Senses finds exact GEAR in %s and recycles only after a deck take',
  (zone) => {
    const h = setup();
    const source = h.state.players[0].hand[0];
    const gear = { id: 'searchable', definition: card('gear-blizzard') };
    h.state.players[0][zone].push(gear);
    h.action('witcher-senses');
    privateChoice(h);
    expect(
      h.state.resolution.choice?.options.every((o) => o.card?.definition.includes('-gear-')),
    ).toBe(true);
    h.choose('searchable');
    expect(h.state.players[0].hand).toContainEqual(gear);
    expect(
      h.state.players[0][zone === 'deck' ? 'deck' : 'discard'].some((c) => c.id === source.id),
    ).toBe(true);
    expect(
      h.state.players[0][zone === 'deck' ? 'discard' : 'deck'].some((c) => c.id === source.id),
    ).toBe(false);
  },
);

it.each([7, 8, 12])('Sword of Steel checks remaining opposing health %i', (hp) => {
  const h = setup();
  h.fighter('p1:main').hp = hp + 1;
  h.attack(card('gear-sword-of-steel'));
  h.defend('guard');
  expect(h.state.actions).toBe(hp >= 8 ? 3 : 2);
});

it.each([3, 4, 5])(
  'Sword of Silver immediately ignores printed defense %i only at four or more',
  (value) => {
    const h = setup((d) => {
      d.cards.guard.value = value;
    });
    h.attack(card('gear-sword-of-silver'));
    h.defend('guard');
    expect(h.state.revealed?.damage).toBe(value >= 4 ? 4 : 1);
  },
);

it('Wolf Medallion cancels effects and ignores a nonadjacent ranged attacker’s value', () => {
  const h = setup();
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n11';
  h.defs.characters.vanguard.attackType = 'ranged';
  h.state.turn = 1;
  h.state.players[1].hand[0].definition = 'medusa-second-shot-3';
  h.apply(
    { type: 'attack', fighter: 'p1:main', target: 'p0:main', card: h.state.players[1].hand[0].id },
    'p1',
  );
  h.defend(card('gear-wolf-medallion'), 'p0');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.revealed?.damage).toBe(0);
});

it('Armor counts friendly and enemy adjacent fighters and ends the active opponent’s turn', () => {
  const h = setup();
  h.fighter('p0:ally-1').position = 'n2';
  h.attack('strike', 'p1:main', 'p0:main');
  h.defend(card('gear-armor-of-the-forgotten-wolf'), 'p0');
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.state.turn).toBe(0);
});

it('Blizzard persists after an allied attack, blocks enemy action gains, and expires after an attackless owner turn', () => {
  const h = setup();
  h.action('gear-blizzard');
  h.choose('$stay');
  expect(h.state.players[0].ongoing).toHaveLength(1);
  expect(h.state.players[0].discard.some((c) => c.definition === card('gear-blizzard'))).toBe(
    false,
  );
  h.defs.cards.adapt.usableBy = 'BOTH';
  h.attack('adapt', 'p0:ally-1');
  h.defend('guard');
  expect(h.state.turn).toBe(1);
  expect(h.state.players[0].ongoing).toHaveLength(1);
  h.attack('bruce-lee-jeet-kune-do-wrist-lock', 'p1:main', 'p0:main');
  h.defend('guard', 'p0');
  expect(h.state.actions).toBe(1);
  h.finishTurn('p1');
  h.finishTurn();
  expect(h.state.players[0].ongoing).toEqual([]);
  expect(h.state.players[0].discard.some((c) => c.definition === card('gear-blizzard'))).toBe(true);
});

it.each(['ignore', 'allow'])(
  'Tawny Owl offers %s before exposing the protected hand to an opposing chooser',
  (option) => {
    const h = setup(() => {}, ['geralt-of-rivia', 'geralt-of-rivia']);
    h.action('gear-tawny-owl');
    expect(h.state.actions).toBe(2);
    expect(h.state.players[0].hand).toHaveLength(6);
    h.attack(card('damn-youre-ugly'));
    h.defend('guard');
    h.finishTurn();
    h.attack(card('plot-twist'), 'p1:ally-1', 'p0:main');
    h.defend(null, 'p0');
    privateChoice(h);
    expect(h.state.resolution.choice?.player).toBe('p0');
    expect(
      h.state.resolution.choice?.options.flatMap((o) => (o.card ? [o.card.definition] : [])),
    ).toEqual([card('gear-tawny-owl')]);
    expect(
      h.state.resolution.choice?.options.some((o) =>
        h.state.players[0].hand.some((c) => c.id === o.card?.id),
      ),
    ).toBe(false);
    h.choose(option);
    if (option === 'allow') {
      privateChoice(h);
      expect(h.state.resolution.choice?.player).toBe('p1');
      h.choose();
    }
    expect(h.state.players[0].hand).toHaveLength(option === 'ignore' ? 6 : 5);
  },
);

it('rejects Geralt and Dandelion card restrictions without changing state', () => {
  const h = setup();
  for (const [slug, fighter] of [
    ['igni', 'p0:ally-1'],
    ['annoying-tune', 'p0:main'],
  ]) {
    h.state.players[0].hand[0].definition = card(slug);
    h.fighter(fighter).position = 'n0';
    h.fighter('p1:main').position = 'n1';
    const before = structuredClone(h.state);
    expect(
      h.run({ type: 'attack', fighter, card: h.state.players[0].hand[0].id, target: 'p1:main' }).ok,
    ).toBe(false);
    expect(h.state).toEqual(before);
  }
});

it('replacing a potion discards its previous instance once and keeps only the new copy active', () => {
  const h = setup();
  h.state.actions = 4;
  h.action('gear-tawny-owl');
  const previous = h.state.players[0].ongoing![0];
  h.action('gear-blizzard');
  h.choose('$stay');
  expect(h.state.players[0].ongoing?.map((c) => c.definition)).toEqual([card('gear-blizzard')]);
  expect(h.state.players[0].discard.filter((c) => c.id === previous.id)).toHaveLength(1);
});

it(
  'deploys Geralt and Dandelion at full strength with every two/four-seat roster',
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
        if (!roster.includes('geralt-of-rivia')) continue;
        const h = setup(() => {}, roster);
        expect(h.state.fighters.every((f) => f.position !== null)).toBe(true);
        for (const [i, id] of roster.entries())
          if (id === 'geralt-of-rivia') {
            expect(h.fighter(`p${i}:ally-1`).hp).toBe(5);
            expect(h.state.players[i].hand.length + h.state.players[i].deck.length).toBe(30);
          }
      }
  },
);

it('each fighter can independently BOOST Rend in the same combat', () => {
  const h = setup();
  h.attack(card('rend'));
  h.defend(card('rend'));
  expect(h.state.resolution.choice?.player).toBe('p1');
  h.choose();
  expect(h.state.resolution.choice?.player).toBe('p0');
  h.choose();
  expect(h.state.revealed?.boosts).toHaveLength(2);
  expect(h.state.resolution.frames).toEqual({});
});
