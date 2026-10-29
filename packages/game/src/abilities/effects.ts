import { offerDrawKeep } from './draw-keep';
import { offerHandProtection } from './hand-protection';
import { chooseToken, moveToken } from './tokens';
import { fighterById, fighterDefinition, fighterLabel, mainFighter } from '../fighters';
import { adjacent, reachablePaths } from '../movement';
import { inAttackRange, sharesZone } from '../targeting';
import { condition, reference, value } from './conditions';
import { openChoice } from './choices';
import type { Runtime } from './runtime';
import type { Task } from './state';
import { canPlace, forcedPaths } from './positions';
import { startGroup } from './groups';
import { offerSummon } from './summoning';
import { offerRevival } from './revival';
import { suppressOpponent } from './suppression';
import { offerAttackBoost, offerBoostGroup } from './attack-boost';
import { setCombatValue, modifyCombatValue, lockCardValue } from './combat-values';
import { actionGainPrevented, offerDiscardProtection } from './ongoing';
import { discardDeck, searchCards, randomIndex, revealTopCard, discardSelectedCard } from './deck';
import { eliminate } from './operations';
import { offerDiscard } from './discard';
import { returnCombatCard } from './combat-return';

import { inspectDeck, searchCard, recoverCard, returnPlayedCard } from './deck';
import { inspectHand, nameValue, predictValue } from './hand';
import { swapFighters } from './swap';
import { chooseArea } from './area';
import { applyCombatEffect, setHealth, replaceDefender, replaceCombatant } from './combat-effects';
import { offerAttackReplacement } from './attack-replacement';

