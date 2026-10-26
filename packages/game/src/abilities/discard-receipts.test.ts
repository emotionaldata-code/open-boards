import { describe, expect, it } from 'vitest';
import { basic } from '../../../../tests/rules-fixture';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { createGame, execute } from '../engine';
import { deploymentSpaces } from '../deployment';
import { validateDefinitions } from './validation';
import type { Ability, Effect, Hook } from './vocabulary';
import type { Command, Definitions, GameState } from '../types';

const ability = (trigger: Hook, effects: Effect[], id: string = trigger): Ability => ({
  id,
  name: id,
  description: id,
  trigger,
  effects,
});
function setup(edit: (defs: Definitions) => void = () => {}) {
  const defs = structuredClone(basic);
  defs.characters.vanguard.ally = {
    id: 'helper',
    name: 'Helper',
    hp: 2,
    count: 3,
    attackType: 'melee',
    counters: { energy: { initial: 1, max: 5 } },
  };
  for (const card of Object.values(defs.cards)) card.usableBy = 'BOTH';
  edit(defs);
  let state = createGame(
    ['vanguard', 'ranger'].map((character, i) => ({
      id: `p${i}`,
      name: `Seat ${i}`,
      character,
      deck: Array.from({ length: 30 }, (_, j) => ({
        id: `p${i}-${j}`,
        definition: j % 2 ? 'adapt' : 'strike',
      })),
    })),
    defs,
  );
  const h = {
    defs,
    get state() {
      return state;
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
    apply(command: Command, actor = 'p0') {
      const result = h.run(command, actor);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      return result.outcomes;
    },
    choose(id?: string) {
      const c = state.resolution.choice!;
      return h.apply({ type: 'choose', choice: c.id, options: [id ?? c.options[0].id] }, c.player);
    },
    fighter(id: string) {
      return state.fighters.find((f) => f.id === id)!;
    },
    fight(defense = true, attacker = 'p0:main', defender = 'p1:main') {
      h.fighter(attacker).position = 'n0';
      h.fighter(defender).position = 'n1';
      h.apply({ type: 'attack', fighter: attacker, target: defender, card: 'p0-0' });
      return h.apply({ type: 'defend', card: defense ? 'p1-1' : null }, 'p1');
    },
    action() {
      state.players[0].hand[0].definition = 'prepare';
      return h.apply({ type: 'play-action', fighter: 'p0:main', card: 'p0-0' });
    },
  };
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  return h;
}
describe('exact-card discard receipts and deck recovery', () => {
  it('retains a paid card through its discard reactions and a second private choice', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        {
          type: 'discard',
          count: 1,
          onDiscard: [
            {
              type: 'choose-fighter',
              relation: 'friendly',
              range: 'zone',
              effects: [
                { type: 'damage', target: 'chosen', amount: { card: 'selected', field: 'boost' } },
              ],
            },
          ],
        },
      ];
      d.cards.adapt.boost = 3;
      d.characters.vanguard.abilities = [
        {
          ...ability('card-discarded', [
            {
              type: 'choose-option',
              prompt: 'Discard reaction',
              options: [{ id: 'done', label: 'Done', effects: [] }],
            },
          ]),
          when: { type: 'compare', left: { card: 'played', field: 'boost' }, op: 'eq', right: 3 },
        },
      ];
    });
    h.action();
    h.choose('p0-1');
    expect(h.state.resolution.choice!.prompt).toBe('Discard reaction');
    h.reconnect();
    h.choose('done');
    h.reconnect();
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    expect(JSON.stringify(projectGame(h.state, 'p1', false))).not.toContain('selectedCard');
    h.choose('p0:main');
    expect(h.fighter('p0:main').hp).toBe(12);
  });
  it('gives zero receipts to skipped optional payments and empty hands', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        { type: 'discard', count: 1, upTo: true, onDiscard: [{ type: 'damage', amount: 3 }] },
      ];
    });
    h.action();
    const c = h.state.resolution.choice!;
    h.apply({ type: 'choose', choice: c.id, options: [] });
    expect(h.fighter('p0:main').hp).toBe(15);
  });
  it('handles multiple public deck discards in order with exact BOOST receipts', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        {
          type: 'discard-deck',
          target: 'ally',
          count: 2,
          onDiscard: [{ type: 'heal', amount: { card: 'selected', field: 'boost' } }],
        },
      ];
    });
    // Repeated allies are deliberately not an exact reference; no discard can occur.
    const before = h.state.players[0].deck.length;
    h.action();
    expect(h.state.players[0].deck).toHaveLength(before);
    const c = setup((d) => {
      d.cards.prepare.effects = [
        {
          type: 'discard-deck',
          target: 'self',
          count: 2,
          onDiscard: [{ type: 'heal', amount: { card: 'selected', field: 'boost' } }],
        },
      ];
    });
    c.fighter('p0:main').hp = 5;
    c.state.players[0].deck[0].definition = 'guard';
    c.state.players[0].deck[1].definition = 'adapt';
    const ids = c.state.players[0].deck.slice(0, 2).map((x) => x.id);
    c.action();
    expect(c.fighter('p0:main').hp).toBe(8);
    expect(c.state.players[0].discard.slice(1).map((x) => x.id)).toEqual(ids);
  });
  it('runs an exact top-card receipt after a suspended discard reaction', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [{ type: 'discard-deck', target: 'opponent', count: 1 }];
      d.cards.adapt.abilities = [
        ability('before-combat', [
          {
            type: 'discard-deck',
            target: 'opponent',
            count: 1,
            onDiscard: [
              { type: 'modify', field: 'defense', amount: { card: 'selected', field: 'boost' } },
            ],
          },
        ]),
      ];
      d.characters.vanguard.abilities = [
        {
          ...ability('card-discarded', [
            {
              type: 'choose-option',
              prompt: 'React',
              options: [{ id: 'done', label: 'Done', effects: [] }],
            },
          ]),
          when: { type: 'compare', left: { card: 'played', field: 'boost' }, op: 'eq', right: 2 },
        },
      ];
    });
    h.state.players[0].deck[0].definition = 'guard';
    h.fight();
    expect(h.state.resolution.choice!.player).toBe('p0');
    h.reconnect();
    h.choose('done');
    expect(h.fighter('p1:main').hp).toBe(15);
  });
  it('shuffles only the selected prior instance, with no draw hooks and deterministic seed', () => {
    const edit = (d: Definitions) => {
      d.cards.prepare.effects = [{ type: 'recover-card', destination: 'deck' }];
      d.characters.vanguard.abilities = [ability('after-draw', [{ type: 'damage', amount: 3 }])];
    };
    const a = setup(edit),
      b = setup(edit);
    for (const h of [a, b]) {
      h.state.players[0].discard.push(
        { id: 'prior', definition: 'adapt' },
        { id: 'other', definition: 'guard' },
      );
      h.action();
      h.reconnect();
      h.choose('prior');
      expect(h.state.players[0].discard.some((c) => c.id === 'other')).toBe(true);
      expect(h.fighter('p0:main').hp).toBe(15);
      expect(h.state.players[0].hand).toHaveLength(4);
    }
    expect(a.state.players[0].deck).toEqual(b.state.players[0].deck);
  });
  it('rejects forged and wrong-owner recovery choices atomically', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [{ type: 'recover-card', destination: 'deck' }];
    });
    h.state.players[0].discard.push({ id: 'prior', definition: 'adapt' });
    h.action();
    const before = structuredClone(h.state),
      c = h.state.resolution.choice!;
    expect(h.run({ type: 'choose', choice: c.id, options: ['prior'] }, 'p1').ok).toBe(false);
    expect(h.run({ type: 'choose', choice: c.id, options: ['forged'] }).ok).toBe(false);
    expect(h.state).toEqual(before);
  });
  it('revalidates starting-space occupancy before applying a suspended placement', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        { type: 'teleport', starting: true, includeOrigin: true, optional: false },
      ];
    });
    h.fighter('p0:main').position = 'n25';
    h.action();
    expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['n0']);
    expect(
      h.run({ type: 'choose', choice: h.state.resolution.choice!.id, options: ['n4'] }).ok,
    ).toBe(false);
    h.fighter('p1:main').position = 'n0';
    h.reconnect();
    h.choose('n0');
    expect(h.fighter('p0:main').position).toBe('n25');
    expect(h.state.players[0].discard).toHaveLength(1);
  });
  it('composes successful discard receipts with a decline alternative', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        {
          type: 'discard',
          count: 1,
          onDecline: [{ type: 'damage', amount: 5 }],
          onDiscard: [{ type: 'heal', amount: { card: 'selected', field: 'boost' } }],
        },
      ];
    });
    h.fighter('p0:main').hp = 8;
    h.action();
    h.reconnect();
    h.choose('p0-1');
    expect(h.fighter('p0:main').hp).toBe(9);
  });
  it('validates new fields strictly', () => {
    for (const bad of [
      { type: 'recover-card', destination: 'graveyard' },
      { type: 'teleport', starting: 'yes' },
      { type: 'discard-deck', count: -1 },
      { type: 'discard', count: 1, onDiscard: [{ type: 'arbitrary-code' }] },
    ]) {
      const d = structuredClone(basic);
      d.cards.prepare.effects = [bad as Effect];
      expect(() => validateDefinitions(d)).toThrow();
    }
  });
});
