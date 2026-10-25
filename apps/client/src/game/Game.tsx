import { useEffect, useRef, useState } from 'react';
import { basic } from '@open-boards/content';
import {
  canAttack,
  cardEligible,
  deploymentSpaces,
  fighterById,
  fighterDefinition,
  mainFighter,
  maneuverMovement,
  ownedFighters,
  reachablePaths,
  type Command,
} from '@open-boards/game';
import type { GameView, RoomView, User } from '@open-boards/protocol';
import { ActionNotice } from '../animation/ActionNotice';
import type { PresentationEvent } from '../animation/events';
import { Board, type BoardPlayback } from '../board/Board';
import { usePresentation } from '../presentation/usePresentation';
import { EventDialog } from '../presentation/EventDialog';
import { Dialog } from '../ui/Dialog';
import { RotatePrompt, usePortraitPhone } from '../ui/DisplayControls';
import { Hand } from './Hand';
import { AbilityChoice } from './AbilityChoice';
import { MatchDetails } from './MatchDetails';
import { FighterPicker } from './FighterPicker';
function instruction(game: GameView, user: User): string {
  if (game.phase.type === 'finished') {
    const winner = game.phase.winner;
    return winner
      ? `${game.players.find((p) => p.id === winner)?.name} wins the match.`
      : 'The match is a draw.';
  }
  if (game.paused) return 'Match paused. Waiting for players to reconnect.';
  if (game.phase.type === 'ability-choice')
    return game.choice?.prompt ?? 'A rival is resolving an ability.';
  if (game.phase.type === 'awaiting-defense')
    return fighterById(game, game.phase.defender)?.player === user.id
      ? 'An attack is coming. Choose a defense card or take the hit.'
      : `${game.players.find((p) => p.id === fighterById(game, (game.phase as { defender: string }).defender)?.player)?.name} is choosing a defense.`;
  if (game.phase.type === 'placing-allies')
    return game.phase.player === user.id
      ? 'Select an ally, then choose a starting space sharing a color with your hero.'
      : 'Your rival is deploying allies.';
  if (game.phase.type === 'choosing-movement')
    return game.phase.player === user.id
      ? game.maneuver?.boostable
        ? 'Move, stay, or select a hand card to boost movement.'
        : 'Choose a highlighted space, or stay where you are.'
      : 'Your rival is choosing a move.';
  if (game.phase.type === 'discarding')
    return game.phase.player === user.id
      ? `Choose ${game.hand.length - 7} cards to discard.`
      : 'Your rival is discarding to seven cards.';
  return game.players[game.turn].id === user.id
    ? 'Your turn. Maneuver, or choose a card to play.'
    : `${game.players[game.turn].name} is taking their turn.`;
}
export function Game({
  room,
  user,
  events,
  reset,
  onCommand,
  onLeave,
  connected,
}: {
  room: RoomView;
  user: User;
  events: PresentationEvent[];
  reset: number;
  onCommand: (command: Command) => void;
  onLeave: () => void;
  connected: boolean;
}) {
  const game = room.game!;
  const self = game.players.find((p) => p.id === user.id)!;
  const phase = game.phase;
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [selectedFighter, setSelectedFighter] = useState('');
  const board = useRef<BoardPlayback>(null);
  const presentation = usePresentation(events, reset, (event, active) =>
    board.current!.present(event, active),
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  const portrait = usePortraitPhone();
  useEffect(() => {
    setSelected([]);
    setTarget('');
  }, [game.revision]);
  const locked =
    presentation.reviewing ||
    game.paused ||
    !connected ||
    (self.eliminated && !game.choice) ||
    phase.type === 'finished';
  const myTurn =
    game.players[game.turn].id === user.id && phase.type === 'taking-actions' && !locked;
  const defending =
    phase.type === 'awaiting-defense' &&
    fighterById(game, phase.defender)?.player === user.id &&
    !locked;
  const moving = phase.type === 'choosing-movement' && phase.player === user.id && !locked;
  const placing = phase.type === 'placing-allies' && phase.player === user.id && !locked;
  const available = ownedFighters(game, user.id).filter((f) =>
    placing
      ? f.position === null
      : moving
        ? game.maneuver?.remaining.includes(f.id)
        : f.position !== null,
  );
  const fighter =
    defending && phase.type === 'awaiting-defense'
      ? fighterById(game, phase.defender)!
      : (available.find((f) => f.id === selectedFighter) ??
        available[0] ??
        mainFighter(game, user.id));
  const discarding = phase.type === 'discarding' && phase.player === user.id && !locked;
  const chosen = game.hand.find((c) => c.id === selected[0]);
  const chosenDefinition = chosen ? basic.cards[chosen.definition] : null;
  const paths = moving
    ? reachablePaths(game, fighter, basic.map, maneuverMovement(game, fighter, basic))
    : {};
  const targets =
    myTurn &&
    chosenDefinition &&
    cardEligible(chosenDefinition, fighter) &&
    ['attack', 'versatile'].includes(chosenDefinition.category)
      ? game.fighters.filter((f) => canAttack(fighter, f, basic))
      : [];
  const choice = game.choice;
  const highlights = choice
    ? choice.options.map((o) => o.id).filter((id) => basic.map.nodes.includes(id))
    : placing
      ? deploymentSpaces(game, fighter.id, basic.map)
      : moving
        ? Object.keys(paths)
        : targets.map((p) => p.position!);
  function node(id: string) {
    if (choice && highlights.includes(id) && !locked)
      onCommand({ type: 'choose', choice: choice.id, options: [id] });
    else if (placing && highlights.includes(id))
      onCommand({ type: 'place-ally', fighter: fighter.id, position: id });
    else if (moving && paths[id]) onCommand({ type: 'move', fighter: fighter.id, path: paths[id] });
    else {
      const player = targets.find((p) => p.position === id);
      if (player) setTarget(player.id);
    }
  }
  const ended = phase.type === 'finished';
  return (
    <>
      <main
        className="game-layout"
        data-revision={game.revision}
        data-phase={phase.type}
        data-turn={game.players[game.turn].name}
        inert={portrait}
      >
        <div className="game-title">
          <h1>{ended ? 'Match complete' : basic.map.name}</h1>
          <span className="turn-label">
            {ended ? 'Final board' : `${game.players[game.turn].name}’s turn`}
          </span>
          <span className="action-count">
            {!ended && (
              <>
                <i className={game.actions > 0 ? 'filled' : ''} />
                <i className={game.actions > 1 ? 'filled' : ''} />
                <span>{game.actions} actions</span>
              </>
            )}
          </span>
          {!portrait && (
            <button onClick={() => (ended ? onLeave() : setConfirmLeave(true))}>
              {ended ? 'Return to lobby' : 'Leave match'}
            </button>
          )}
        </div>
        <MatchDetails room={room} selfId={user.id} />
        <FighterPicker
          fighters={defending ? [fighter] : available}
          selected={fighter.id}
          disabled={defending || locked || phase.type === 'ability-choice'}
          label={placing ? 'Deploy' : moving ? 'Move' : defending ? 'Defending' : 'Acting fighter'}
          hint={
            moving
              ? `${game.maneuver?.remaining.length} fighters left · move up to ${maneuverMovement(game, fighter, basic)}`
              : undefined
          }
          onSelect={(id) => {
            setSelectedFighter(id);
            setSelected([]);
            setTarget('');
          }}
        />
        <div className="play-surface">
          <section className="board-panel" aria-label="Arena">
            <ActionNotice event={presentation.event} />
            <Board
              ref={board}
              game={game}
              selected={target || fighter.id}
              highlights={highlights}
              events={events}
              reset={reset}
              onNode={node}
            />
            <span className="arena-caption">
              {moving
                ? 'Choose your path'
                : targets.length
                  ? 'Choose your rival'
                  : `${fighterDefinition(fighter, basic).name} · ${fighterDefinition(fighter, basic).attackType === 'ranged' ? 'Adjacent or shared color' : 'Adjacent attacks'}`}
            </span>
          </section>
          {choice ? (
            <AbilityChoice
              key={choice.id}
              choice={choice}
              disabled={locked}
              onCommand={onCommand}
            />
          ) : (
            <Hand
              game={game}
              fighter={fighter}
              eliminated={self.eliminated}
              ended={ended}
              prompt={`${instruction(game, user)}${presentation.reviewing ? ' Review recent events to continue.' : ''}`}
              myTurn={myTurn}
              moving={moving}
              defending={defending}
              discarding={discarding}
              selected={selected}
              setSelected={setSelected}
              target={target}
              targets={targets}
              chosen={chosen}
              onCommand={onCommand}
            />
          )}
        </div>
      </main>
      {presentation.event?.review && (
        <EventDialog
          key={`${reset}:${presentation.event.id}`}
          event={presentation.event}
          onAcknowledge={() => presentation.acknowledge(presentation.event!.id)}
        />
      )}
      {portrait && (
        <RotatePrompt
          finished={ended}
          onLeave={() => (ended ? onLeave() : setConfirmLeave(true))}
        />
      )}
      {confirmLeave && (
        <Dialog title="Leave the arena?" onClose={() => setConfirmLeave(false)}>
          <p>Leaving forfeits your seat in this match.</p>
          <div className="button-row">
            <button onClick={() => setConfirmLeave(false)}>Keep playing</button>
            <button className="primary" onClick={onLeave}>
              Forfeit and leave
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
