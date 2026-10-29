import { describe, expect, it } from 'vitest';
import { canPlayDefense } from '../card-defense';
import { deckHarness } from '../../../../tests/deck-harness';
import { basic } from '../../../../tests/rules-fixture';
import { topDiscardTags } from './discard-pile';
import { projectGame } from '../../../../apps/server/src/transport/projection';

function setup() {
  const defs = structuredClone(basic);
  defs.characters.vanguard.discardBase = {
    name: 'Starting item',
    description: 'A non-card bottom marker.',
    tags: ['wild'],
  };
  defs.cards.guard.tags = ['knife'];
  defs.cards.adapt.tags = ['pelt'];
  defs.cards.strike.tags = ['flower'];
  defs.cards.strike.defenseMode = { when: { type: 'discard-top', tag: 'knife', wildTag: 'wild' } };
  const h = deckHarness(defs, ['vanguard', 'ranger']);
  h.fighter().position = 'n0';
  h.fighter('p1:main').position = 'n1';
  return h;
}

describe('settled top-discard operations', () => {
  it('uses a non-card base only below an empty pile and exposes public declaration parity', () => {
    const h = setup(),
      p = h.state.players[0];
    expect(topDiscardTags(h.state, p, h.defs)).toEqual(['wild']);
    const can = () => canPlayDefense(h.state, h.fighter(), h.defs.cards.strike, h.defs);
    expect(can()).toBe(true);
    p.discard.push({ id: 'prior', definition: 'adapt' });
    expect(can()).toBe(false);
    h.attack('strike', 'p1:main', 'p0:main');
    expect(
      canPlayDefense(projectGame(h.state, 'p0', false), h.fighter(), h.defs.cards.strike, h.defs),
    ).toBe(can());
  });

  it('evaluates a symbol after intervening discards and settles the combat card last', () => {
    const h = setup();
    h.state.players[0].hand.forEach((c) => {
      c.definition = 'guard';
    });
    h.defs.cards.strike.abilities = [
      {
        id: 'read-top',
        name: 'Read top',
        description: 'Draw after a matching discard.',
        trigger: 'after-combat',
        when: { type: 'discard-top', tag: 'knife' },
        effects: [{ type: 'draw', count: 1 }],
      },
    ];
    h.defs.cards.adapt.abilities = [
      {
        id: 'discard',
        name: 'Discard',
        description: 'Discard opposing card.',
        trigger: 'before-combat',
        effects: [{ type: 'discard', target: 'opponent', random: true, count: 1 }],
      },
    ];
    const priorCount = h.state.players[0].hand.length;
    const own = h.state.players[0].hand[0].id;
    h.attack('strike');
    h.defend('adapt');
    expect(h.state.players[0].hand).toHaveLength(priorCount - 1);
    expect(h.state.players[0].discard.at(-1)?.id).toBe(own);
    expect(topDiscardTags(h.state, h.state.players[0], h.defs)).toEqual(['flower']);
  });

  it('keeps an action out of top-discard matching until effects finish, then places it above its discards', () => {
    const h = setup();
    h.defs.cards.prepare.tags = ['scheme'];
    h.defs.cards.prepare.effects = [
      {
        type: 'if',
        condition: { type: 'discard-top', tag: 'wild' },
        then: [{ type: 'heal', amount: 1 }],
      },
      { type: 'discard', count: 1, random: true },
    ];
    h.fighter().hp = 10;
    const own = h.state.players[0].hand[0].id;
    h.action('prepare');
    expect(h.fighter().hp).toBe(11);
    expect(h.state.players[0].discard.at(-1)?.id).toBe(own);
    expect(topDiscardTags(h.state, h.state.players[0], h.defs)).toEqual(['scheme']);
  });

  it('restricts recovery to the top eligible prior card and excludes the resolving commitment', () => {
    const h = setup();
    h.state.players[0].discard.push(
      { id: 'older', definition: 'adapt' },
      { id: 'top', definition: 'guard' },
    );
    h.defs.cards.strike.abilities = [
      {
        id: 'recover',
        name: 'Recover top',
        description: 'Recover the top prior card.',
        trigger: 'after-combat',
        effects: [{ type: 'recover-card', top: true }],
      },
    ];
    h.attack('strike');
    h.defend();
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual(['top']);
    h.reconnect();
    h.choose();
    expect(h.state.players[0].hand.some((c) => c.id === 'top')).toBe(true);
    expect(h.state.players[0].discard.some((c) => c.id === 'older')).toBe(true);
  });

  it('has the same public defense eligibility for an effectless second attack after a changed pile', () => {
    const h = setup();
    h.state.players[0].discard.push({ id: 'knife', definition: 'guard' });
    h.defs.cards.strike.abilities = [
      {
        id: 'again',
        name: 'Again',
        description: 'Attack again.',
        trigger: 'after-combat',
        effects: [{ type: 'bonus-attack', name: 'Second attack', value: 2 }],
      },
    ];
    h.attack('strike', 'p1:main', 'p0:main');
    h.defend('adapt', 'p0');
    expect(h.state.phase.type).toBe('awaiting-defense');
    expect(canPlayDefense(h.state, h.fighter(), h.defs.cards.strike, h.defs)).toBe(false);
    expect(
      canPlayDefense(projectGame(h.state, 'p0', false), h.fighter(), h.defs.cards.strike, h.defs),
    ).toBe(false);
  });
});
