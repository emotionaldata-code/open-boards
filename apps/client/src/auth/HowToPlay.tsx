import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
export function HowToPlay() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="rules-trigger" onClick={() => setOpen(true)}>
        How to play
      </button>
      {open && (
        <Dialog title="How to play" onClose={() => setOpen(false)}>
          <div className="rules-grid">
            <section>
              <h3>Your turn</h3>
              <p>
                Each turn requires two actions; you cannot pass or end it early. Choose Maneuver to
                draw one card, then move each living fighter once in any order. Select a fighter and
                tap a highlighted space, or Stay. Friends allow traversal; enemies block your path.
                Every destination must be empty. Finish Maneuver keeps your remaining fighters in
                place; any remaining actions must still be taken.
              </p>
            </section>
            <section>
              <h3>Deploy your allies</h3>
              <p>
                Heroes begin at seat spawns. Before the first turn, deploy allies in seat order on
                distinct empty spaces sharing a color with your hero’s starting space. Highlighted
                spaces preserve room for everyone.
              </p>
            </section>
            <section>
              <h3>Play your hand</h3>
              <p>
                Your hero and allies share one deck, hand and action budget. Each card names the
                fighter who can use it. Select the acting fighter before a card. Spend one action to
                play an action card, or select an attack or versatile card, choose a rival in range,
                and commit your attack. Card effects are printed directly on each card. Card effects
                may grant extra actions or end your turn.
              </p>
            </section>
            <section>
              <h3>Choose your reach</h3>
              <p>
                Each fighter has its own reach. Melee fighters attack adjacent enemies. Ranged
                fighters can also attack an enemy sharing a color with your space. A multicolor
                space belongs to every color shown. Range does not pass through other colors;
                occupied spaces do not block ranged attacks. Au, Y, R, B, Br, Gy and G identify
                Gold, Yellow, Red, Blue, Brown, Gray and Green zones.
              </p>
            </section>
            <section>
              <h3>Cross the portals</h3>
              <p>
                Spaces with passage arrows on a light badge below the circle are portals. Step onto
                one, then spend one movement point to reach any other unoccupied portal. You can
                keep moving afterward. Portals do not connect spaces for attacks, pushes or pulls.
              </p>
            </section>
            <section>
              <h3>Answer an attack</h3>
              <p>
                The attacked fighter’s owner may defend with an eligible defense or versatile card
                for free, or take the hit. Both cards reveal after your decision. Damage is attack
                minus defense, to a minimum of zero.
              </p>
            </section>
            <section>
              <h3>Use your character’s abilities</h3>
              <p>
                Abilities resolve automatically or offer a choice before play continues. Tap a
                player’s badge to read their abilities.
              </p>
            </section>
            <section>
              <h3>Be the last standing</h3>
              <p>
                Start with your character’s health and five cards. Discard down to seven at turn
                end. Empty decks never reshuffle: each card you cannot draw deals two damage to each
                of your living fighters, including allies. A defeated ally leaves play. A defeated
                hero eliminates its owner and removes all their allies.
              </p>
            </section>
            <p className="muted">
              Play with 2 or 4 players. On a phone, swipe to pan the map or browse your hand. An
              unexpected disconnect pauses play for up to 120 seconds; leaving forfeits your seat.
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
