import { describe, expect, it } from 'vitest';
import {
  canAttackWithCard,
  canPlayAttack,
  maneuverMovement,
  movement,
  validateDefinitions,
  type Command,
  type Definitions,
} from '@open-boards/game';
import { basic as content, cardPresentation, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame, projectOutcomes } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/eredin/inventory.json';

const id = (slug: string) => `eredin-${slug}`;
function setup(edit: (defs: Definitions) => void = () => {}, roster = ['eredin', 'vanguard']) {
  const defs = structuredClone({
    ...content,
    characters: { ...content.characters, ...neutral.characters },
    cards: { ...content.cards, ...neutral.cards },
  });
  edit(defs);
  const h = deckHarness(defs, roster);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.state.fighters
    .filter((f) => f.role === 'ally')
    .forEach((f, i) => {
      f.position = `n${15 + i}`;
    });
  return h;
}
function enrage(h: ReturnType<typeof setup>, survivors: string[] = []) {
  for (const f of h.state.fighters.filter((f) => f.player === 'p0' && f.role === 'ally')) {
    f.defeated = !survivors.includes(f.id);
    f.hp = f.defeated ? 0 : 1;
  }
}
function privateChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const c = h.state.resolution.choice!,
    before = structuredClone(h.state);
  const command: Command = { type: 'choose', choice: c.id, options: [c.options[0].id] };
  expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
  expect(projectGame(h.state, c.player === 'p0' ? 'p1' : 'p0', false).choice).toBeNull();
  expect(h.run(command, c.player === 'p0' ? 'p1' : 'p0').ok).toBe(false);
  expect(h.run({ ...command, options: ['$forged'] }, c.player).ok).toBe(false);
  expect(h.state).toEqual(before);
}

describe('Eredin source fidelity', () => {
  it('preserves 30 cards, 11 designs, printed clauses, values, BOOSTs and restrictions', () => {
    validateDefinitions(content);
    expect(content.characters.eredin).toMatchObject({
      hp: 14,
      movement: 2,
      attackType: 'melee',
      ally: { id: 'eredin-red-rider', count: 4, hp: 1, attackType: 'melee' },
    });
    expect(deckDefinitions('eredin')).toHaveLength(30);
    expect(content.characters.eredin.deck).toHaveLength(11);
    for (const source of inventory.deck.cards) {
      const card = content.cards[id(source.slug)];
      expect(card).toMatchObject({
        value: source.value ?? 0,
        boost: source.boost,
        category: source.type === 'scheme' ? 'action' : source.type,
        usableBy: ({ ANY: 'BOTH', EREDIN: 'MAIN', 'RED RIDER': 'ALLY' } as Record<string, string>)[
          source.characterName
        ],
      });
      expect(deckDefinitions('eredin').filter((c) => c === card.id)).toHaveLength(source.quantity);
      for (const clause of [
        source.basicText,
        source.immediateText,
        source.duringText,
        source.afterText,
      ].filter(Boolean))
        expect(card.description).toContain(clause);
      expect(cardPresentation[card.id].character).toBe('eredin');
    }
  });
  it('deploys all four Riders in two and four seats with the complete roster', () => {
    for (const character of Object.keys(content.characters)) {
      for (const roster of [
        ['eredin', character],
        ['eredin', character, 'eredin', character],
      ]) {
        const h = setup(() => {}, roster);
        expect(h.state.fighters.filter((f) => f.player === 'p0' && f.role === 'ally')).toHaveLength(
          4,
        );
        expect(h.state.phase.type).not.toBe('placing-allies');
      }
    }
  });
});

it('updates movement and actual Maneuver range immediately with defeat and revival', () => {
  const h = setup();
  expect(movement(h.fighter(), h.defs, h.state)).toBe(2);
  enrage(h);
  expect(movement(h.fighter(), h.defs, projectGame(h.state, 'p0', false))).toBe(3);
  h.apply({ type: 'maneuver' });
  expect(maneuverMovement(h.state, h.fighter(), h.defs)).toBe(3);
  h.fighter('p1:main').defeated = false; // Opponent never controls Eredin's enrage.
  expect(movement(h.fighter(), h.defs, h.state)).toBe(3);
  h.fighter('p0:ally-1').defeated = false;
  expect(movement(h.fighter(), h.defs, h.state)).toBe(2);
});

