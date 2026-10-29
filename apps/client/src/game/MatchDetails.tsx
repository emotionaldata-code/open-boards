import { GameButton } from '../ui/GameButton';
import { contentText } from '../localization/text';
import { attackTypeLabel } from '../ui/labels';
import { useState } from 'react';
import { basic } from '@open-boards/content';
import { mainFighter, fighterDefinition, fighterLabel, movement } from '@open-boards/game';
import type { RoomView } from '@open-boards/protocol';
import { Dialog } from '../ui/Dialog';
import { CharacterPortrait } from '../characters/CharacterPortrait';
import { DiscardPile } from './DiscardPile';
import { Icon } from '../ui/Icon';
export function MatchDetails({ room, selfId }: { room: RoomView; selfId: string | null }) {
  const game = room.game!;
  const [detail, setDetail] = useState<string | null>(null);
  const [discardId, setDiscardId] = useState<string | null>(null);
  const discards = game.players.find((p) => p.id === discardId);
  const player = game.players.find((p) => p.id === detail);
  const main = player ? mainFighter(game, player.id) : null;
  const seat = room.seats.find((s) => s.id === detail);
  return (
    <>
      <aside className="match-hud" aria-label="Giocatori">
        <div className="player-badges">
          {game.players.map((p, i) => {
            const f = mainFighter(game, p.id);
            const allies = game.fighters.filter(
              (ally) => ally.player === p.id && ally.role === 'ally',
            );
            return (
              <div className="player-summary" key={p.id}>
                <GameButton
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
                  aria-label={`${p.name}${p.id === selfId ? ' (tu)' : ''}: ${f.hp} vita, ${movement(f, basic, game)} movimento, ${p.handCount} carte. Dettagli giocatore`}
                  aria-describedby={allies.length ? `allies-${p.id}` : undefined}
                >
                  <span className={`player-sigil seat-${i}`}>
                    <CharacterPortrait character={f.definition} sizes="64px" />
                  </span>
                  <span className="badge-name">
                    {p.name}
                    <small>
                      {p.id === selfId ? 'Tu · ' : ''}
                      {contentText(fighterDefinition(f, basic).name)} ·{' '}
                      {f.position === null && !f.defeated
                        ? 'fuori plancia'
                        : attackTypeLabel[basic.characters[p.character].attackType]}
                    </small>
                  </span>
                  <span className="badge-movement">
                    {movement(f, basic, game)}
                    <small>
                      <Icon name="move" /> Movimento
                    </small>
                  </span>
                  <span className="badge-counts">
                    {p.handCount}
                    <small>
                      <Icon name="cards" /> carte
                    </small>
                  </span>
                  <strong className="badge-health">
                    {f.hp}
                    <small>
                      <Icon name="health" /> PV
                    </small>
                  </strong>
                  {allies.length > 0 && (
                    <span className="badge-allies" id={`allies-${p.id}`}>
                      {allies.map((ally) => {
                        const definition = fighterDefinition(ally, basic);
                        const label = contentText(fighterLabel(ally, basic));
                        return (
                          <span
                            key={ally.id}
                            className={`badge-ally ${ally.defeated ? 'defeated-ally' : ''}`}
                            aria-label={`${label}: ${ally.defeated ? 'Sconfitto' : `${ally.hp} / ${definition.hp} PV · ${attackTypeLabel[definition.attackType]}`}`}
                            title={`${label} · ${attackTypeLabel[definition.attackType]}`}
                          >
                            <CharacterPortrait character={ally.definition} />
                            <span>{label}</span>
                            <strong>
                              {ally.defeated ? 'Fuori' : `${ally.hp}/${definition.hp}`}
                              {!ally.defeated && <small> PV</small>}
                            </strong>
                          </span>
                        );
                      })}
                    </span>
                  )}
                </GameButton>
                <GameButton
                  className="discard-trigger"
                  aria-label={`${p.name}: Scarti · ${p.discard.length}`}
                  onClick={() => setDiscardId(p.id)}
                >
                  <span>
                    Scarti<span className="discard-separator"> · </span>
                  </span>
                  <span className="discard-count">{p.discard.length}</span>
                </GameButton>
              </div>
            );
          })}
        </div>
      </aside>
      {player && (
        <Dialog
          title={`${player.name}${player.id === selfId ? ' · Tu' : ''}`}
          onClose={() => setDetail(null)}
        >
          <p className="muted">
            {player.eliminated
              ? 'Eliminato'
              : !seat?.connected
                ? 'Disconnesso · posto riservato fino a 120 secondi'
                : `${contentText(basic.characters[player.character].name)} · ${attackTypeLabel[basic.characters[player.character].attackType]} · Connesso`}
          </p>
          {main!.position === null && !main!.defeated && (
            <p>Fuori plancia · ritorna all’inizio del prossimo turno.</p>
          )}
          <div className="player-stats">
            <div>
              <strong>{movement(main!, basic, game)}</strong>
              <span>Movimento</span>
            </div>
            <div>
              <strong>
                {main!.hp}
                <small> / {basic.characters[player.character].hp}</small>
              </strong>
              <span>Vita</span>
            </div>
            <div>
              <strong>{player.handCount}</strong>
              <span>In mano</span>
            </div>
            <div>
              <strong>{player.deckCount}</strong>
              <span>Nel mazzo</span>
            </div>
          </div>
          {basic.characters[player.character].deckSelection && (
            <p>
              <strong>{contentText(basic.characters[player.character].deckSelection!.name)}</strong>{' '}
              · {contentText(basic.characters[player.character].deckSelection!.description)}
            </p>
          )}
          {(player.ongoing ?? []).map((card) => (
            <p key={card.id}>
              <strong>{contentText(basic.cards[card.definition].name)} · Attiva</strong>
              <br />
              {contentText(basic.cards[card.definition].description)}
            </p>
          ))}
          {(basic.characters[player.character].abilities ?? []).map((ability) => (
            <p key={ability.id}>
              <strong>{contentText(ability.name)}</strong> · {contentText(ability.description)}
            </p>
          ))}
          {(basic.characters[player.character].conditionalModifiers ?? []).map((rule) => (
            <p key={rule.name}>
              <strong>{contentText(rule.name)}</strong> · {contentText(rule.description)}
            </p>
          ))}
          {basic.characters[player.character].discardBase && (
            <p>
              <strong>{contentText(basic.characters[player.character].discardBase!.name)}</strong> ·{' '}
              {contentText(basic.characters[player.character].discardBase!.description)}
            </p>
          )}
          {basic.characters[player.character].maneuverBonus && (
            <p>
              <strong>{contentText(basic.characters[player.character].maneuverBonus!.name)}</strong>{' '}
              · {contentText(basic.characters[player.character].maneuverBonus!.description)}
            </p>
          )}
          {Object.entries(main!.counters).map(([name, count]) => (
            <p key={name}>
              {name}: {count}
            </p>
          ))}
          {main!.statuses.map((status) => (
            <p key={status.id}>
              {contentText(basic.statuses?.[status.id]?.name) ?? status.id} · {status.stacks}{' '}
              accumuli
              {status.turns ? ` · ${status.turns} turni` : ''}
            </p>
          ))}
          {game.fighters
            .filter((f) => f.player === player.id && f.role === 'ally')
            .map((f) => (
              <div key={f.id}>
                <p>
                  <strong>{contentText(fighterLabel(f, basic))}</strong> ·{' '}
                  {f.defeated
                    ? 'Sconfitto'
                    : `${f.hp} / ${fighterDefinition(f, basic).hp} PV · ${attackTypeLabel[fighterDefinition(f, basic).attackType]}`}
                </p>
                {fighterDefinition(f, basic).abilities?.map((ability) => (
                  <p key={ability.id}>
                    <strong>{contentText(ability.name)}</strong> ·{' '}
                    {contentText(ability.description)}
                  </p>
                ))}
                {Object.entries(f.counters).map(([name, count]) => (
                  <p key={name}>
                    {name}: {count}
                  </p>
                ))}
                {f.statuses.map((s) => (
                  <p key={s.id}>
                    {contentText(basic.statuses?.[s.id]?.name) ?? s.id} · {s.stacks} accumuli
                    {s.turns ? ` · ${s.turns} turni` : ''}
                  </p>
                ))}
              </div>
            ))}
          <GameButton onClick={() => setDiscardId(player.id)}>
            Scarti · {player.discard.length}
          </GameButton>
        </Dialog>
      )}
      {discards && <DiscardPile player={discards} onClose={() => setDiscardId(null)} />}
    </>
  );
}
