import { useEffect, useRef, useState } from 'react';
import { basic } from '@open-boards/content';
import {
  canAttackWithCard,
  canPlayAttack,
  attackModeAvailable,
  cardEligible,
  deploymentSpaces,
  fighterById,
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
import { Hand } from './Hand';
import { MatchDetails } from './MatchDetails';
import { CardPrint } from '../cards/CardPrint';
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
      ? game.phase.bonus
        ? `${game.phase.bonus.name} · Attack ${game.phase.bonus.value}. Choose a defense card or take the hit.`
        : 'Choose a defense or take the hit.'
      : `${game.players.find((p) => p.id === fighterById(game, (game.phase as { defender: string }).defender)?.player)?.name} is choosing a defense.`;
  if (game.phase.type === 'placing-allies')
    return game.phase.player === user.id
      ? 'Place your allies in your hero’s zone.'
      : 'Your rival is deploying allies.';
  if (game.phase.type === 'choosing-movement')
    return game.phase.player === user.id
      ? game.maneuver?.boostable
        ? 'Choose a fighter, then a space. Click a card to boost movement.'
        : 'Choose a fighter, then a space or its current space to stay.'
      : 'Your rival is choosing a move.';
  if (game.phase.type === 'discarding')
    return game.phase.player === user.id
      ? `Choose ${game.hand.length - 7} cards to discard.`
      : 'Your rival is discarding to seven cards.';
  return game.players[game.turn].id === user.id
    ? 'Click a card to play it, or prepare an attack and choose a rival.'
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
  commandReset = 0,
}: {
  room: RoomView;
  user: User;
  events: PresentationEvent[];
  reset: number;
  onCommand: (command: Command) => void;
  onLeave: () => void;
  connected: boolean;
  commandReset?: number;
}) {
  const game = room.game!;
  const self = game.players.find((p) => p.id === user.id)!;
  const phase = game.phase;
  const [selection, setSelection] = useState<{ cards: string[]; fighter: string }>({
    cards: [],
    fighter: '',
  });
  const selected = selection.cards;
  const selectedFighter = selection.fighter;
  const [faceUpCard, setFaceUpCard] = useState<string | null>(null);
  const pending = useRef(false);
  const [sending, setSending] = useState(false);
  const board = useRef<BoardPlayback>(null);
  const presentation = usePresentation(events, reset, (event, active) =>
    board.current!.present(event, active),
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    setSelection({ cards: [], fighter: '' });
    setFaceUpCard(null);
    pending.current = false;
    setSending(false);
  }, [game.revision, reset]);
  useEffect(() => {
    pending.current = false;
    setSending(false);
  }, [commandReset, connected]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection((old) => ({ ...old, cards: [] }));
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const locked =
    sending ||
    presentation.reviewing ||
    game.paused ||
    !connected ||
    (self.eliminated && !game.choice) ||
    phase.type === 'finished';
  const myTurn =
    game.players[game.turn].id === user.id &&
    phase.type === 'taking-actions' &&
    (!locked || sending);
  const defending =
    phase.type === 'awaiting-defense' &&
    fighterById(game, phase.defender)?.player === user.id &&
    (!locked || sending);
  const moving =
    phase.type === 'choosing-movement' && phase.player === user.id && (!locked || sending);
  const placing =
    phase.type === 'placing-allies' && phase.player === user.id && (!locked || sending);
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
  const discarding =
    phase.type === 'discarding' && phase.player === user.id && (!locked || sending);
  const chosen = game.hand.find((c) => c.id === selected[0]);
  const chosenDefinition = chosen ? basic.cards[chosen.definition] : null;
  const paths = moving
    ? reachablePaths(game, fighter, basic.map, maneuverMovement(game, fighter, basic))
    : {};
  const targets =
    myTurn &&
    chosenDefinition &&
    cardEligible(chosenDefinition, fighter) &&
    canPlayAttack(game, fighter, chosenDefinition)
      ? game.fighters.filter((f) =>
          canAttackWithCard(game, fighter, f, chosenDefinition, basic, faceUpCard === chosen?.id),
        )
      : [];
  const choice = game.choice;
  const highlights = locked
    ? []
    : choice
      ? choice.options.flatMap((o) => (o.object?.type === 'space' ? [o.object.id] : []))
      : placing
        ? deploymentSpaces(game, fighter.id, basic.map)
        : moving
          ? Object.keys(paths)
          : [];
  function send(command: Command) {
    if (locked || pending.current) return;
    pending.current = true;
    setSending(true);
    try {
      onCommand(command);
    } catch (error) {
      pending.current = false;
      setSending(false);
      throw error;
    }
  }
  function choose(ids: string[]) {
    if (choice) send({ type: 'choose', choice: choice.id, options: ids });
  }
  function select(id: string) {
    if (locked) return;
    if (choice) {
      const option = choice.options.find((o) => o.id === id);
      if (!option) return;
      if (option.value !== undefined) setSelection((old) => ({ ...old, cards: [id] }));
      else if (choice.min === 1 && choice.max === 1) choose([id]);
      else
        setSelection((old) => ({
          ...old,
          cards: old.cards.includes(id)
            ? old.cards.filter((c) => c !== id)
            : old.cards.length < choice.max
              ? [...old.cards, id]
              : old.cards,
        }));
      return;
    }
    const card = game.hand.find((c) => c.id === id);
    if (!card) return;
    if (discarding) {
      if (game.hand.length - 7 === 1) send({ type: 'discard', cards: [id] });
      else
        setSelection((old) => ({
          ...old,
          cards: old.cards.includes(id)
            ? old.cards.filter((c) => c !== id)
            : old.cards.length < game.hand.length - 7
              ? [...old.cards, id]
              : old.cards,
        }));
    } else if (defending) send({ type: 'defend', card: id });
    else if (moving && game.maneuver?.boostable) send({ type: 'boost-maneuver', card: id });
    else if (myTurn && basic.cards[card.definition].category === 'action')
      send({ type: 'play-action', fighter: fighter.id, card: id });
    else if (myTurn) setSelection((old) => ({ ...old, cards: old.cards.includes(id) ? [] : [id] }));
  }
  function selectFighter(id: string) {
    if (locked) return;
    const option = choice?.options.find((o) => o.object?.type === 'fighter' && o.object.id === id);
    if (option) select(option.id);
    else if (targets.some((f) => f.id === id) && chosen)
      send({
        type: 'attack',
        fighter: fighter.id,
        card: chosen.id,
        target: id,
        ...(faceUpCard === chosen.id ? { faceUp: true } : {}),
      });
    else if (moving && fighter.id === id) send({ type: 'move', fighter: id, path: [] });
    else if (available.some((f) => f.id === id)) setSelection({ fighter: id, cards: [] });
  }
  function node(id: string) {
    if (locked) return;
    const option = choice?.options.find((o) => o.object?.type === 'space' && o.object.id === id);
    if (option) select(option.id);
    else if (placing && highlights.includes(id))
      send({ type: 'place-ally', fighter: fighter.id, position: id });
    else if (moving && paths[id]) send({ type: 'move', fighter: fighter.id, path: paths[id] });
  }
  const interactiveFighters = locked
    ? []
    : choice
      ? choice.options.flatMap((o) => (o.object?.type === 'fighter' ? [o.object.id] : []))
      : [
          ...(myTurn || moving
            ? available.filter((f) => f.position !== null).map((f) => f.id)
            : []),
          ...targets.map((f) => f.id),
        ];
  const prompt = choice
    ? choice.prompt
    : chosen && myTurn
      ? targets.length
        ? 'Click a highlighted rival to attack. Click the card again or press Esc to cancel.'
        : 'No rivals in range. Maneuver to get closer.'
      : moving
        ? `${game.maneuver?.remaining.length} left · Move ${maneuverMovement(game, fighter, basic)}${game.maneuver?.boostable ? ' · Click card to boost' : ' · Choose a space'}`
        : instruction(game, user);
  const ended = phase.type === 'finished';
  return (
    <>
      <main
        className="game-layout"
        data-revision={game.revision}
        data-phase={phase.type}
        data-turn={game.players[game.turn].name}
      >
        <div className="game-title">
          <h1>{ended ? 'Match complete' : basic.map.name}</h1>
          <span className="turn-label">
            {ended ? 'Final board' : `${game.players[game.turn].name}’s turn`}
          </span>
          <span
            className="action-count"
            aria-label={ended ? undefined : `${game.actions} actions remaining`}
          >
            {!ended && (
              <>
                <i aria-hidden="true" className={game.actions > 0 ? 'filled' : ''} />
                <i aria-hidden="true" className={game.actions > 1 ? 'filled' : ''} />
                <span>{game.actions} actions</span>
              </>
            )}
          </span>
          <button onClick={() => (ended ? onLeave() : setConfirmLeave(true))}>
            {ended ? 'Return to lobby' : 'Leave match'}
          </button>
        </div>
        <MatchDetails room={room} selfId={user.id} />
        <div className="play-surface">
          <section className="board-panel" aria-label="Arena">
            <ActionNotice event={presentation.event} />
            <Board
              ref={board}
              game={game}
              selected={choice?.source?.fighter ?? fighter.id}
              highlights={highlights}
              events={events}
              reset={reset}
              onNode={node}
              interactiveFighters={interactiveFighters}
              fighterLabels={Object.fromEntries(
                choice?.options.flatMap((o) =>
                  o.object?.type === 'fighter' ? [[o.object.id, o.label]] : [],
                ) ?? [],
              )}
              targetFighters={targets.map((f) => f.id)}
              onFighter={selectFighter}
              interactiveTokens={
                locked
                  ? []
                  : choice?.options.flatMap((o) =>
                      o.object?.type === 'token' ? [o.object.id] : [],
                    )
              }
              onToken={(id) => {
                const option = choice?.options.find(
                  (o) => o.object?.type === 'token' && o.object.id === id,
                );
                if (option) select(option.id);
              }}
            />
            {placing && (
              <div className="board-controls">
                <FighterPicker
                  fighters={available}
                  selected={fighter.id}
                  disabled={locked}
                  onSelect={(id) => setSelection({ fighter: id, cards: [] })}
                />
              </div>
            )}
          </section>
          {game.observation && !choice && !defending ? (
            <section className="hand-panel" aria-label="Revealed cards">
              <h2>{game.observation.prompt}</h2>
              <div className="ability-options">
                {game.observation.cards.map((card) => (
                  <div className="printed-card" key={card.id}>
                    <CardPrint definition={card.definition} />
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <Hand
              game={game}
              fighter={fighter}
              eliminated={self.eliminated}
              ended={ended}
              prompt={`${prompt}${presentation.reviewing ? ' Review recent events to continue.' : ''}`}
              myTurn={myTurn}
              moving={moving}
              defending={defending}
              discarding={discarding}
              selected={selected}
              disabled={locked}
              onSelect={select}
              onChoose={choose}
              onCommand={send}
              faceUpAttack={
                !!chosen &&
                !!chosenDefinition?.attackMode?.faceUp &&
                attackModeAvailable(game, fighter, chosenDefinition)
                  ? {
                      active: faceUpCard === chosen.id,
                      toggle: () => setFaceUpCard(faceUpCard === chosen.id ? null : chosen.id),
                    }
                  : undefined
              }
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
