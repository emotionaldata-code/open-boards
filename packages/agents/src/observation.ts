import {
  canAttackWithCard,
  canPlayDefense,
  cardEligible,
  deploymentSpaces,
  maneuverMovement,
  reachablePaths,
  type Command,
  type Definitions,
  type GameState,
} from '@open-boards/game';
import type { GameView } from '@open-boards/protocol';
import { projectGame } from './projection';

export interface Selection {
  type: 'choose' | 'discard';
  id?: string;
  options: string[];
  min: number;
  max: number;
}
export interface LegalActions {
  /** One shortest movement path per reachable endpoint, not every possible route. */
  commands: Command[];
  /** Select distinct options within these bounds; combinations are never enumerated. */
  selection?: Selection;
}
export interface PlayerObservation {
  player: string;
  game: GameView;
  definitions: Definitions;
  actor: string | null;
  legal: LegalActions;
}
export interface Agent {
  decide(observation: PlayerObservation, signal?: AbortSignal): Command | Promise<Command>;
}

export function pendingActor(game: GameView): string | null {
  const phase = game.phase;
  if (game.paused || phase.type === 'finished') return null;
  if (phase.type === 'awaiting-defense')
    return game.fighters.find((f) => f.id === phase.defender)?.player ?? null;
  if (phase.type === 'taking-actions') return game.players[game.turn]?.id ?? null;
  return phase.player;
}

/** Only public state and the observer's hand enter legal action generation. */
export function legalActions(game: GameView, defs: Definitions, player: string): LegalActions {
  const commands: Command[] = [];
  if (pendingActor(game) !== player) return { commands };
  const phase = game.phase;
  if (phase.type === 'ability-choice') {
    const choice = game.choice;
    return {
      commands,
      ...(choice
        ? {
            selection: {
              type: 'choose' as const,
              id: choice.id,
              options: choice.options.map((o) => o.id),
              min: choice.min,
              max: choice.max,
            },
          }
        : {}),
    };
  }
  if (phase.type === 'discarding') {
    const count = Math.max(0, game.hand.length - 7);
    return {
      commands,
      selection: { type: 'discard', options: game.hand.map((c) => c.id), min: count, max: count },
    };
  }
  const owned = game.fighters.filter((f) => f.player === player && !f.defeated);
  if (phase.type === 'placing-allies') {
    for (const fighter of owned)
      for (const position of deploymentSpaces(game, fighter.id, defs.map))
        commands.push({ type: 'place-ally', fighter: fighter.id, position });
  } else if (phase.type === 'awaiting-defense') {
    commands.push({ type: 'defend', card: null });
    const fighter = game.fighters.find((f) => f.id === phase.defender)!;
    for (const card of game.hand)
      if (canPlayDefense(game, fighter, defs.cards[card.definition], defs))
        commands.push({ type: 'defend', card: card.id });
  } else if (phase.type === 'choosing-movement') {
    commands.push({ type: 'finish-maneuver' });
    if (game.maneuver?.boostable)
      commands.push(...game.hand.map((c): Command => ({ type: 'boost-maneuver', card: c.id })));
    for (const fighter of owned.filter((f) => game.maneuver?.remaining.includes(f.id))) {
      commands.push({ type: 'move', fighter: fighter.id, path: [] });
      for (const path of Object.values(
        reachablePaths(game, fighter, defs.map, maneuverMovement(game, fighter, defs)),
      ))
        commands.push({ type: 'move', fighter: fighter.id, path });
    }
  } else if (phase.type === 'taking-actions' && game.actions > 0) {
    commands.push({ type: 'maneuver' });
    for (const fighter of owned.filter((f) => f.position !== null)) {
      for (const card of game.hand) {
        const definition = defs.cards[card.definition];
        if (definition.category === 'action' && cardEligible(definition, fighter))
          commands.push({ type: 'play-action', fighter: fighter.id, card: card.id });
        for (const target of game.fighters) {
          for (const faceUp of [false, true]) {
            if (canAttackWithCard(game, fighter, target, definition, defs, faceUp))
              commands.push({
                type: 'attack',
                fighter: fighter.id,
                card: card.id,
                target: target.id,
                ...(faceUp ? { faceUp } : {}),
              });
          }
        }
      }
    }
  }
  return { commands };
}

/** All returned data is detached, including content definitions. */
export function observe(
  state: GameState,
  definitions: Definitions,
  player: string,
): PlayerObservation {
  const game = projectGame(state, player);
  const defs = structuredClone(definitions);
  return {
    player,
    game,
    definitions: defs,
    actor: pendingActor(game),
    legal: legalActions(game, defs, player),
  };
}
