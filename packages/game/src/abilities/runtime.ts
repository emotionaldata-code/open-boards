import { fighterById, fighterDefinition, mainFighter, ownedFighters } from '../fighters';
import type { Card, Definitions, GameState } from '../types';
import type { Emit } from '../rules';
import { victory } from '../rules';
import { requireRule } from '../errors';
import { selectDeck, beginPlay } from './setup';
import { expireOngoing, activateOngoing } from './ongoing';
import { takeSearched } from './deck';
import { condition } from './conditions';
import { applyOperation } from './operations';
import { combatStep, startCombat } from './combat';
import { commitAttackBoost } from './attack-boost';
import { applyEffect } from './effects';
import { openChoice } from './choices';
import { cardProvenance, suppressed } from './suppression';
import { setupTokens, placeToken, nextToken } from './tokens';
import { returnToDeck } from './deck';
import { nextFighter } from './groups';
import { areaResult, chooseAdjacent, damageArea } from './area';
import { applySwap } from './swap';
import { commitPrediction, discardNamedValue } from './hand';
import { orderInspected, resolveSearch, takeInspected, resolveRecovery } from './deck';
import { offerPlacement, revive } from './revival';
import { selectAttack, replaceAttack } from './attack-replacement';
import { modifyCombatValue } from './combat-values';
import type { Binding, CardProvenance, Operation, Task } from './state';
import type { Ability, Effect, Hook } from './vocabulary';

