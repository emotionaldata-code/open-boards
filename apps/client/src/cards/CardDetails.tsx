import { basic, cardPresentation } from '@open-boards/content';
import { Dialog } from '../ui/Dialog';
import { CardPrint } from './CardPrint';

export function CardDetails({
  definition: id,
  onClose,
}: {
  definition: string;
  onClose: () => void;
}) {
  const card = basic.cards[id];
  const character = basic.characters[cardPresentation[id].character];
  const copies = character.deck.find((entry) => entry.card === id)!.count;
  return (
    <Dialog title={card.name} className="card-dialog" onClose={onClose}>
      <div className="printed-card">
        <CardPrint definition={id} />
      </div>
      <p className="card-copies">
        {character.name} · {copies} {copies === 1 ? 'copy' : 'copies'}
      </p>
    </Dialog>
  );
}
