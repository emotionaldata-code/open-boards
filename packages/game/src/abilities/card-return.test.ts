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
describe('filtered recovery and exact played-card return', () => {
  it('validates referenced recovery definitions and rejects empty/unknown filters', () => {
    for (const cards of [[], ['unknown']]) {
      const defs = structuredClone(basic);
      defs.cards.prepare.effects = [{ type: 'recover-card', cards }];
      expect(() => validateDefinitions(defs)).toThrow();
    }
  });

  it('filters exact definitions and never includes an unfinished combat commitment', () => {
    const h = setup((d) => {
      d.cards.adapt.abilities = [
        ability('after-combat', [{ type: 'recover-card', cards: ['adapt'] }]),
      ];
    });
    h.state.players[0].discard.push(
      { id: 'eligible', definition: 'adapt' },
      { id: 'wrong', definition: 'strike' },
    );
    h.state.players[0].hand[0].definition = 'adapt';
    h.fight();
    const c = h.state.resolution.choice!;
    expect(c.options.map((o) => o.id)).toEqual(['eligible']);
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    expect(h.run({ type: 'choose', choice: c.id, options: ['wrong'] }).ok).toBe(false);
    h.reconnect();
    h.choose('eligible');
    expect(h.state.players[0].hand.some((c) => c.id === 'eligible')).toBe(true);
    expect(h.state.players[0].discard.map((c) => c.id)).toContain('p0-0');
  });

  it('keeps nested defeat continuation and exact source provenance through a private JSON choice', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [
        {
          type: 'damage',
          target: 'ally',
          amount: 2,
          onDefeat: [
            {
              type: 'choose-option',
              prompt: 'Return?',
              options: [
                { id: 'yes', label: 'Return card', effects: [{ type: 'return-played-card' }] },
              ],
            },
          ],
        },
      ];
      // ally reference requires a sole ally.
      d.characters.vanguard.ally!.count = 1;
    });
    h.action();
    expect(h.state.resolution.choice?.prompt).toBe('Return?');
    expect(projectGame(h.state, 'p1', false).choice).toBeNull();
    h.reconnect();
    h.choose('yes');
    expect(h.state.players[0].hand.filter((c) => c.id === 'p0-0')).toHaveLength(1);
    expect(h.state.players[0].discard.some((c) => c.id === 'p0-0')).toBe(false);
    expect(h.state.resolution.frames).toEqual({});
  });

  it('does not attribute a later reaction defeat to nonlethal damage', () => {
    const h = setup((d) => {
      d.characters.vanguard.ally!.count = 1;
      d.characters.vanguard.ally!.abilities = [
        ability('after-damage', [{ type: 'damage', amount: 1 }]),
      ];
      d.cards.prepare.effects = [
        { type: 'damage', target: 'ally', amount: 1, onDefeat: [{ type: 'return-played-card' }] },
      ];
    });
    h.action();
    expect(h.fighter('p0:ally-1').defeated).toBe(true);
    expect(h.state.players[0].hand.some((c) => c.id === 'p0-0')).toBe(false);
    expect(h.state.players[0].discard.some((c) => c.id === 'p0-0')).toBe(true);
  });

  it('remembers a direct defeat even if its elimination reaction revives the piece', () => {
    const h = setup((d) => {
      d.characters.vanguard.ally!.count = 1;
      d.characters.vanguard.abilities = [
        {
          ...ability('eliminated', [{ type: 'revive-ally' }]),
          scope: 'any',
          when: { type: 'relation', relation: 'friendly', a: 'self', b: 'target' },
        },
      ];
      d.cards.prepare.effects = [
        { type: 'damage', target: 'ally', amount: 2, onDefeat: [{ type: 'return-played-card' }] },
      ];
    });
    h.action();
    h.reconnect();
    h.choose('p0:ally-1');
    h.reconnect();
    h.choose();
    expect(h.fighter('p0:ally-1').defeated).toBe(false);
    expect(h.state.players[0].hand.some((c) => c.id === 'p0-0')).toBe(true);
  });

  it('returns once without drawing hooks or discarded-card reactions', () => {
    const h = setup((d) => {
      d.cards.prepare.effects = [{ type: 'return-played-card' }, { type: 'return-played-card' }];
      d.characters.vanguard.abilities = [
        ability('after-draw', [{ type: 'damage', amount: 4 }]),
        ability('card-discarded', [{ type: 'damage', amount: 4 }]),
      ];
    });
    h.action();
    expect(h.state.players[0].hand.filter((c) => c.id === 'p0-0')).toHaveLength(1);
    expect(h.fighter('p0:main').hp).toBe(15);
    expect(h.state.players[0].discard).toHaveLength(0);
    expect(h.state.actions).toBe(1);
  });
});