export function applyEffect(runtime: Runtime, task: Extract<Task, { type: 'effect' }>): void {
  const { effect: e } = task,
    { state, defs, emit } = runtime;
  const frame = runtime.data.frames[task.frame];
  const owner = fighterById(state, task.owner)!;
  const ownerPlayer = state.players.find((p) => p.id === owner.player)!;
  if (ownerPlayer.departed || runtime.data.dormant?.includes(ownerPlayer.id)) return;
  const playerEffect = [
    'draw',
    'draw-to',
    'discard',
    'discard-deck',
    'inspect-hand',
    'named-value-discard',
    'reveal-hand',
    'return-to-deck',
    'actions',
  ].includes(e.type);
  const target = reference(state, task, 'target' in e ? e.target : 'self', !playerEffect);
  if (
    target &&
    runtime.data.dormant?.includes(target.player) &&
    (e.type === 'discard' ||
      e.type === 'draw' ||
      e.type === 'inspect-hand' ||
      e.type === 'reveal-hand' ||
      e.type === 'draw-to' ||
      e.type === 'named-value-discard' ||
      e.type === 'return-to-deck')
  )
    return;
  if (
    e.type === 'discard' &&
    e.count > 0 &&
    target &&
    offerDiscardProtection(runtime, task, target.player)
  )
    return;
  if (
    ((e.type === 'discard' &&
      e.chooser &&
      reference(state, task, e.chooser)?.player !== target?.player) ||
      e.type === 'reveal-hand') &&
    offerHandProtection(runtime, task, e)
  )
    return;
  switch (e.type) {
    case 'draw-and-keep':
      offerDrawKeep(runtime, task, e);
      break;
    case 'take-selected-card': {
      const p = state.players.find((p) => p.id === task.selectedPlayer);
      const index = p?.deck.findIndex((c) => c.id === task.selectedCard?.id) ?? -1;
      if (p && !p.eliminated && !runtime.data.dormant?.includes(p.id) && index >= 0) {
        const cards = p.deck.splice(index, 1);
        p.hand.push(...cards);
        emit({ type: 'draw', player: p.id, cards }, p.id);
      }
      break;
    }
    case 'reveal-top-card':
      revealTopCard(runtime, task, e);
      break;
    case 'discard-selected-card':
      discardSelectedCard(runtime, task, e);
      break;
    case 'reveal-boost-draw':
      runtime.prepend({
        ...task,
        type: 'boost-draw',
        remaining: state.players
          .filter((p) => !p.eliminated && !runtime.data.dormant?.includes(p.id))
          .map((p) => p.id),
        commitments: [],
        stage: 'commit',
        index: 0,
      });
      break;
    case 'return-combat-card':
      returnCombatCard(runtime, task);
      break;
    case 'discard-deck':
      discardDeck(runtime, task, e);
      break;
    case 'choose-token':
      chooseToken(runtime, task, e);
      break;
    case 'move-token':
      moveToken(runtime, task, e);
      break;
    case 'for-each-token':
      runtime.prepend({
        ...task,
        type: 'token-group',
        remaining: (state.boardTokens ?? [])
          .filter((t) => t.owner === owner.id && t.kind === e.token && t.position !== null)
          .map((t) => t.id),
        effects: e.effects,
      });
      break;
    case 'return-to-deck':
      if (target) {
        const player = state.players.find((p) => p.id === target.player)!;
        if (player.eliminated || runtime.data.dormant?.includes(player.id)) break;
        if (e.random) {
          const cards = Array.from(
            { length: Math.min(e.count, player.hand.length) },
            () => player.hand.splice(randomIndex(runtime, player.hand.length), 1)[0],
          );
          if (e.destination === 'bottom') player.deck.push(...cards);
          else player.deck.unshift(...cards);
        } else
          runtime.prepend({
            ...task,
            type: 'return-to-deck',
            player: player.id,
            chooser: reference(state, task, e.chooser ?? e.target)?.player,
            destination: e.destination,
            upTo: e.upTo,
            redraw: e.redraw,
            remaining: e.count,
            ordered: [],
          });
      }
      break;
    case 'defeat':
      if (
        target &&
        !target.defeated &&
        !state.players.find((p) => p.id === target.player)!.eliminated
      ) {
        if (eliminate(runtime, target.id, owner.id))
          runtime.prepend(...runtime.effects(e.onDefeat ?? [], task));
      }
      break;
    case 'remove-until-next-turn':
      if (target && !target.defeated && !runtime.data.movementLocks?.includes(target.id)) {
        target.position = null;
        if (!runtime.data.removedUntilTurn?.includes(target.id))
          (runtime.data.removedUntilTurn ??= []).push(target.id);
      }
      break;
    case 'lock-card-value':
      lockCardValue(runtime, task, e);
      break;
    case 'end-turn':
      runtime.data.endTurnRequested = true;
      state.actions = 0;
      break;
    case 'lock-movement':
      if (e.all) {
        runtime.data.movementLocks = state.fighters.map((f) => f.id);
      } else if (target && !target.defeated) {
        (runtime.data.movementLocks ??= []).push(target.id);
      }
      break;
    case 'search-cards':
      searchCards(runtime, task, e);
      break;
    case 'boost-combat':
      if (
        frame.kind === 'combat' &&
        target &&
        (target.id === frame.attacker || (target.id === frame.defender && frame.defenseCard))
      ) {
        if ((e.count ?? 1) > 1 || e.optional === false) {
          offerBoostGroup(runtime, task, target.id, e.grant ?? 'combat', e.count ?? 1, e.optional);
          break;
        }
        offerAttackBoost(
          runtime,
          task.frame,
          target.id,
          task.provenance,
          e.grant ?? 'combat',
          false,
          frame.attacker === target.id ? 'attack' : 'defense',
        );
      }
      break;
    case 'replace-attack':
      offerAttackReplacement(runtime, task, e.different);
      break;
    case 'reveal-hand':
      if (target)
        runtime.prepend({
          ...task,
          type: 'reveal-hand',
          target: target.id,
          count: e.count,
          discard: e.discard,
          selected: [],
        });
      break;
    case 'draw-to':
      if (target)
        runtime.operation({
          kind: 'draw',
          actor: target.id,
          amount: Math.max(
            0,
            e.count - state.players.find((p) => p.id === target.player)!.hand.length,
          ),
        });
      break;
    case 'inspect-hand':
      inspectHand(runtime, task, e);
      break;
    case 'named-value-discard':
      nameValue(runtime, task, e);
      break;
    case 'predict-value':
      predictValue(runtime, task);
      break;
    case 'ignore-combat-value': {
      if (frame.kind !== 'combat' || !target) break;
      const field =
        target.id === frame.attacker ? 'attack' : target.id === frame.defender ? 'defense' : null;
      if (field) {
        (frame.ignoredValues ??= []).push(field);
        frame[field] = 0;
      }
      break;
    }
    case 'swap':
      swapFighters(runtime, task, e);
      break;
    case 'bonus-attack':
      if (frame.kind === 'combat' && !frame.bonus)
        frame.bonusAttack = {
          name: e.name,
          value: e.value,
          ...(e.combatValue !== undefined
            ? { combatValue: value(state, defs, task, e.combatValue) }
            : {}),
        };
      break;
    case 'replace-combatant':
      replaceCombatant(runtime, task);
      break;
    case 'replace-defender':
      replaceDefender(runtime, task);
      break;
    case 'return-played-card':
      returnPlayedCard(runtime, task);
      break;
    case 'recover-card':
      recoverCard(runtime, task, e);
      break;
    case 'search-card':
      searchCard(runtime, task, e);
      break;
    case 'inspect-deck':
      inspectDeck(runtime, task, e);
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
    case 'summon-ally':
      offerSummon(runtime, task, e);
      break;
    case 'redirect-combat-damage':
      if (frame.kind === 'combat' && target && !target.defeated) frame.damageRecipient = target.id;
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
    case 'choose-option': {
      const chooser = reference(state, task, e.chooser);
      if (!chooser) break;
      openChoice(
        runtime,
        task.frame,
        chooser.player,
        e.prompt,
        e.options.map((o) => {
          const target = o.target ? reference(state, task, o.target) : undefined;
          return {
            id: o.id,
            label: o.label,
            decline: o.decline,
            ...(target ? { object: { type: 'fighter' as const, id: target.id } } : {}),
            tasks: runtime.effects(o.effects, task),
          };
        }),
        e.count ?? 1,
        e.count ?? 1,
        task.provenance,
        { fighter: task.owner },
      );
      break;
    }
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
          (e.type !== 'choose-fighter' || !e.role || f.role === e.role) &&
          (e.relation === 'any' ||
            (e.relation === 'self' || e.relation === 'friendly'
              ? f.player === owner.player
              : f.player !== owner.player)) &&
          (!e.range ||
            e.range === 'any' ||
            (e.range === 'combat'
              ? frame.kind === 'combat' &&
                [frame.attacker, frame.defender].includes(f.id) &&
                (e.type === 'choose-player' || !frame.detachedFighters?.includes(f.id))
              : e.range === 'adjacent'
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
          object: { type: 'fighter' as const, id: f.id },
          label:
            e.type === 'choose-player'
              ? state.players.find((p) => p.id === f.player)!.name
              : `${fighterLabel(f, defs)} · ${state.players.find((p) => p.id === f.player)!.name}`,
          tasks: runtime.effects(e.effects, { ...task, chosen: f.id }),
        })),
        1,
        1,
        task.provenance,
        { fighter: task.owner },
      );
      break;
    }
    case 'actions':
      if (
        target &&
        state.players[state.turn].id === target.player &&
        !state.players[state.turn].eliminated &&
        (e.amount <= 0 ||
          (!runtime.data.endTurnRequested && !actionGainPrevented(runtime, target.player)))
      )
        state.actions = Math.max(0, Math.min(100, state.actions + e.amount));
      break;
    case 'counter': {
      const definition = fighterDefinition(owner, defs).counters?.[e.name];
      if (definition)
        owner.counters[e.name] = Math.max(
          0,
          Math.min(definition.max, owner.counters[e.name] + value(state, defs, task, e.amount)),
        );
      break;
    }
    case 'modify':
      if (frame.hook?.startsWith('before-') && e.field in frame) {
        // The discriminated operation owns the field; validation limits which hook can modify it.
        if (e.field === 'attack' && frame.kind === 'combat')
          modifyCombatValue(frame, 'attack', value(state, defs, task, e.amount), !!task.provenance);
        else if (e.field === 'defense' && frame.kind === 'combat')
          modifyCombatValue(
            frame,
            'defense',
            value(state, defs, task, e.amount),
            !!task.provenance,
          );
        else if (e.field === 'amount' && 'amount' in frame)
          frame.amount = Math.max(0, frame.amount + value(state, defs, task, e.amount));
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
              amount: Math.max(0, Math.min(1000, value(state, defs, task, e.amount))),
              reason: 'ability',
            },
            task.provenance,
            { binding: task, effects: e.onDamage ?? [], onDefeat: e.onDefeat },
          );
          break;
        case 'heal':
          runtime.operation(
            {
              kind: 'heal',
              actor: owner.id,
              target: target.id,
              amount: Math.max(0, Math.min(1000, value(state, defs, task, e.amount))),
            },
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
                    .filter((n) =>
                      canPlace(state, target, defs, n, {
                        token: e.token,
                        starting: e.starting,
                        zone: e.zone,
                        range: e.range,
                        anchor: e.range ? reference(state, task, e.anchor)?.id : undefined,
                        allowDefeatedAnchor: e.allowDefeatedAnchor,
                        includeOrigin: e.includeOrigin,
                      }),
                    )
                    .map((n) => [n, [n]]),
                )
              : e.type === 'move'
                ? reachablePaths(
                    state,
                    target,
                    defs.map,
                    Math.max(0, Math.min(100, value(state, defs, task, e.distance))),
                    e.throughEnemies,
                  )
                : forcedPaths(state, target, owner, defs, e.distance, e.type);
          const options = Object.entries(paths).map(([node, path]) => {
            return {
              id: node,
              object: { type: 'space' as const, id: node },
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
                    distance:
                      e.type === 'teleport'
                        ? 1
                        : e.type === 'move'
                          ? Math.max(0, Math.min(100, value(state, defs, task, e.distance)))
                          : e.distance,
                    mode: e.type,
                    consumeManeuver: e.type === 'teleport' ? e.consumeManeuver : undefined,
                    zone: e.type === 'teleport' ? e.zone : undefined,
                    token: e.type === 'teleport' ? e.token : undefined,
                    starting: e.type === 'teleport' ? e.starting : undefined,
                    anchor:
                      e.type === 'teleport' && e.range
                        ? reference(state, task, e.anchor)?.id
                        : undefined,
                    range: e.type === 'teleport' ? e.range : undefined,
                    allowDefeatedAnchor: e.type === 'teleport' ? e.allowDefeatedAnchor : undefined,
                    includeOrigin: e.type === 'teleport' ? e.includeOrigin : undefined,
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
                        decline: true,
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
              { fighter: task.owner },
            );
          break;
        }
      }
    }
  }
}
