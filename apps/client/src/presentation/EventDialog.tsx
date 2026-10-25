import { useRef, useState } from 'react';
import type { PresentationEvent } from '../animation/events';
import { CardPrint } from '../cards/CardPrint';
import { CharacterPortrait } from '../characters/CharacterPortrait';
import { Dialog } from '../ui/Dialog';

export function EventDialog({
  event,
  onAcknowledge,
}: {
  event: PresentationEvent;
  onAcknowledge: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const acknowledgement = useRef<HTMLButtonElement>(null);
  const review = event.review!;
  return (
    <Dialog
      title={event.title}
      className="event-dialog"
      dismissible={false}
      initialFocus={acknowledgement}
      onClose={onAcknowledge}
    >
      <div className="event-review" data-event={event.id} data-tone={event.tone}>
        <div className="event-content">
          <p className="event-explanation">{review.explanation}</p>
          <div className="event-participants">
            {review.participants.map(({ fighter, role, card }, index) => (
              <article className="event-participant" key={index}>
                <div className="event-fighter">
                  <CharacterPortrait character={fighter.artwork} />
                  <div>
                    <h3>{fighter.name}</h3>
                    <p>{fighter.player}</p>
                    <strong>{role}</strong>
                  </div>
                </div>
                {card && (
                  <div className="printed-card">
                    <CardPrint definition={card} />
                  </div>
                )}
              </article>
            ))}
          </div>
          {review.cards && (
            <div className="event-participants">
              {review.cards.map((card, index) => (
                <div className="printed-card" key={index}>
                  <CardPrint definition={card} />
                </div>
              ))}
            </div>
          )}
          {review.result && <p className="event-result">{review.result}</p>}
        </div>
        <footer className="event-acknowledgement">
          <span>Read at your pace. Acknowledge to continue.</span>
          <button
            className="primary"
            ref={acknowledgement}
            disabled={acknowledged}
            onClick={() => {
              setAcknowledged(true);
              onAcknowledge();
            }}
          >
            {acknowledged ? 'Continuing…' : 'Acknowledge'}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
