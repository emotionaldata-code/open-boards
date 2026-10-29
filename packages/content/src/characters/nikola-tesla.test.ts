import { describe, expect, it } from 'vitest';
import { validateDefinitions } from '@open-boards/game';
import { basic, characters, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/nikola-tesla/inventory.json';

function setup(roster = ['nikola-tesla', 'vanguard']) {
  const defs = structuredClone({
    ...basic,
    characters: { ...basic.characters, ...neutral.characters },
    cards: { ...basic.cards, ...neutral.cards },
  });
  const h = deckHarness(defs, roster);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}
function coils(h: ReturnType<typeof setup>, n: number) {
  h.fighter().counters.coils = n;
}
function drain(h: ReturnType<typeof setup>) {
  let guard = 0;
  while (h.state.resolution.choice) {
    if (++guard > 20) throw new Error('Too many choices');
    h.choose(h.state.resolution.choice.options.find((o) => o.id === '$stay')?.id);
  }
}
describe('Nikola Tesla printed deck', () => {
  it('preserves all thirty copies, eleven designs, values, BOOSTs, timing and fighter restrictions', () => {
    validateDefinitions(basic);
    expect(characters['nikola-tesla']).toMatchObject({
      hp: 14,
      movement: 2,
      attackType: 'ranged',
      counters: { coils: { initial: 1, max: 2 } },
    });
    expect(characters['nikola-tesla'].ally).toBeUndefined();
    expect(deckDefinitions('nikola-tesla')).toHaveLength(30);
    expect(characters['nikola-tesla'].deck).toHaveLength(11);
    for (const card of inventory.cards) {
      const { id, name, category, usableBy, value, boost } = card;
      expect(basic.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(deckDefinitions('nikola-tesla').filter((id) => id === card.id)).toHaveLength(
        card.count,
      );
      for (const text of Object.values(card.sourceRules))
        expect(basic.cards[id].description).toContain(text);
    }
  });
  it('starts with one coil, caps charging at two and gives Fully Charged its action', () => {
    const h = setup();
    expect(h.fighter().counters.coils).toBe(1);
    h.action('nikola-tesla-fully-charged');
    expect(h.fighter().counters.coils).toBe(2);
    expect(h.state.actions).toBe(2);
  });
  it.each([
    [0, 'keep', 3, 0],
    [1, 'one', 5, 0],
    [2, 'two', 7, 0],
  ] as const)(
    'Death Ray at %i coils sets the printed value and pays exactly once',
    (n, pick, value, remaining) => {
      const h = setup();
      coils(h, n);
      h.attack('nikola-tesla-death-ray');
      h.defend('guard');
      if (n) {
        h.reconnect();
        expect(projectGame(h.state, 'p1', false).choice).toBeNull();
        h.choose(pick);
      }
      expect(h.state.revealed?.damage).toBe(value - 3);
      expect(h.fighter().counters.coils).toBe(remaining);
    },
  );
  it('offers only affordable coil payments and rejects two coils without mutation', () => {
    const h = setup();
    coils(h, 1);
    h.attack('nikola-tesla-death-ray');
    h.defend('guard');
    const c = h.state.resolution.choice!,
      before = structuredClone(h.state);
    expect(c.options.map((o) => o.id)).toEqual(['keep', 'one']);
    expect(h.run({ type: 'choose', choice: c.id, options: ['two'] }).ok).toBe(false);
    expect(h.state).toEqual(before);
    h.choose('keep');
    expect(h.fighter().counters.coils).toBe(1);
  });
  it('Feint cancels a coil choice without spending the passive counter', () => {
    const h = setup();
    coils(h, 2);
    h.attack('nikola-tesla-death-ray');
    h.defend('robin-hood-feint');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.revealed?.damage).toBe(1);
    expect(h.fighter().counters.coils).toBe(2);
  });
  it.each([1, 2])('7 Hertz with %i coils gains one action and draws only with both', (n) => {
    const h = setup();
    coils(h, n);
    const hand = h.state.players[0].hand.length;
    h.attack('nikola-tesla-7-hertz');
    h.defend('guard');
    h.choose(n === 2 ? 'two' : 'one');
    expect(h.state.actions).toBe(2);
    expect(h.state.players[0].hand).toHaveLength(hand - 1 + (n === 2 ? 1 : 0));
    expect(h.fighter().counters.coils).toBe(0);
  });
  it('Alternating Current charges both or spends both to heal Tesla', () => {
    const h = setup();
    coils(h, 2);
    h.fighter().hp = 8;
    h.attack('nikola-tesla-the-alternating-current');
    h.defend('guard');
    h.choose('discharge');
    expect(h.fighter().hp).toBe(10);
    expect(h.fighter().counters.coils).toBe(0);
  });
  it.each([0, 1, 2])('Intense Experimentation with %i coils replaces the base draw', (n) => {
    const h = setup();
    coils(h, n);
    h.fighter().hp = 8;
    const before = h.state.players[0].hand.length;
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('nikola-tesla-intense-experimentation', 'p0');
    if (n) h.choose(n === 2 ? 'two' : 'one');
    expect(h.state.players[0].hand).toHaveLength(before - 1 + n + 1);
    expect(h.fighter().hp).toBe(n === 2 ? 8 : 7);
  });
  it.each([false, true])('Kinetic Induction charges one or both after %s winning', (win) => {
    const h = setup();
    coils(h, 0);
    h.attack('nikola-tesla-kinetic-induction');
    h.defend(win ? null : 'guard');
    expect(h.fighter().counters.coils).toBe(win ? 2 : 1);
  });
  it('Lightning Storm damages each opposing fighter sharing Tesla’s zone', () => {
    const h = setup();
    coils(h, 2);
    h.attack('nikola-tesla-lightning-storm');
    h.defend('guard');
    h.choose('two');
    drain(h);
    expect(h.fighter('p1:main').hp).toBe(13);
  });
  it('Polyphase Coils cancels immediately and ignores the opposing value with two coils', () => {
    const h = setup();
    coils(h, 2);
    h.attack('nikola-tesla-polyphase-coils');
    h.defend('guard');
    h.choose('two');
    expect(h.state.revealed?.damage).toBe(3);
    expect(h.fighter().counters.coils).toBe(0);
  });
  it('Remote Control moves opposing fighters and grants an action', () => {
    const h = setup();
    h.action('nikola-tesla-remote-control');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['p1:main']);
    drain(h);
    expect(h.state.actions).toBe(2);
  });
  it('Repulsion Blast moves the opposing fighter before paying, then Tesla and a random discard', () => {
    const h = setup();
    coils(h, 2);
    const before = h.state.players[1].hand.length;
    h.attack('nikola-tesla-repulsion-blast');
    h.defend('guard');
    expect(h.state.resolution.choice!.prompt).not.toContain('discharge');
    h.choose('$stay');
    h.choose('two');
    h.choose('$stay');
    expect(h.state.players[1].hand).toHaveLength(before - 2);
    expect(h.fighter().counters.coils).toBe(0);
  });
  it.each([0, 1, 2])('X-Ray Radiation reveals the exact top card then uses %i coils', (n) => {
    const h = setup();
    coils(h, n);
    h.state.players[1].deck[0].definition = 'guard';
    const top = structuredClone(h.state.players[1].deck[0]),
      next = h.state.players[1].deck[1];
    h.attack('nikola-tesla-x-ray-radiation');
    const out = h.defend('guard');
    expect(out.find((o) => o.type === 'hand-revealed')).toMatchObject({
      zone: 'deck',
      cards: [top],
    });
    if (n) {
      h.reconnect();
      const view = projectGame(h.state, 'p1', false);
      expect(view.observation?.cards).toEqual([top]);
      expect(JSON.stringify(view.observation)).not.toContain(next.id);
      expect(view.choice).toBeNull();
      h.choose(n === 2 ? 'two' : 'one');
    }
    expect(h.state.players[1].deck.some((c) => c.id === top.id)).toBe(n === 0);
    expect(h.state.revealed?.damage).toBe(n === 2 ? 3 : 1);
    expect(h.fighter().counters.coils).toBe(0);
  });
});

