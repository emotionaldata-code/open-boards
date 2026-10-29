import { describe, expect, it } from 'vitest';
import { validateDefinitions, type Command } from '@open-boards/game';
import { basic, characters, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import { deckHarness } from '../../../../tests/deck-harness';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import inventory from '../../../../docs/characters/beowulf/inventory.json';
import bundle from './beowulf.json';

function setup(roster = ['beowulf', 'vanguard']) {
  const defs = structuredClone({
    ...basic,
    characters: { ...basic.characters, ...neutral.characters },
    cards: { ...basic.cards, ...neutral.cards },
  });
  const h = deckHarness(defs, roster);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  h.fighter('p0:ally-1').position = 'n20';
  return h;
}
function rage(h: ReturnType<typeof setup>, n: number) {
  h.fighter().counters.rage = n;
}
function privateChoice(h: ReturnType<typeof setup>) {
  const c = h.state.resolution.choice!;
  expect(c).toBeTruthy();
  expect(projectGame(h.state, 'p1', false).choice).toBeNull();
  const before = structuredClone(h.state);
  expect(h.run({ type: 'choose', choice: c.id, options: ['forged'] }).ok).toBe(false);
  expect(h.state).toEqual(before);
  h.reconnect();
}
function drain(h: ReturnType<typeof setup>) {
  let n = 0;
  while (h.state.resolution.choice) {
    if (++n > 20) throw new Error('Choice loop');
    h.choose(h.state.resolution.choice.options.find((o) => o.id === '$stay')?.id);
  }
}

describe('Beowulf printed deck and Rage', () => {
  it('preserves thirty copies, twelve designs, both fighters and every printed clause', () => {
    validateDefinitions(basic);
    expect(characters.beowulf).toMatchObject({
      hp: 17,
      movement: 2,
      attackType: 'melee',
      counters: { rage: { initial: 1, max: 3 } },
      ally: { id: 'beowulf-wiglaf', hp: 9, count: 1, attackType: 'melee' },
    });
    expect(deckDefinitions('beowulf')).toHaveLength(30);
    expect(characters.beowulf.deck).toHaveLength(12);
    for (const c of inventory.cards) {
      const { id, name, category, usableBy, value, boost } = c;
      expect(basic.cards[id]).toMatchObject({ id, name, category, usableBy, value, boost });
      expect(deckDefinitions('beowulf').filter((id) => id === c.id)).toHaveLength(c.count);
      for (const text of Object.values(c.sourceRules))
        expect(basic.cards[id].description).toContain(text);
    }
  });
  it('gains one Rage for each positive damage event on Beowulf, capped at three', () => {
    const h = setup();
    expect(h.fighter().counters.rage).toBe(1);
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend(null, 'p0');
    expect(h.fighter().hp).toBe(13);
    expect(h.fighter().counters.rage).toBe(2);
  });
  it('does not gain Rage from a fully blocked attack or damage to Wiglaf', () => {
    const h = setup();
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('beowulf-skirmish', 'p0');
    drain(h);
    expect(h.fighter().counters.rage).toBe(1);
    h.state.actions = 2;
    h.fighter('p0:ally-1').position = 'n0';
    h.fighter().position = 'n20';
    h.attack('strike', 'p1:main', 'p0:ally-1');
    h.defend(null, 'p0');
    expect(h.fighter('p0:ally-1').hp).toBe(5);
    expect(h.fighter().counters.rage).toBe(1);
  });
  it.each(bundle.cards.filter((c) => c.usableBy !== 'BOTH'))(
    'rejects the wrong fighter for $name without mutation',
    (c) => {
      const h = setup(),
        wrong = c.usableBy === 'MAIN' ? 'p0:ally-1' : 'p0:main';
      h.fighter(wrong).position = 'n0';
      h.state.players[0].hand[0].definition = c.id;
      if (c.category === 'defense') h.attack('strike', 'p1:main', wrong);
      const before = structuredClone(h.state),
        card = h.state.players[0].hand[0].id;
      const command: Command =
        c.category === 'action'
          ? { type: 'play-action', fighter: wrong, card }
          : c.category === 'defense'
            ? { type: 'defend', card }
            : { type: 'attack', fighter: wrong, target: 'p1:main', card };
      expect(h.run(command).ok).toBe(false);
      expect(h.state).toEqual(before);
    },
  );
  it.each([0, 1, 2, 3])('Epic Poem gains and uses current Rage starting at %i', (n) => {
    const h = setup();
    rage(h, n);
    h.attack('beowulf-epic-poem');
    h.defend('guard');
    expect(h.fighter().counters.rage).toBe(Math.min(3, n + 1));
    expect(h.state.revealed?.damage).toBe(Math.max(0, 2 + Math.min(3, n + 1) - 3));
  });
  it.each([0, 1, 2, 3])('The War-King spends exactly %i Rage on attack', (n) => {
    const h = setup();
    rage(h, n);
    h.attack('beowulf-the-war-king');
    h.defend('guard');
    if (n) {
      privateChoice(h);
      expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual([
        'keep',
        ...Array.from({ length: n }, (_, i) => `rage-${i + 1}`),
      ]);
      h.choose(`rage-${n}`);
    }
    expect(h.fighter().counters.rage).toBe(0);
    expect(h.state.revealed?.damage).toBe(Math.max(0, 1 + 2 * n - 3));
  });
  it('The War-King applies its bonus on defense and then gains Rage only for surviving damage', () => {
    const h = setup();
    rage(h, 2);
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('beowulf-the-war-king', 'p0');
    h.choose('rage-1');
    expect(h.state.revealed?.damage).toBe(1);
    expect(h.fighter().counters.rage).toBe(2);
  });
  it('Feint cancels spending effects without touching passive Rage', () => {
    const h = setup();
    rage(h, 3);
    h.attack('beowulf-the-war-king');
    h.defend('robin-hood-feint');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.fighter().counters.rage).toBe(3);
  });
  it('The Ancient Heirloom cannot be cancelled and permits both independent payments', () => {
    const h = setup();
    rage(h, 3);
    h.attack('beowulf-the-ancient-heirloom');
    h.defend('robin-hood-feint');
    privateChoice(h);
    h.choose('spend');
    h.choose('spend');
    const c = h.state.resolution.choice!;
    expect(c.options.some((o) => o.id === '$skip')).toBe(false);
    const payment = h.state.players[0].hand[0];
    const boost = h.defs.cards[payment.definition].boost;
    h.choose(payment.id);
    expect(h.fighter().counters.rage).toBe(0);
    expect(h.state.revealed?.damage).toBe(5 + boost - 2);
  });
  it('The Ancient Heirloom can keep its value and BOOST with one Rage', () => {
    const h = setup();
    rage(h, 1);
    h.attack('beowulf-the-ancient-heirloom');
    h.defend('guard');
    h.choose('spend');
    const payment = h.state.players[0].hand[0],
      boost = h.defs.cards[payment.definition].boost;
    h.choose(payment.id);
    expect(h.state.revealed?.damage).toBe(boost);
    expect(h.fighter().counters.rage).toBe(0);
  });
  it('Grendel deals immediate printed-card damage and may defeat the attacker before combat', () => {
    const h = setup();
    rage(h, 2);
    h.fighter('p1:main').hp = 4;
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('beowulf-the-equal-of-grendel', 'p0');
    privateChoice(h);
    h.choose('spend');
    expect(h.fighter('p1:main').defeated).toBe(true);
    expect(h.fighter().hp).toBe(17);
    expect(h.fighter().counters.rage).toBe(0);
  });
  it('Vigor gains the exact random discard BOOST and respects the Rage cap', () => {
    const h = setup();
    rage(h, 0);
    for (const c of h.state.players[1].hand) c.definition = 'guard';
    const n = h.state.players[1].hand.length;
    h.action('beowulf-vigor-and-courage');
    privateChoice(h);
    h.choose('p1');
    expect(h.state.players[1].hand).toHaveLength(n - 1);
    expect(h.fighter().counters.rage).toBe(2);
  });
  it('Vigor gains no Rage when the chosen opponent has no cards', () => {
    const h = setup();
    rage(h, 1);
    h.state.players[1].hand = [];
    h.action('beowulf-vigor-and-courage');
    h.choose('p1');
    expect(h.fighter().counters.rage).toBe(1);
  });
  it('Golden Drinking Horn pays before selecting distinct effects in submitted order and reconnects', () => {
    const h = setup();
    rage(h, 3);
    h.fighter().hp = 10;
    const hand = h.state.players[0].hand.length;
    h.action('beowulf-golden-drinking-horn');
    privateChoice(h);
    h.choose('rage-3');
    const c = h.state.resolution.choice!;
    expect(c.min).toBe(3);
    expect(c.max).toBe(3);
    const before = structuredClone(h.state);
    expect(h.run({ type: 'choose', choice: c.id, options: ['heal', 'heal', 'move'] }).ok).toBe(
      false,
    );
    expect(h.state).toEqual(before);
    h.reconnect();
    h.apply({ type: 'choose', choice: c.id, options: ['heal', 'move', 'draw'] });
    expect(h.fighter().hp).toBe(12);
    expect(h.state.resolution.choice!.options.some((o) => o.id === '$stay')).toBe(true);
    h.choose('$stay');
    expect(h.state.players[0].hand).toHaveLength(hand + 1);
    expect(h.fighter().counters.rage).toBe(0);
  });
  it('Golden Drinking Horn offers only affordable spending and permits zero', () => {
    const h = setup();
    rage(h, 1);
    h.action('beowulf-golden-drinking-horn');
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['keep', 'rage-1']);
    h.choose('keep');
    expect(h.fighter().counters.rage).toBe(1);
  });
  it('Remnant damages every adjacent fighter and gains an action only for actual Beowulf damage', () => {
    const h = setup();
    h.fighter('p0:ally-1').position = 'n0';
    h.fighter().position = 'n1';
    h.fighter('p1:main').position = 'n10';
    h.action('beowulf-remnant-of-valor', 'p0:ally-1');
    drain(h);
    expect(h.fighter().hp).toBe(16);
    expect(h.fighter().counters.rage).toBe(2);
    expect(h.fighter('p0:ally-1').hp).toBe(9);
    expect(h.fighter('p1:main').hp).toBe(14);
    expect(h.state.actions).toBe(2);
  });
  it('Wiglaf swaps with Beowulf after Hot for the Battle without changing fighters', () => {
    const h = setup();
    h.fighter('p0:ally-1').position = 'n0';
    h.fighter().position = 'n20';
    h.attack('beowulf-hot-for-the-battle', 'p0:ally-1');
    h.defend('guard');
    h.choose('swap');
    expect(h.fighter('p0:ally-1').position).toBe('n20');
    expect(h.fighter().position).toBe('n0');
  });
  it.each([true, false])('Fatal Struggle draws for the winner when attack wins=%s', (win) => {
    const h = setup();
    h.defs.cards.guard.value = win ? 3 : 4;
    const n = h.state.players[win ? 0 : 1].hand.length;
    h.attack('beowulf-fatal-struggle');
    h.defend('guard');
    expect(h.state.players[win ? 0 : 1].hand).toHaveLength(n + 1);
  });
  it('No Contest spends three Rage only after winning against a sidekick', () => {
    const h = setup(['beowulf', 'beowulf']);
    rage(h, 3);
    h.fighter('p1:main').position = 'n20';
    h.fighter('p1:ally-1').position = 'n1';
    h.attack('beowulf-no-contest-expecteth', 'p0:main', 'p1:ally-1');
    h.defend(null);
    h.choose('spend');
    expect(h.fighter('p1:ally-1').defeated).toBe(true);
    expect(h.fighter().counters.rage).toBe(0);
  });
  it('No Contest cannot spend Rage against a hero or after losing to a sidekick', () => {
    const h = setup(['beowulf', 'beowulf']);
    rage(h, 3);
    h.attack('beowulf-no-contest-expecteth');
    h.defend(null);
    expect(h.state.resolution.choice).toBeNull();
    expect(h.fighter().counters.rage).toBe(3);
    h.state.actions = 2;
    h.fighter('p1:main').position = 'n20';
    h.fighter('p1:ally-1').position = 'n1';
    h.defs.cards.guard.usableBy = 'BOTH';
    h.defs.cards.guard.value = 4;
    h.attack('beowulf-no-contest-expecteth', 'p0:main', 'p1:ally-1');
    h.defend('guard');
    expect(h.state.resolution.choice).toBeNull();
    expect(h.fighter('p1:ally-1').defeated).toBe(false);
    expect(h.fighter().counters.rage).toBe(3);
  });
  it('deploys all four heroes and all four Wiglaf allies legally', () => {
    const h = setup(['beowulf', 'beowulf', 'beowulf', 'beowulf']);
    expect(h.state.fighters).toHaveLength(8);
    expect(h.state.fighters.every((f) => f.position !== null)).toBe(true);
  });
});
