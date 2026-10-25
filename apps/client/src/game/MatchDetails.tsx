import { useState } from 'react';
import { basic } from '@open-boards/content';
import { mainFighter, fighterDefinition, fighterLabel, movement } from '@open-boards/game';
import type { RoomView } from '@open-boards/protocol';
import { Dialog } from '../ui/Dialog';
import { CharacterPortrait } from '../characters/CharacterPortrait';
import { Icon } from '../ui/Icon';
export function MatchDetails({ room, selfId }: { room: RoomView; selfId: string }) {
  const game = room.game!;
  const [detail, setDetail] = useState<string | null>(null);
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
              <button
                key={p.id}
                style={
                  {
                    '--health': `${(f.hp / basic.characters[p.character].hp) * 100}%`,
                  } as React.CSSProperties
                }
                className={`player-badge ${p.eliminated ? 'eliminated' : ''} ${game.turn === i && game.phase.type !== 'finished' ? 'active-player' : ''}`}
                onClick={() => setDetail(p.id)}
                aria-label={`${p.name}${p.id === selfId ? ' (you)' : ''}: ${f.hp} health, ${movement(f, basic)} movement, ${p.handCount} cards. Player details`}
                aria-describedby={allies.length ? `allies-${p.id}` : undefined}
              >
                <span className={`player-sigil seat-${i}`}>
                  <CharacterPortrait character={p.character} />
                </span>
                <span className="badge-name">
                  {p.name}
                  <small>
                    {p.id === selfId ? 'You · ' : ''}
                    {basic.characters[p.character].name} ·{' '}
                    {basic.characters[p.character].attackType}
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
          <h3>Discard pile · {player.discard.length}</h3>
          {player.discard.length ? (
            <ul className="discard-list">
              {player.discard.map((card) => (
                <li key={card.id}>
                  <Icon name={basic.cards[card.definition].category} />
                  <span>{basic.cards[card.definition].name}</span>
                  <strong>{basic.cards[card.definition].value || 'Action'}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No cards discarded yet.</p>
          )}
        </Dialog>
      )}
    </>
  );
}