it('charges at owner turn end and overflows at owner turn start without spending coils', () => {
  const h = setup();
  h.state.actions = 1;
  h.action('prepare');
  expect(h.state.players[h.state.turn].id).toBe('p1');
  expect(h.fighter().counters.coils).toBe(2);
  h.state.actions = 1;
  h.action('prepare', 'p1:main');
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['p1:main']);
  h.choose('p1:main');
  expect(h.fighter('p1:main').hp).toBe(14);
  h.choose('$stay');
  expect(h.fighter().counters.coils).toBe(2);
  expect(h.state.players[h.state.turn].id).toBe('p0');
});
it('X-Ray Radiation adds the exact revealed BOOST to Tesla’s defense', () => {
  const h = setup();
  coils(h, 2);
  h.state.players[1].deck[0].definition = 'guard';
  h.attack('strike', 'p1:main', 'p0:main');
  h.defend('nikola-tesla-x-ray-radiation', 'p0');
  h.choose('two');
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.fighter().hp).toBe(14);
  expect(h.fighter().counters.coils).toBe(0);
});

it('Polyphase Coils with one coil suppresses opposing effects while retaining their value', () => {
  const h = setup();
  coils(h, 1);
  h.defs.cards.guard.abilities = [
    {
      id: 'guard-draw',
      name: 'Guard draw',
      description: 'Draw',
      trigger: 'after-combat',
      effects: [{ type: 'draw', count: 3 }],
    },
  ];
  const before = h.state.players[1].hand.length;
  h.attack('nikola-tesla-polyphase-coils');
  h.defend('guard');
  h.choose('one');
  expect(h.state.revealed?.damage).toBe(0);
  expect(h.state.players[1].hand).toHaveLength(before - 1);
  expect(h.fighter().counters.coils).toBe(0);
});
it('deploys legally at four seats and Remote Control reaches every opposing owner', () => {
  const h = setup(['nikola-tesla', 'vanguard', 'ranger', 'vanguard']);
  expect(h.state.fighters.filter((f) => f.position !== null)).toHaveLength(4);
  h.action('nikola-tesla-remote-control');
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual([
    'p1:main',
    'p2:main',
    'p3:main',
  ]);
  for (const id of ['p3:main', 'p1:main', 'p2:main']) {
    h.choose(id);
    h.choose('$stay');
  }
  expect(h.state.resolution.choice).toBeNull();
  expect(h.state.actions).toBe(2);
});