it.each([false, true])(
  'Brutal Strike ignores printed immediate effects through cancellation (enraged=%s)',
  (rage) => {
    const h = setup();
    if (rage) enrage(h);
    h.attack(id('brutal-strike'));
    h.defend('medusa-feint');
    expect(h.state.revealed?.damage).toBe(rage ? 3 : 2);
  },
);
it('Brutal Strike keeps ordinary defense against cards without immediate text', () => {
  const h = setup();
  h.attack(id('brutal-strike'));
  h.defend('guard');
  expect(h.state.revealed?.damage).toBe(0);
});
it.each([false, true])(
  'Backhand removes one seeded random card to the correct zone (enraged=%s)',
  (rage) => {
    const h = setup();
    if (rage) enrage(h);
    h.attack(id('backhand'));
    const before = structuredClone(h.state.players[1]);
    const outcomes = h.defend();
    expect(h.state.players[1].hand).toHaveLength(before.hand.length - 1);
    const removed = before.hand.find((c) => !h.state.players[1].hand.some((n) => n.id === c.id))!;
    expect(rage ? h.state.players[1].discard : h.state.players[1].deck.slice(0, 1)).toContainEqual(
      removed,
    );
    if (!rage) expect(JSON.stringify(projectOutcomes(outcomes, 'p0'))).not.toContain(removed.id);
  },
);
it('Backhand does nothing to an empty opposing hand', () => {
  const h = setup();
  h.attack(id('backhand'));
  h.state.players[1].hand = [];
  h.defend();
  expect(h.state.players[1].discard).toEqual([]);
});
it('Foul Purpose requires an explicit legal face-up declaration for distant targets', () => {
  const h = setup();
  h.fighter('p1:main').position = 'n20';
  const card = h.defs.cards[id('foul-purpose')];
  expect(canAttackWithCard(h.state, h.fighter(), h.fighter('p1:main'), card, h.defs, true)).toBe(
    false,
  );
  enrage(h);
  expect(canAttackWithCard(h.state, h.fighter(), h.fighter('p1:main'), card, h.defs)).toBe(false);
  expect(canAttackWithCard(h.state, h.fighter(), h.fighter('p1:main'), card, h.defs, true)).toBe(
    true,
  );
  h.attack(card.id, undefined, undefined, true);
  h.reconnect();
  expect(projectGame(h.state, 'p1', false).phase).toHaveProperty(
    'committedCard.definition',
    card.id,
  );
  expect(projectGame(h.state, 'spectator', false).observation?.cards[0].definition).toBe(card.id);
  h.defend('medusa-feint');
  expect(h.state.revealed?.damage).toBe(2); // Intrinsic enrage survives cancellation.
});
it('ordinary attacks keep the committed card private', () => {
  const h = setup();
  h.attack(id('foul-purpose'));
  expect(projectGame(h.state, 'p1', false).phase).not.toHaveProperty('committedCard');
});
it('Foul Purpose sacrifices an exact Rider, returns its own instance and can enrage Eredin', () => {
  const h = setup();
  enrage(h, ['p0:ally-2']);
  const card = { ...h.state.players[0].hand[0], definition: id('foul-purpose') };
  h.attack(card.definition);
  h.defend();
  privateChoice(h);
  h.choose('use');
  privateChoice(h);
  h.choose('p0:ally-2');
  expect(h.fighter('p0:ally-2').defeated).toBe(true);
  expect(h.state.players[0].hand).toContainEqual(card);
  expect(h.state.players[0].discard).not.toContainEqual(card);
  expect(movement(h.fighter(), h.defs, h.state)).toBe(3);
});
it('Unyielding Hordes revives anywhere and counts other adjacent friendlies once', () => {
  const h = setup();
  h.fighter('p0:ally-1').position = 'n0';
  h.fighter().position = 'n9';
  h.fighter('p0:ally-2').defeated = true;
  h.fighter('p0:ally-2').hp = 0;
  h.attack(id('unyielding-hordes'), 'p0:ally-1');
  h.defend();
  privateChoice(h);
  h.choose('p0:ally-2');
  privateChoice(h);
  expect(h.state.resolution.choice?.options.some((o) => o.id === 'n2')).toBe(true);
  h.choose('n2');
  expect(h.fighter('p0:ally-2')).toMatchObject({ defeated: false, hp: 1, position: 'n2' });
  expect(h.state.revealed?.damage).toBe(2);
});
it('Unyielding Hordes cannot revive through a cancelled immediate effect', () => {
  const h = setup();
  h.fighter('p0:ally-1').position = 'n0';
  h.fighter('p0:ally-2').defeated = true;
  h.attack(id('unyielding-hordes'), 'p0:ally-1');
  h.defend('medusa-feint');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.fighter('p0:ally-2').defeated).toBe(true);
});
it.each([false, true])(
  'Wild Hunt hits enemies beside any friendly exactly once (enraged=%s)',
  (rage) => {
    const h = setup();
    h.fighter('p0:ally-1').position = 'n2';
    if (rage) enrage(h);
    h.attack(id('wild-hunt'));
    const hp = h.fighter('p1:main').hp;
    h.defend('guard');
    expect(h.fighter('p1:main').hp).toBe(hp - (rage ? 3 : 1)); // 1 combat + 2 effect when enraged.
    expect(h.fighter().hp).toBe(14);
  },
);
it('Wild Hunt still resolves when the committed Rider is defeated in combat', () => {
  const h = setup();
  h.fighter('p0:ally-1').position = 'n0';
  h.fighter().position = 'n2';
  h.state.turn = 1;
  h.attack('strike', 'p1:main', 'p0:ally-1');
  h.defend(id('wild-hunt'), 'p0');
  expect(h.fighter('p0:ally-1').defeated).toBe(true);
  expect(h.fighter('p1:main').hp).toBe(14);
});
it('Icy Guile sacrifices the last Rider during combat and immediately gains enrage value', () => {
  const h = setup();
  enrage(h, ['p0:ally-3']);
  h.attack(id('icy-guile'));
  h.defend('guard');
  privateChoice(h);
  h.choose('use');
  h.choose('p0:ally-3');
  expect(h.state.revealed?.damage).toBe(3);
  expect(h.fighter('p0:ally-3').defeated).toBe(true);
});
it('Icy Guile cancels only when already enraged at immediate timing', () => {
  const h = setup();
  enrage(h);
  h.attack(id('icy-guile'));
  h.defend('medusa-feint');
  expect(h.state.revealed?.damage).toBe(1); // Defender Feint cancels Icy Guile before its immediate effect.
});
it('Portal Defense exchanges positions and transfers defense, then draws on last-Rider defeat', () => {
  const h = setup();
  enrage(h, ['p0:ally-1']);
  h.fighter('p0:ally-1').position = 'n9';
  h.attack('strike', 'p1:main', 'p0:main');
  const size = h.state.players[0].hand.length;
  h.defend(id('portal-defense'), 'p0');
  privateChoice(h);
  h.choose('p0:ally-1');
  expect(h.fighter().position).toBe('n9');
  expect(h.fighter('p0:ally-1')).toMatchObject({ position: 'n0', defeated: true });
  expect(h.state.revealed?.defender).toBe('p0:ally-1');
  expect(h.fighter().hp).toBe(14);
  expect(h.state.players[0].hand).toHaveLength(size + 1);
});
it.each([false, true])(
  'Implacable BOOSTs in defense and requires enrage to attack (attack=%s)',
  (attack) => {
    const h = setup();
    const card = h.defs.cards[id('implacable')];
    expect(canPlayAttack(h.state, h.fighter(), card)).toBe(false);
    if (attack) {
      enrage(h);
      h.attack(card.id);
      h.defend('guard');
    } else {
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend(card.id, 'p0');
    }
    privateChoice(h);
    const boost = h.state.players[0].hand[0];
    boost.definition = id('close-for-the-kill');
    // Choice contains a frozen card receipt, while its definition already has printed BOOST 4.
    h.choose(boost.id);
    expect(h.state.revealed?.damage).toBe(attack ? 5 : 0);
  },
);
it('Might protects only Eredin from ability damage, while combat and exhaustion still hurt', () => {
  const h = setup((d) => {
    d.cards.prepare.effects = [
      {
        type: 'choose-fighter',
        relation: 'enemy',
        effects: [{ type: 'damage', target: 'chosen', amount: 2 }],
      },
    ];
  });
  h.action(id('might-of-the-aen-elle'));
  expect(h.state.actions).toBe(2);
  expect(h.state.players[0].ongoing).toHaveLength(1);
  h.state.turn = 1;
  h.action('prepare', 'p1:main');
  h.choose('p0:main');
  expect(h.fighter().hp).toBe(14);
  h.state.actions = 2;
  h.action('prepare', 'p1:main');
  h.choose('p0:ally-1');
  expect(h.fighter('p0:ally-1').defeated).toBe(true);
  h.state.actions = 2;
  h.attack('strike', 'p1:main', 'p0:main');
  h.defend(null, 'p0');
  expect(h.fighter().hp).toBe(10);
  h.state.turn = 0;
  h.state.actions = 2;
  h.state.players[0].deck = [];
  h.apply({ type: 'maneuver' });
  expect(h.fighter().hp).toBe(8);
});
it('Might expires at the end of a turn without an attack', () => {
  const h = setup();
  h.action(id('might-of-the-aen-elle'));
  h.apply({ type: 'maneuver' });
  h.apply({ type: 'finish-maneuver' });
  h.apply({ type: 'maneuver' });
  h.apply({ type: 'finish-maneuver' });
  expect(h.state.players[0].ongoing).toHaveLength(0);
});
it('Close for the Kill draws two and moves every living friendly through enemies', () => {
  const h = setup();
  const size = h.state.players[0].hand.length;
  h.action(id('close-for-the-kill'));
  expect(h.state.players[0].hand).toHaveLength(size + 1);
  privateChoice(h);
  h.choose('p0:main');
  privateChoice(h);
  expect(h.state.resolution.choice?.options.some((o) => o.id === 'n2')).toBe(true);
  h.choose('n2');
  expect(h.fighter().position).toBe('n2');
  while (h.state.resolution.choice) {
    const c = h.state.resolution.choice;
    h.choose(c.options.some((o) => o.id === '$stay') ? '$stay' : c.options[0].id);
  }
  expect(h.state.actions).toBe(1);
});

