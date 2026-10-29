import { GameButton } from '../ui/GameButton';
import { contentText } from '../localization/text';
import { cardCategoryLabel } from '../ui/labels';
import { useState } from 'react';
import { basic } from '@open-boards/content';
import type { GameView } from '@open-boards/protocol';
import { CardDetails } from '../cards/CardDetails';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';

export function DiscardPile({
  player,
  onClose,
}: {
  player: GameView['players'][number];
  onClose: () => void;
}) {
  const [inspected, setInspected] = useState<string | null>(null);
  return (
    <>
      <Dialog title={`Scarti di ${player.name}`} onClose={onClose}>
        <p className="muted">
          {player.discard.length} {player.discard.length === 1 ? 'carta' : 'carte'} · Dalla più
          recente
        </p>
        {player.discard.length ? (
          <ol className="discard-list" aria-label="Carte scartate, dalla più recente">
            {player.discard.toReversed().map((card) => {
              const definition = basic.cards[card.definition];
              return (
                <li key={card.id}>
                  <GameButton onClick={() => setInspected(card.definition)}>
                    <Icon name={definition.category} />
                    <span>
                      {contentText(definition.name)}
                      <small>{cardCategoryLabel[definition.category]}</small>
                    </span>
                    <strong>Valore {definition.value}</strong>
                  </GameButton>
                </li>
              );
            })}
          </ol>
        ) : (
          <p>Nessuna carta scartata.</p>
        )}
      </Dialog>
      {inspected && <CardDetails definition={inspected} onClose={() => setInspected(null)} />}
    </>
  );
}
