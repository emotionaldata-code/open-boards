import { expect, it } from 'vitest';
import { createGame, execute } from '../engine';
import { basic, deckDefinitions } from '../../../../tests/rules-fixture';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import type { Command, Definitions, GameState, Outcome } from '../types';
import { Runtime } from './runtime';
import { emitter } from '../rules';
import type { Effect } from './vocabulary';
import { condition } from './conditions';

function setup(edit: (defs: Definitions) => void = () => {}) {
  const defs = structuredClone(basic);
  edit(defs);
  let state = createGame(
    [0, 1].map((i) => ({
      id: `p${i}`,
      name: `Seat ${i}`,
      character: 'vanguard',
      deck: deckDefinitions().map((definition, j) => ({ id: `p${i}-${j}`, definition })),
    })),
    defs,
    713,
  );
  const h = {
    defs,
    get state() {
      return state;
    },
    effect(effects: Effect[]) {
      const outcomes: Outcome[] = [];
      const runtime = new Runtime(state, defs, emitter(state, outcomes));
      const frame = runtime.frame({ kind: 'turn', actor: 'p0:main' });
      runtime.prepend(...runtime.effects(effects, { frame, owner: 'p0:main', chosen: 'p1:main' }), {
        type: 'release',
        frame,
      });
      runtime.run();
      return outcomes;
    },
    choose(ids?: string[], actor?: string) {
      state = JSON.parse(JSON.stringify(state)) as GameState;
      const c = state.resolution.choice!;
      const r = execute(
        state,
        actor ?? c.player,
        {
          id: `c-${state.revision}`,
          revision: state.revision,
          command: { type: 'choose', choice: c.id, options: ids ?? [c.options[0].id] },
        },
        defs,
      );
      if (!r.ok) throw new Error(r.message);
      state = r.state;
      return r.outcomes;
    },
    apply(command: Command) {
      const r = execute(
        state,
        'p0',
        { id: `c-${state.revision}`, revision: state.revision, command },
        defs,
      );
      if (!r.ok) throw new Error(r.message);
      state = r.state;
    },
  };
  return h;
}

it('draw-to computes one exact draw shortfall, preserving exhaustion and actual draw receipts', () => {
  const h = setup();
  h.state.players[0].hand = [];
  h.state.players[0].deck = h.state.players[0].deck.slice(0, 2);
  const hp = h.state.fighters[0].hp;
  const out = h.effect([{ type: 'draw-to', count: 4 }]);
  expect(h.state.players[0].hand).toHaveLength(2);
  expect(h.state.fighters[0].hp).toBe(hp - 4);
  expect(out.filter((o) => o.type === 'draw')).toHaveLength(1);
  const before = structuredClone(h.state.players[0]);
  h.effect([{ type: 'draw-to', count: 1 }]);
  expect(h.state.players[0]).toEqual(before);
});

it('partial hand selection stays private until the full subset is revealed; exact discard survives JSON recovery', () => {
  const h = setup();
  const out = h.effect([
    { type: 'reveal-hand', target: 'chosen', count: 2, discard: 1 },
    { type: 'draw', target: 'chosen', count: 1 },
  ]);
  expect(out.some((o) => o.type === 'hand-revealed')).toBe(false);
  expect(projectGame(h.state, 'p0', false).choice).toBeNull();
  const first = h.state.resolution.choice!.options[0].id;
  expect(h.choose().some((o) => o.type === 'hand-revealed')).toBe(false);
  expect(h.state.resolution.choice!.options.some((o) => o.id === first)).toBe(false);
  const second = h.state.resolution.choice!.options[0].id;
  expect(h.choose().find((o) => o.type === 'hand-revealed')).toMatchObject({
    cards: [{ id: first }, { id: second }],
  });
  expect(h.state.resolution.choice!.player).toBe('p0');
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual([first, second]);
  h.choose([second]);
  expect(h.state.players[1].discard.map((c) => c.id)).toEqual([second]);
  expect(h.state.players[1].hand).toHaveLength(5);
});

it('reveals before ongoing discard protection; ignoring the discard still resolves the later draw', () => {
  const h = setup((d) => {
    d.cards.prepare.ongoing = { optionalDiscardProtection: true };
  });
  h.state.players[1].ongoing = [{ id: 'protection', definition: 'prepare' }];
  h.effect([
    { type: 'reveal-hand', target: 'chosen', count: 1, discard: 1 },
    { type: 'draw', target: 'chosen', count: 2 },
  ]);
  const out = h.choose();
  expect(out.some((o) => o.type === 'hand-revealed')).toBe(true);
  expect(h.state.resolution.choice!.prompt).toBe('Ignore this discard effect?');
  h.choose(['ignore']);
  expect(h.state.players[1].discard).toEqual([]);
  expect(h.state.players[1].hand).toHaveLength(7);
});

it('own-zone snapshots exactly one zone, damages each enemy once, and excludes friendly fighters', () => {
  const h = setup();
  h.state.fighters[0].position = 'n1';
  h.state.fighters[1].position = 'n2';
  h.effect([{ type: 'area-damage', range: 'own-zone', relation: 'enemy', amount: 1 }]);
  expect(h.state.resolution.choice!.options.map((o) => o.id)).toEqual(['brown', 'gold']);
  h.choose(['gold']);
  expect(h.state.fighters[1].hp).toBe(14);
  expect(h.state.fighters[0].hp).toBe(15);
});

it('maneuvered records the action even for Stay and resets at the next seat turn', () => {
  const h = setup();
  const frame = 900;
  h.state.resolution.frames[frame] = { kind: 'turn', actor: 'p0:main' };
  const check = () =>
    condition(h.state, h.defs, { frame, owner: 'p0:main' }, { type: 'maneuvered' });
  expect(check()).toBe(false);
  h.apply({ type: 'maneuver' });
  expect(check()).toBe(true);
  h.apply({ type: 'finish-maneuver' });
  expect(check()).toBe(true);
  h.apply({ type: 'maneuver' });
  h.apply({ type: 'finish-maneuver' });
  expect(check()).toBe(false);
});

it('printed card-value locks retain hero BOOST and later fighter abilities while blocking card changes', async () => {
  const { lockCardValue, modifyCombatValue, setCombatValue } = await import('./combat-values');
  const h = setup();
  const runtime = new Runtime(h.state, h.defs, emitter(h.state, []));
  const id = runtime.frame({
    kind: 'combat',
    actor: 'p1:main',
    target: 'p0:main',
    attacker: 'p1:main',
    defender: 'p0:main',
    card: { id: 'attack', definition: 'strike' },
    defenseCard: { id: 'defense', definition: 'guard' },
    boosts: [
      { card: { id: 'payment', definition: 'prepare' }, grant: 'special', cancelWithCard: false },
    ],
    attack: 9,
    defense: 3,
    amount: 0,
  });
  const binding = {
    frame: id,
    owner: 'p0:main',
    provenance: { kind: 'card' as const, card: 'defense', combat: id },
  };
  lockCardValue(runtime, binding, {
    type: 'lock-card-value',
    target: 'opponent',
    value: { card: 'opposing', field: 'value' },
  });
  const frame = runtime.data.frames[id];
  if (frame.kind !== 'combat') throw new Error('combat fixture');
  expect(frame.attack).toBe(6);
  expect(frame.suppressedCards).toBeUndefined();
  frame.hook = 'before-combat';
  modifyCombatValue(frame, 'attack', 1);
  modifyCombatValue(frame, 'attack', 10, true);
  setCombatValue(runtime, binding, { type: 'set-combat-value', target: 'opponent', value: 8 });
  expect(frame.attack).toBe(7);
});