it('rejects fighter restrictions and calm Implacable attacks without mutating state', () => {
  for (const [slug, fighter] of [
    ['brutal-strike', 'p0:ally-1'],
    ['unyielding-hordes', 'p0:main'],
    ['implacable', 'p0:main'],
  ]) {
    const h = setup();
    h.fighter('p0:ally-1').position = 'n0';
    const card = h.state.players[0].hand[0];
    card.definition = id(slug);
    const before = structuredClone(h.state);
    expect(h.run({ type: 'attack', fighter, target: 'p1:main', card: card.id }).ok).toBe(false);
    expect(h.state).toEqual(before);
  }
});
it('Foul Purpose allows the committed Rider to sacrifice itself and returns only its own card', () => {
  const h = setup();
  h.fighter('p0:ally-1').position = 'n0';
  const played = h.state.players[0].hand[0].id;
  h.attack(id('foul-purpose'), 'p0:ally-1');
  h.defend();
  h.choose('use');
  h.choose('p0:ally-1');
  expect(h.fighter('p0:ally-1').defeated).toBe(true);
  expect(h.state.players[0].hand.find((c) => c.id === played)?.definition).toBe(id('foul-purpose'));
});
it('Icy Guile can sacrifice while defending and ignore the entire attack value', () => {
  const h = setup();
  enrage(h, ['p0:ally-1']);
  h.attack('strike', 'p1:main', 'p0:main');
  h.defend(id('icy-guile'), 'p0');
  h.choose('use');
  h.choose('p0:ally-1');
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.fighter().hp).toBe(14);
});
it('Portal Defense does not transfer defense if the selected Rider cannot move', () => {
  const h = setup();
  h.fighter('p0:ally-1').position = 'n9';
  h.state.resolution.movementLocks = ['p0:ally-1'];
  h.attack('strike', 'p1:main', 'p0:main');
  h.defend(id('portal-defense'), 'p0');
  h.choose('p0:ally-1');
  expect(h.state.revealed?.defender).toBe('p0:main');
  expect(h.fighter().position).toBe('n0');
  expect(h.fighter().hp).toBe(10);
});
it.each(['self', 'opponent'])('Skirmish moves the selected %s only after a win', (target) => {
  const h = setup();
  h.attack(id('skirmish'));
  h.defend('guard');
  expect(h.state.resolution.choice?.prompt).toBe('Choose a combat fighter to move');
  h.choose(target);
  expect(h.state.resolution.choice?.options.some((o) => o.id === '$stay')).toBe(true);
  h.choose('$stay');
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.revealed?.damage).toBe(1);
});
it('Might stays ongoing at turn end when Eredin attacked', () => {
  const h = setup();
  h.action(id('might-of-the-aen-elle'));
  h.attack(id('brutal-strike'));
  h.defend();
  h.apply({ type: 'maneuver' });
  h.apply({ type: 'finish-maneuver' });
  expect(h.state.players[0].ongoing).toHaveLength(1);
});

it('retains both public combat cards and keeps prediction private when Elementary defends face-up Foul Purpose', () => {
  const h = setup(() => {}, ['eredin', 'sherlock-holmes']);
  enrage(h);
  h.attack(id('foul-purpose'), undefined, undefined, true);
  h.defend('sherlock-holmes-elementary');
  h.reconnect();
  expect(h.state.resolution.choice?.player).toBe('p1');
  for (const viewer of ['p0', 'p1', 'spectator']) {
    expect(projectGame(h.state, viewer, false).observation?.cards.map((c) => c.definition)).toEqual(
      [id('foul-purpose'), 'sherlock-holmes-elementary'],
    );
  }
  expect(projectGame(h.state, 'p0', false).choice).toBeNull();
  h.choose('value-3');
  expect(h.state.revealed?.damage).toBe(0);
});
