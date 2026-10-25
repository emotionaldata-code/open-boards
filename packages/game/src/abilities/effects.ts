import { fighterById, fighterDefinition, fighterLabel, mainFighter } from '../fighters';
import { adjacent, reachablePaths } from '../movement';
import { inAttackRange, sharesZone } from '../targeting';
import { condition, reference, value } from './conditions';
import { openChoice } from './choices';
import type { Runtime } from './runtime';
import type { Task } from './state';
import { forcedPaths } from './positions';
import { startGroup } from './groups';
import { offerRevival } from './revival';
import { suppressOpponent } from './suppression';
import { offerAttackBoost } from './attack-boost';
import { setCombatValue, modifyCombatValue } from './combat-values';
import { offerDiscard } from './discard';

import { inspectDeck, searchCard } from './deck';
import { chooseArea } from './area';
import { applyCombatEffect, setHealth } from './combat-effects';

export function applyEffect(runtime: Runtime, task: Extract<Task, { type: 'effect' }>): void {
  const { effect: e } = task,
    { state, defs, emit } = runtime;
  const frame = runtime.data.frames[task.frame];
  const owner = fighterById(state, task.owner)!;
  const ownerPlayer = state.players.find((p) => p.id === owner.player)!;
  if (ownerPlayer.departed) return;
  const target = reference(state, task, 'target' in e ? e.target : 'self');
  switch (e.type) {
    case 'search-card':
      searchCard(runtime, task, e);
      break;
    case 'inspect-deck':
      inspectDeck(runtime, task, e.count, e.take);
      break;
    case 'area-damage':
      chooseArea(runtime, task, e);
      break;
    case 'prevent-damage':
      applyCombatEffect(runtime, task);
      break;
    case 'set-health':
      setHealth(runtime, task);
      break;
    case 'set-combat-value':
      setCombatValue(runtime, task, e);
      break;
    case 'suppress-card-effects':
      suppressOpponent(runtime, task);
      break;
    case 'for-each-fighter':
      startGroup(runtime, task, e);
      break;
    case 'revive-ally':
      offerRevival(runtime, task, e);
      break;
    case 'boost-attack':
      offerAttackBoost(runtime, task.frame, task.owner, task.provenance, e.grant, e.cancelWithCard);
      break;
    case 'if':
      runtime.prepend(
        ...runtime.effects(
          condition(state, defs, task, e.condition) ? e.then : (e.else ?? []),
          task,
        ),
      );
      break;
    case 'choose-option':
      openChoice(
        runtime,
        task.frame,
        owner.player,
        e.prompt,
        e.options.map((o) => ({ ...o, tasks: runtime.effects(o.effects, task) })),
        1,
        1,
        task.provenance,
      );
      break;
    case 'choose-player':
    case 'choose-fighter': {
      const fighters = (
        e.type === 'choose-player'
          ? state.players.filter((p) => !p.eliminated).map((p) => mainFighter(state, p.id))
          : state.fighters
      ).filter(
        (f) =>
          !f.defeated &&
          f.position !== null &&
          (e.relation === 'any' ||
            (e.relation === 'self' || e.relation === 'friendly'
              ? f.player === owner.player
              : f.player !== owner.player)) &&
          (!e.range ||
            e.range === 'any' ||
            (e.range === 'adjacent'
              ? adjacent(defs.map, owner.position, f.position)
              : e.range === 'zone'
                ? sharesZone(defs.map, owner.position, f.position)
                : inAttackRange(owner, f, defs))),
      );
      openChoice(
        runtime,
        task.frame,
        owner.player,
        e.type === 'choose-player' ? 'Choose a player' : 'Choose a fighter',
        fighters.map((f) => ({
          id: e.type === 'choose-player' ? f.player : f.id,
          label:
            e.type === 'choose-player'
              ? state.players.find((p) => p.id === f.player)!.name
              : `${fighterLabel(f, defs)} · ${state.players.find((p) => p.id === f.player)!.name}`,
          tasks: runtime.effects(e.effects, { ...task, chosen: f.id }),
        })),
        1,
        1,
        task.provenance,
      );
      break;
    }
    case 'actions':
      if (state.players[state.turn].id === owner.player && !ownerPlayer.eliminated)
        state.actions = Math.max(0, Math.min(100, state.actions + e.amount));
      break;
    case 'counter': {
      const definition = fighterDefinition(owner, defs).counters?.[e.name];
      if (definition)
        owner.counters[e.name] = Math.max(
          0,
          Math.min(definition.max, owner.counters[e.name] + e.amount),
        );
      break;
    }
    case 'modify':
      if (frame.hook?.startsWith('before-') && e.field in frame) {
        // The discriminated operation owns the field; validation limits which hook can modify it.
        if (e.field === 'attack' && frame.kind === 'combat')
          modifyCombatValue(frame, 'attack', e.amount);
        else if (e.field === 'defense' && frame.kind === 'combat')
          modifyCombatValue(frame, 'defense', e.amount);
        else if (e.field === 'amount' && 'amount' in frame)
          frame.amount = Math.max(0, frame.amount + e.amount);
      }
      break;
    case 'cancel':
      if (frame.hook?.startsWith('before-')) frame.cancelled = true;
      break;
    default: {
      if (
        !target ||
        state.players.find((p) => p.id === target.player)?.eliminated ||
        (target.defeated && e.type !== 'draw' && e.type !== 'discard')
      )
        return;
      switch (e.type) {
        case 'draw':
          runtime.operation(
            {
              kind: 'draw',
              actor: mainFighter(state, target.player).id,
              amount: Math.max(0, Math.min(100, value(state, defs, task, e.count))),
            },
            task.provenance,
          );
          break;
        case 'damage':
          runtime.operation(
            {
              kind: 'damage',
              actor: owner.id,
              target: target.id,
              amount: e.amount,
              reason: 'ability',
            },
            task.provenance,
          );
          break;
        case 'heal':
          runtime.operation(
            { kind: 'heal', actor: owner.id, target: target.id, amount: e.amount },
            task.provenance,
          );
          break;
        case 'status': {
          const definition = defs.statuses![e.status];
          let status = target.statuses.find((s) => s.id === e.status);
          if (!status) {
            status = { id: e.status, stacks: 0 };
            target.statuses.push(status);
          }
          status.stacks = Math.min(definition.maxStacks, status.stacks + (e.stacks ?? 1));
          if (e.turns !== undefined) status.turns = e.turns;
          emit({ type: 'status', fighter: target.id, status: status.id, stacks: status.stacks });
          break;
        }
        case 'remove-status':
          target.statuses = target.statuses.filter((s) => s.id !== e.status);
          emit({ type: 'status', fighter: target.id, status: e.status, stacks: 0 });
          break;
        case 'discard':
          offerDiscard(runtime, task, e, target.player);
          break;
        case 'move':
        case 'push':
        case 'pull':
        case 'teleport': {
          const paths =
            e.type === 'teleport'
              ? Object.fromEntries(
                  defs.map.nodes
                    .filter(
                      (n) =>
                        n !== target.position &&
                        !state.fighters.some((p) => !p.defeated && p.position === n) &&
                        (e.zone !== 'shared' || sharesZone(defs.map, target.position, n)),
                    )
                    .map((n) => [n, [n]]),
                )
              : e.type === 'move'
                ? reachablePaths(state, target, defs.map, e.distance, e.throughEnemies)
                : forcedPaths(state, target, owner, defs, e.distance, e.type);
          const options = Object.entries(paths).map(([node, path]) => {
            return {
              id: node,
              label: `Space ${defs.map.nodes.indexOf(node) + 1}`,
              tasks: [
                {
                  type: 'operation',
                  operation: {
                    kind: 'move',
                    actor: owner.id,
                    target: target.id,
                    origin: target.position!,
                    path,
                    distance: e.type === 'teleport' ? 1 : e.distance,
                    mode: e.type,
                    zone: e.type === 'teleport' ? e.zone : undefined,
                    throughEnemies: e.type === 'move' ? e.throughEnemies : undefined,
                  },
                },
              ] as Task[],
            };
          });
          if (options.length)
            openChoice(
              runtime,
              task.frame,
              owner.player,
              e.type === 'move'
                ? 'Choose a destination'
                : `Choose where to ${e.type} ${fighterDefinition(target, defs).name}`,
              [
                ...options,
                ...(e.type === 'teleport' && e.optional === false
                  ? []
                  : [
                      {
                        id: '$stay',
                        label: 'Stay in place',
                        tasks: [
                          {
                            type: 'operation',
                            operation: {
                              kind: 'move',
                              actor: owner.id,
                              target: target.id,
                              origin: target.position!,
                              path: [],
                              distance: 0,
                              mode: 'move',
                            },
                          },
                        ] as Task[],
                      },
                    ]),
              ],
              1,
              1,
              task.provenance,
            );
          break;
        }
      }
    }
  }
}
