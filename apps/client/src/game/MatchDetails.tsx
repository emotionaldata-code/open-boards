import { useState } from 'react';
import { basic } from '@open-boards/content';
import { mainFighter, fighterDefinition, fighterLabel, movement } from '@open-boards/game';
import type { RoomView } from '@open-boards/protocol';
import { Dialog } from '../ui/Dialog';
import { CharacterPortrait } from '../characters/CharacterPortrait';
import { DiscardPile } from './DiscardPile';
export function MatchDetails({ room, selfId }: { room: RoomView; selfId: string }) {
  const game = room.game!;
  const [detail, setDetail] = useState<string | null>(null);
  const [discardId, setDiscardId] = useState<string | null>(null);
  const discards = game.players.find((p) => p.id === discardId);
  const player = game.players.find((p) => p.id === detail);
  const main = player ? mainFighter(game, player.id) : null;
  const seat = room.seats.find((s) => s.id === detail);
  return (
    <>
      <aside className="match-hud" aria-label="Players">
        <div className="player-badges">
          {game.players.map((p, i) => {
            const f = mainFighter(game, p.id);
            const allies = game.fighters.filter(
              (ally) => ally.player === p.id && ally.role === 'ally',
            );
            return (
              <div className="player-summary" key={p.id}>
                <button
                  style={
                    {
                      '--health': `${(f.hp / basic.characters[p.character].hp) * 100}%`,
                    } as React.CSSProperties
                  }
                  className={`player-badge ${p.eliminated ? 'eliminated' : ''} ${game.turn === i && game.phase.type !== 'finished' ? 'active-player' : ''}`}
                  aria-current={
                    game.turn === i && game.phase.type !== 'finished' ? 'step' : undefined
                  }
                  onClick={() => setDetail(p.id)}
                  aria-label={`${p.name}${p.id === selfId ? ' (you)' : ''}: ${f.hp} health, ${movement(f, basic)} movement, ${p.handCount} cards. Player details`}
                  aria-describedby={allies.length ? `allies-${p.id}` : undefined}
                >
                  <span className={`player-sigil seat-${i}`}>
                    <CharacterPortrait character={p.character} sizes="64px" />
                  </span>
                  <span className="badge-name">
                    {p.name}
                    <small>
                      {p.id === selfId ? 'You · ' : ''}
                      {basic.characters[p.character].name} ·{' '}
                      {f.position === null && !f.defeated
                        ? 'away'
                        : basic.characters[p.character].attackType}
                    </small>
                  </span>
                  <span className="badge-movement">
                    {movement(f, basic)}
                    <small>Move</small>
                  </span>
                  <span className="badge-counts">
                    {p.handCount}
                    <small>cards</small>
                  </span>
                  <strong className="badge-health">
                    {f.hp}
                    <small>HP</small>
                  </strong>
                  {allies.length > 0 && (
                    <span className="badge-allies" id={`allies-${p.id}`}>
                      {allies.map((ally) => {
                        const definition = fighterDefinition(ally, basic);
                        const label = fighterLabel(ally, basic);
                        return (
                          <span
                            key={ally.id}
                            className={`badge-ally ${ally.defeated ? 'defeated-ally' : ''}`}
                            aria-label={`${label}: ${ally.defeated ? 'Defeated' : `${ally.hp} / ${definition.hp} HP · ${definition.attackType}`}`}
                            title={`${label} · ${definition.attackType}`}
                          >
                            <CharacterPortrait character={ally.definition} />
                            <span>{label}</span>
                            <strong>
                              {ally.defeated ? 'Out' : `${ally.hp}/${definition.hp}`}
                              {!ally.defeated && <small> HP</small>}
                            </strong>
                          </span>
                        );
                      })}
                    </span>
                  )}
                </button>
                <button
                  className="discard-trigger"
                  aria-label={`${p.name}: Discards · ${p.discard.length}`}
                  onClick={() => setDiscardId(p.id)}
                >
                  <span>
                    Discards<span className="discard-separator"> · </span>
                  </span>
                  <span className="discard-count">{p.discard.length}</span>
                </button>
              </div>
            );
          })}
        </div>
      </aside>
      {player && (
        <Dialog
          title={`${player.name}${player.id === selfId ? ' · You' : ''}`}
          onClose={() => setDetail(null)}
        >
          <p className="muted">
            {player.eliminated
              ? 'Eliminated'
              : !seat?.connected
                ? 'Disconnected · seat reserved for up to 120 seconds'
                : `${basic.characters[player.character].name} · ${basic.characters[player.character].attackType} · Connected`}
          </p>
          {main!.position === null && !main!.defeated && (
            <p>Off the board · returns at the start of the next turn.</p>
          )}
          <div className="player-stats">
            <div>
              <strong>{movement(main!, basic)}</strong>
              <span>Movement</span>
            </div>
            <div>
              <strong>
                {main!.hp}
                <small> / {basic.characters[player.character].hp}</small>
              </strong>
              <span>Health</span>
            </div>
            <div>
              <strong>{player.handCount}</strong>
              <span>In hand</span>
            </div>
            <div>
              <strong>{player.deckCount}</strong>
              <span>In deck</span>
            </div>
          </div>
          {basic.characters[player.character].deckSelection && (
            <p>
              <strong>{basic.characters[player.character].deckSelection!.name}</strong> ·{' '}
              {basic.characters[player.character].deckSelection!.description}
            </p>
          )}
          {(player.ongoing ?? []).map((card) => (
            <p key={card.id}>
              <strong>{basic.cards[card.definition].name} · Active</strong>
              <br />
              {basic.cards[card.definition].description}
            </p>
          ))}
          {(basic.characters[player.character].abilities ?? []).map((ability) => (
            <p key={ability.id}>
              <strong>{ability.name}</strong> · {ability.description}
            </p>
          ))}
          {Object.entries(main!.counters).map(([name, count]) => (
            <p key={name}>
              {name}: {count}
            </p>
          ))}
          {main!.statuses.map((status) => (
            <p key={status.id}>
              {basic.statuses?.[status.id]?.name ?? status.id} · {status.stacks} stacks
              {status.turns ? ` · ${status.turns} turns` : ''}
            </p>
          ))}
          {game.fighters
            .filter((f) => f.player === player.id && f.role === 'ally')
            .map((f) => (
              <div key={f.id}>
                <p>
                  <strong>{fighterLabel(f, basic)}</strong> ·{' '}
                  {f.defeated
                    ? 'Defeated'
                    : `${f.hp} / ${fighterDefinition(f, basic).hp} HP · ${fighterDefinition(f, basic).attackType}`}
                </p>
                {fighterDefinition(f, basic).abilities?.map((ability) => (
                  <p key={ability.id}>
                    <strong>{ability.name}</strong> · {ability.description}
                  </p>
                ))}
                {Object.entries(f.counters).map(([name, count]) => (
                  <p key={name}>
                    {name}: {count}
                  </p>
                ))}
                {f.statuses.map((s) => (
                  <p key={s.id}>
                    {basic.statuses?.[s.id]?.name ?? s.id} · {s.stacks} stacks
                    {s.turns ? ` · ${s.turns} turns` : ''}
                  </p>
                ))}
              </div>
            ))}
          <button onClick={() => setDiscardId(player.id)}>
            Discards · {player.discard.length}
          </button>
        </Dialog>
      )}
      {discards && <DiscardPile player={discards} onClose={() => setDiscardId(null)} />}
    </>
  );
}
