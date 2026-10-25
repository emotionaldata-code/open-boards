import { basic, cardPresentation } from '@open-boards/content';
import { Dialog } from '../ui/Dialog';
import { CardPrint } from './CardPrint';
import { hookDescriptions } from './rules';

export function CardDetails({
  definition: id,
  onClose,
}: {
  definition: string;
  onClose: () => void;
}) {
  const card = basic.cards[id];
  const visual = cardPresentation[id];
  const character = basic.characters[visual.character];
  const copies = character.deck.find((entry) => entry.card === id)!.count;
  return (
    <Dialog title={card.name} className="card-dialog" onClose={onClose}>
      <div className="card-inspector">
        <div className="printed-card">
          <CardPrint definition={id} />
        </div>
        <div className="card-explanation">
          <p className="muted">
            {character.name} · {copies} copies in a{' '}
            {character.deck.reduce((n, c) => n + c.count, 0)}-card deck
          </p>
          <h3>How to play</h3>
          <p>Usable by: {card.usableBy}</p>
          <p>
            BOOST {card.boost}: discard this card to boost a Maneuver, or an attack when an ability
            allows it. Its effects do not resolve when used to boost.
          </p>
          <p>
            {card.category === 'action'
              ? 'Spend one action to play this card. The card enters your discard pile and its effects resolve in order.'
              : card.category === 'defense'
                ? card.faceUpDefense
                  ? 'Play when attacked. Defense costs no turn action. This card is played face up; the attack stays hidden until your prediction.'
                  : 'Play when attacked. Defense costs no turn action. Both combat cards are revealed together, then discarded.'
                : `${card.category === 'versatile' ? 'Use to attack or defend. Attacking costs one action; defending is free.' : 'Spend one action to attack a rival in range.'} Both combat cards are revealed together, then discarded.`}
          </p>
          {card.faceUpDefense && (
            <p>
              Play this defense face up and predict the attack’s printed value before revealing the
              attack.
            </p>
          )}
          <h3>Effect</h3>
          <p>{card.description}</p>
          {!!card.abilities?.length && <h3>Timing</h3>}
          {card.abilities?.map((ability) => (
            <p key={ability.id}>
              <strong>{ability.name}</strong> · {hookDescriptions[ability.trigger]}{' '}
              {ability.optional ? ' You may skip this choice.' : ''}
            </p>
          ))}
          <p className="muted">
            {card.category === 'action'
              ? 'Movement effects do not draw an extra maneuver card. Healing cannot exceed starting health.'
              : `Damage is attack minus defense, with a minimum of zero. ${card.usableBy === 'BOTH' ? 'Use the acting fighter’s reach: melee attacks require adjacency; ranged attacks also reach enemies sharing a color.' : (card.usableBy === 'ALLY' ? character.ally?.attackType : character.attackType) === 'melee' ? 'This fighter’s attacks require adjacency.' : 'This fighter’s attacks reach adjacent enemies or enemies sharing a color of its space.'}`}
          </p>
          {character.cardEffectProtection && (
            <p>
              <strong>{character.cardEffectProtection.name}</strong> ·{' '}
              {character.cardEffectProtection.description}
            </p>
          )}
          {(card.usableBy === 'ALLY' ? [] : character.abilities)?.map((ability) => (
            <p key={ability.id}>
              <strong>{ability.name}</strong> · {ability.description}
            </p>
          ))}
          {card.usableBy !== 'MAIN' &&
            character.ally?.abilities?.map((ability) => (
              <p key={`ally-${ability.id}`}>
                <strong>
                  {character.ally!.name} · {ability.name}
                </strong>{' '}
                · {ability.description}
              </p>
            ))}
          <blockquote>{visual.flavor}</blockquote>
        </div>
      </div>
    </Dialog>
  );
}