/** A synchronous, serializable depth-first queue. Choices suspend it, never await it. */
export class Runtime {
  constructor(
    readonly state: GameState,
    readonly defs: Definitions,
    readonly emit: Emit,
  ) {}
  get data() {
    return this.state.resolution;
  }
  prepend(...tasks: Task[]): void {
    this.data.queue.unshift(...tasks);
  }
  frame(operation: Operation): number {
    const id = ++this.data.next;
    this.data.frames[id] = {
      ...structuredClone(operation),
      ...(this.data.combat !== null ? { combatRoot: this.data.combat } : {}),
    };
    return id;
  }
  effects(effects: Effect[], binding: Binding): Task[] {
    return effects.map((effect) => ({
      type: 'effect',
      effect,
      frame: binding.frame,
      owner: binding.owner,
      chosen: binding.chosen,
      selectedCard: binding.selectedCard,
      chosenToken: binding.chosenToken,
      tokenChooser: binding.tokenChooser,
      provenance: binding.provenance,
    }));
  }
  operation(
    operation: Exclude<
      Operation,
      { kind: 'combat' | 'card' | 'turn' | 'elimination' | 'maneuver-boost' | 'area' }
    >,
    provenance?: CardProvenance,
    onDamage?: { binding: Binding; effects: Effect[]; onDefeat?: Effect[] },
  ): void {
    const frame = this.frame(operation);
    this.data.frames[frame].provenance = provenance;
    const kind = operation.kind;
    this.prepend(
      { type: 'event', frame, hook: `before-${kind}` },
      { type: 'apply', frame, provenance },
      { type: 'event', frame, hook: `after-${kind}` },
      ...(onDamage
        ? [
            {
              ...onDamage.binding,
              type: 'damage-result' as const,
              damage: frame,
              effects: onDamage.effects,
              onDefeat: onDamage.onDefeat,
            },
          ]
        : []),
      { type: 'release', frame },
    );
  }
  event(hook: Hook, operation: Operation): void {
    const frame = this.frame(operation);
    this.prepend({ type: 'event', frame, hook }, { type: 'release', frame });
  }
  card(player: string, card: Card, discarded: boolean): void {
    const fighter = fighterById(this.state, player)!;
    this.state.players.find((p) => p.id === fighter.player)!.discard.push(card);
    this.emit({ type: 'played', player: fighter.player, fighter: fighter.id, card });
    this.cardEvents(player, card, discarded);
  }
  cardEvents(player: string, card: Card, discarded: boolean, suppressAbilities = false): void {
    const frame = this.frame({ kind: 'card', actor: player, card, discarded, suppressAbilities });
    this.prepend(
      ...(!discarded ? [{ type: 'event' as const, frame, hook: 'card-played' as const }] : []),
      { type: 'event', frame, hook: 'card-discarded' },
      { type: 'release', frame },
    );
  }
  dispatch(frameId: number, hook: Hook): void {
    const frame = this.data.frames[frameId];
    if (hook === 'turn-start') {
      if (!frame.turnStartRecorded) {
        this.data.turnPositions = Object.fromEntries(
          this.state.fighters.map((f) => [f.id, f.position]),
        );
        this.data.turnTokens = structuredClone(this.state.boardTokens ?? []);
        frame.turnStartRecorded = true;
      }
      const actor = fighterById(this.state, frame.actor)!;
      const removed = (this.data.removedUntilTurn ?? []).filter((id) => {
        const fighter = fighterById(this.state, id);
        return fighter?.player === actor.player && !fighter.defeated;
      });
      if (removed.length) {
        this.data.dormant = this.data.dormant?.filter((id) => id !== actor.player);
        this.data.removedUntilTurn = this.data.removedUntilTurn!.filter(
          (id) => !removed.includes(id),
        );
        this.prepend(
          ...removed.flatMap((owner) =>
            this.effects([{ type: 'teleport', optional: false }], { frame: frameId, owner }),
          ),
          { type: 'event', frame: frameId, hook },
        );
        return;
      }
    }
    if (frame.kind === 'card' && frame.returned && hook === 'card-discarded') return;
    frame.hook = hook;
    const passives: Task[] = [];
    const cards: Task[] = [];
    for (const p of this.state.fighters) {
      const subject =
        hook.includes('defense') && frame.kind === 'combat'
          ? frame.defender
          : hook.includes('attack') && frame.kind === 'combat'
            ? frame.attacker
            : frame.kind === 'damage' ||
                frame.kind === 'heal' ||
                frame.kind === 'move' ||
                frame.kind === 'elimination'
              ? frame.target
              : frame.actor;
      const involved =
        (hook === 'before-combat' || hook === 'after-combat' || hook === 'combat-reveal') &&
        frame.kind === 'combat'
          ? [frame.attacker, frame.defender].includes(p.id)
          : subject === p.id ||
            ((frame.kind === 'turn' ||
              frame.kind === 'draw' ||
              frame.kind === 'maneuver-boost' ||
              (frame.kind === 'card' && hook === 'card-discarded')) &&
              fighterById(this.state, subject)?.player === p.player);
      const add = (
        abilities: Ability[] = [],
        source: string,
        hidden = false,
        provenance?: CardProvenance,
      ): void => {
        for (const ability of abilities)
          if (ability.trigger === hook && (ability.scope === 'any' || involved))
            (provenance ? cards : passives).push({
              type: 'ability',
              frame: frameId,
              owner: p.id,
              ability,
              key: `${p.id}/${source}/${ability.id}`,
              private: hidden,
              provenance,
            });
      };
      add(fighterDefinition(p, this.defs).abilities, `fighter/${p.definition}`);
      for (const s of p.statuses) add(this.defs.statuses?.[s.id]?.abilities, `status/${s.id}`);
      const card =
        frame.kind === 'combat'
          ? p.id === frame.attacker
            ? frame.bonus
              ? null
              : frame.card
            : p.id === frame.defender && !frame.defenseCancelled
              ? frame.defenseCard
              : null
          : frame.kind === 'card' && !frame.suppressAbilities && p.id === frame.actor
            ? frame.card
            : null;
      if (card)
        add(
          this.defs.cards[card.definition].abilities,
          `card/${card.definition}`,
          hook === 'before-attack' || hook === 'before-defense',
          cardProvenance(this, frame, card.id),
        );
    }
    // Shared card timings are always defender first, independent of seat order.
    if (frame.kind === 'combat')
      cards.sort(
        (a, b) =>
          Number('owner' in b && b.owner === frame.defender) -
          Number('owner' in a && a.owner === frame.defender),
      );
    this.prepend(
      ...(hook === 'after-combat' || hook === 'combat-reveal'
        ? [...cards, ...passives]
        : [...passives, ...cards]),
    );
  }
  activate(task: Extract<Task, { type: 'ability' }>): void {
    const { ability, key, owner, frame } = task;
    const p = fighterById(this.state, owner)!;
    const player = this.state.players.find((player) => player.id === p.player)!;
    const event = this.data.frames[frame];
    if (
      player.departed ||
      this.data.dormant?.includes(player.id) ||
      (p.defeated &&
        !(event.hook === 'eliminated' && event.actor === p.id) &&
        !(
          task.provenance?.combat !== undefined &&
          !player.eliminated &&
          ['after-combat', 'after-attack', 'after-defense'].includes(event.hook ?? '')
        )) ||
      (ability.when && !condition(this.state, this.defs, task, ability.when))
    )
      return;
    const uses = this.data.uses[key] ?? { turn: this.data.turn, count: 0, total: 0 };
    if (uses.turn !== this.data.turn) {
      uses.turn = this.data.turn;
      uses.count = 0;
    }
    if (
      ability.limit &&
      (ability.limit.scope === 'turn' ? uses.count : uses.total) >= ability.limit.count
    )
      return;
    // Reserve usage before optional choices and nested effects, preventing recursive re-entry.
    uses.count++;
    uses.total++;
    this.data.uses[key] = uses;
    const effects = this.effects(ability.effects, task);
    if (ability.optional)
      openChoice(
        this,
        frame,
        p.player,
        ability.name,
        [
          { id: 'use', label: 'Use ability', tasks: effects },
          { id: 'skip', label: 'Skip', tasks: [] },
        ],
        1,
        1,
        task.provenance,
      );
    else this.prepend(...effects);
    this.emit(
      { type: 'ability', fighter: owner, name: ability.name },
      task.private ? p.player : 'all',
    );
  }
  flow(task: Extract<Task, { type: 'flow' }>): void {
    const state = this.state;
    const player = state.players.find(
      (p) => p.id === (task.player ?? state.players[state.turn].id),
    )!;
    switch (task.action) {
      case 'start-game': {
        const actor = mainFighter(state, state.players[state.turn].id).id;
        const frame = this.frame({ kind: 'turn', actor });
        this.prepend(
          {
            type: 'token-setup',
            frame,
            owner: actor,
            remaining: (state.boardTokens ?? [])
              .filter((t) => t.position === null)
              .map((t) => t.id),
          },
          { type: 'event', frame, hook: 'turn-start' },
          { type: 'release', frame },
          { type: 'flow', action: 'settle' },
        );
        break;
      }
      case 'settle':
        this.data.dormant = state.players
          .filter(
            (p) =>
              !p.eliminated &&
              !state.fighters.some((f) => f.player === p.id && !f.defeated && f.position !== null),
          )
          .map((p) => p.id);
        if (victory(state, this.emit)) {
          this.clear();
          return;
        }
        if (state.players[state.turn].eliminated) {
          state.maneuver = null;
          this.prepend(
            { type: 'flow', action: 'advance-turn' },
            { type: 'flow', action: 'settle' },
          );
        } else if (state.maneuver) this.resumeManeuver();
        else if (state.actions <= 0) this.prepend({ type: 'flow', action: 'end-turn' });
        break;
      case 'end-turn': {
        const frame = this.frame({ kind: 'turn', actor: mainFighter(state, player.id).id });
        this.prepend(
          { type: 'event', frame, hook: 'turn-end' },
          { type: 'release', frame },
          { type: 'flow', action: 'expire-statuses', player: player.id },
          { type: 'flow', action: 'hand-limit', player: player.id },
          { type: 'flow', action: 'advance-turn' },
          { type: 'flow', action: 'settle' },
        );
        break;
      }
      case 'expire-statuses':
        expireOngoing(this, player.id);
        this.data.movementLocks = [];
        for (const fighter of ownedFighters(state, player.id))
          for (const s of [...fighter.statuses])
            if (s.turns !== undefined && --s.turns <= 0) {
              fighter.statuses.splice(fighter.statuses.indexOf(s), 1);
              this.emit({ type: 'status', fighter: fighter.id, status: s.id, stacks: 0 });
            }
        break;
      case 'hand-limit':
        if (
          !player.eliminated &&
          !this.data.dormant?.includes(player.id) &&
          player.hand.length > 7
        ) {
          this.prepend({ type: 'flow', action: 'hand-limit', player: player.id });
          state.phase = { type: 'discarding', player: player.id };
        }
        break;
      case 'advance-turn':
        if (victory(state, this.emit)) {
          this.clear();
          return;
        }
        do {
          state.turn = (state.turn + 1) % state.players.length;
        } while (state.players[state.turn].eliminated);
        this.data.turn++;
        this.data.attacked = [];
        this.data.movementLocks = [];
        this.data.endTurnRequested = false;
        state.actions = 2;
        state.phase = { type: 'taking-actions' };
        this.emit({ type: 'turn', player: state.players[state.turn].id });
        this.event('turn-start', {
          kind: 'turn',
          actor: mainFighter(state, state.players[state.turn].id).id,
        });
        break;
    }
  }
  resumeManeuver(): void {
    const maneuver = this.state.maneuver;
    if (!maneuver) return;
    maneuver.remaining = maneuver.remaining.filter((id) => !fighterById(this.state, id)?.defeated);
    if (!maneuver.remaining.length) {
      this.state.maneuver = null;
      this.prepend({ type: 'flow', action: 'settle' });
    } else if (maneuver.finishing) {
      const fighter = fighterById(this.state, maneuver.remaining.shift()!)!;
      this.operation({
        kind: 'move',
        actor: fighter.id,
        target: fighter.id,
        path: [],
        distance: 0,
        mode: 'move',
        origin: fighter.position!,
      });
    } else this.state.phase = { type: 'choosing-movement', player: maneuver.player };
  }
  clear(): void {
    this.state.maneuver = null;
    this.data.queue = [];
    this.data.frames = {};
    this.data.choice = null;
    this.data.combat = null;
  }
  run(): void {
    while (this.data.queue.length) {
      requireRule(
        ++this.data.steps <= 1024,
        'Ability resolution exceeded 1024 steps. Check content for a trigger loop.',
      );
      const task = this.data.queue.shift()!;
      if (suppressed(this, task.provenance)) {
        // An operation already entered its before hooks: finish it as cancelled so
        // after hooks observe zero applied distance/amount, like ordinary cancellation.
        if (task.type === 'swap-apply') {
          for (const id of task.frames)
            if (this.data.frames[id]) this.data.frames[id].cancelled = true;
        } else if (task.type === 'apply' && this.data.frames[task.frame])
          this.data.frames[task.frame].cancelled = true;
        else continue;
      }
      switch (task.type) {
        case 'select-deck':
          selectDeck(this, task);
          break;
        case 'activate-ongoing':
          if (this.data.frames[task.frame]) activateOngoing(this, task);
          break;
        case 'begin-play':
          beginPlay(this);
          break;
        case 'search-selected':
          if (this.data.frames[task.frame]) takeSearched(this, task);
          break;
        case 'token-setup':
          setupTokens(this, task);
          break;
        case 'token-place':
          placeToken(this, task);
          break;
        case 'token-group':
          nextToken(this, task);
          break;
        case 'return-to-deck':
          returnToDeck(this, task);
          break;
        case 'select-attack':
          if (this.data.frames[task.frame]) selectAttack(this, task);
          break;
        case 'replace-attack':
          if (this.data.frames[task.frame]) replaceAttack(this, task);
          break;
        case 'damage-result': {
          const damage = this.data.frames[task.damage];
          if (damage?.kind === 'damage' && damage.amount > 0)
            this.prepend(
              ...this.effects(
                [...task.effects, ...(damage.defeated ? (task.onDefeat ?? []) : [])],
                { ...task, frame: task.damage },
              ),
            );
          break;
        }
        case 'swap-apply':
          if (this.data.frames[task.frame]) applySwap(this, task);
          break;
        case 'predict-value':
          if (this.data.frames[task.frame]) commitPrediction(this, task);
          break;
        case 'named-value-discard':
          if (this.data.frames[task.frame]) discardNamedValue(this, task);
          break;
        case 'bonus-combat': {
          const attacker = fighterById(this.state, task.attacker),
            defender = fighterById(this.state, task.defender);
          if (attacker && defender && !attacker.defeated && !defender.defeated)
            startCombat(this, attacker.id, defender.id, task.card, task.bonus);
          break;
        }
        case 'recover-card':
          if (this.data.frames[task.frame]) resolveRecovery(this, task);
          break;
        case 'search-card':
          if (this.data.frames[task.frame]) resolveSearch(this, task);
          break;
        case 'inspect-take':
          if (this.data.frames[task.frame]) takeInspected(this, task);
          break;
        case 'inspect-order':
          if (this.data.frames[task.frame]) orderInspected(this, task);
          break;
        case 'area-adjacent':
          if (this.data.frames[task.frame]) chooseAdjacent(this, task);
          break;
        case 'area-apply':
          if (this.data.frames[task.frame]) damageArea(this, task);
          break;
        case 'area-result':
          if (this.data.frames[task.frame]) areaResult(this, task);
          break;
        case 'fighter-group':
          if (this.data.frames[task.frame]) nextFighter(this, task);
          break;
        case 'revive-placement':
          if (this.data.frames[task.frame]) offerPlacement(this, task);
          break;
        case 'revive':
          if (this.data.frames[task.frame]) revive(this, task);
          break;
        case 'operation':
          this.operation(task.operation, task.provenance);
          break;
        case 'boost-attack':
          commitAttackBoost(
            this,
            task.frame,
            task.owner,
            task.card,
            task.grant,
            task.cancelWithCard,
            task.field,
            task.provenance,
          );
          break;
        case 'discard-card': {
          const p = this.state.players.find((p) => p.id === task.player)!;
          const index = p.hand.findIndex((c) => c.id === task.card);
          if (!p.eliminated && index >= 0) {
            const combat = task.combat === undefined ? undefined : this.data.frames[task.combat];
            if (task.bonus && combat?.kind === 'combat')
              modifyCombatValue(
                combat,
                task.bonus.field,
                task.bonus.per === 'card' ? 1 : this.defs.cards[p.hand[index].definition].boost,
                !!task.provenance,
              );
            const card = p.hand.splice(index, 1)[0];
            if (task.continuation)
              this.prepend(
                ...this.effects(task.continuation.effects, {
                  ...task.continuation.binding,
                  selectedCard: card,
                }),
              );
            this.card(mainFighter(this.state, p.id).id, card, true);
          }
          break;
        }
        case 'event':
          if (this.data.frames[task.frame]) this.dispatch(task.frame, task.hook);
          break;
        case 'ability':
          if (this.data.frames[task.frame]) this.activate(task);
          break;
        case 'effect':
          if (this.data.frames[task.frame]) applyEffect(this, task);
          break;
        case 'apply':
          if (this.data.frames[task.frame]) applyOperation(this, task.frame);
          break;
        case 'release':
          delete this.data.frames[task.frame];
          break;
        case 'combat-step':
          if (this.data.frames[task.frame]) combatStep(this, task.frame, task.step);
          break;
        case 'flow':
          this.flow(task);
          break;
        case 'wait': {
          const id = 'player' in task.phase ? task.phase.player : undefined;
          if (!this.state.players.find((p) => p.id === id)?.eliminated)
            this.state.phase = task.phase;
          break;
        }
      }
      if (this.state.phase.type !== 'taking-actions') return;
    }
    if (this.state.phase.type === 'taking-actions' && this.state.maneuver) {
      this.resumeManeuver();
      if (this.data.queue.length) {
        this.run();
        return;
      }
    }
    if (this.state.phase.type !== 'ability-choice') this.data.steps = 0;
  }
}
