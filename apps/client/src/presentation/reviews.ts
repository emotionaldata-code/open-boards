import { contentText } from '../localization/text';
import { basic } from '@open-boards/content';
import { fighterById, fighterDefinition, fighterLabel, type Outcome } from '@open-boards/game';
import type { GameView } from '@open-boards/protocol';
import { hookDescriptions } from '../cards/rules';

export interface PresentedFighter {
  name: string;
  player: string;
  artwork: string;
}
export interface ReviewParticipant {
  fighter: PresentedFighter;
  role: string;
  card?: string;
}
export interface EventReview {
  participants: ReviewParticipant[];
  cards?: string[];
  explanation: string;
  result?: string;
}

function participant(game: GameView, id: string, role: string, card?: string): ReviewParticipant {
  const fighter = fighterById(game, id)!;
  return {
    role,
    card,
    fighter: {
      name: contentText(fighterLabel(fighter, basic)),
      player: game.players.find((p) => p.id === fighter.player)!.name,
      artwork: fighter.definition,
    },
  };
}

// The protocol also uses "played" for discards. Public choice phases disambiguate those receipts.
export function isActionPlay(
  outcome: Extract<Outcome, { type: 'played' }>,
  previous: GameView | null,
) {
  return (
    basic.cards[outcome.card.definition].category === 'action' &&
    previous?.phase.type !== 'discarding' &&
    previous?.phase.type !== 'ability-choice'
  );
}

// Read only confirmed outcomes. Never inspect hands or the committed attack card.
export function outcomeReview(
  outcome: Outcome,
  game: GameView,
  previous: GameView | null,
): EventReview | undefined {
  switch (outcome.type) {
    case 'hand-revealed':
      return {
        participants: [],
        cards: outcome.cards.map((c) => c.definition),
        explanation: `${game.players.find((p) => p.id === outcome.player)!.name} rivela ${outcome.cards.length} ${outcome.cards.length === 1 ? 'carta' : 'carte'} ${outcome.zone === 'deck' ? 'dal proprio mazzo' : 'dalla propria mano'}.`,
      };
    case 'played':
      if (!isActionPlay(outcome, previous)) return;
      return {
        participants: [
          participant(game, outcome.fighter, 'Carta giocata', outcome.card.definition),
        ],
        explanation: 'La carta è stata giocata. I suoi effetti si risolvono in ordine.',
      };
    case 'boost':
      return {
        participants: [
          participant(
            game,
            outcome.fighter,
            outcome.cancelled ? 'BOOST annullato' : `BOOST +${outcome.amount}`,
            outcome.card.definition,
          ),
        ],
        explanation: outcome.cancelled
          ? 'Il BOOST viene scartato senza effetto perché gli effetti della carta attacco sono stati annullati.'
          : `La carta viene scartata per aggiungere ${outcome.amount} a ${outcome.purpose === 'maneuver' ? 'il movimento di ogni tuo combattente per questa manovra' : outcome.purpose === 'defense' ? 'questa difesa' : 'questo attacco'}. I suoi effetti non si risolvono.`,
      };
    case 'combat': {
      const { attacker, defender, attack, defense, boosts, damage, bonus, prediction } =
        outcome.combat;
      return {
        participants: [
          participant(
            game,
            attacker,
            bonus ? `${contentText(bonus.name)} · Attacco ${bonus.value}` : 'Attacco',
            attack.definition,
          ),
          participant(game, defender, defense ? 'Difesa' : 'Nessuna difesa', defense?.definition),
          ...boosts.map(({ card, amount, cancelled, field }) =>
            participant(
              game,
              field === 'defense' ? defender : attacker,
              cancelled ? 'BOOST annullato' : `BOOST +${amount}`,
              card.definition,
            ),
          ),
        ],
        explanation:
          (prediction !== undefined ? `Valore di attacco stampato previsto: ${prediction}. ` : '') +
          (bonus
            ? `${contentText(bonus.name)} è un attacco separato con valore stampato ${bonus.value}. Gli effetti dell’attacco originale non si ripetono. `
            : '') +
          (defense
            ? 'Entrambe le carte sono rivelate. I valori sono indicati sotto; le abilità possono modificare l’esito.'
            : 'La carta attacco è rivelata. Non è stata giocata alcuna carta difesa.') +
          boosts
            .map(({ amount, cancelled, field }) =>
              !cancelled
                ? ` Il BOOST aggiunge ${amount} al valore di ${field === 'defense' ? 'difesa' : 'attacco'}. Gli effetti della carta usata per il BOOST vengono ignorati.`
                : ' Il BOOST è stato scartato senza effetto.',
            )
            .join(''),
        result: damage
          ? `${contentText(fighterDefinition(fighterById(game, defender)!, basic).name)} subisce ${damage} danni.`
          : 'Nessun danno da combattimento.',
      };
    }
    case 'ability': {
      const fighter = fighterById(game, outcome.fighter)!;
      const definition = fighterDefinition(fighter, basic);
      const card = basic.characters[fighter.character].deck
        .map((entry) => basic.cards[entry.card])
        .find((card) => card.abilities?.some((ability) => ability.name === outcome.name));
      // Card and status abilities use the same serialized vocabulary as fighter abilities.
      const ability = [
        ...(definition.abilities ?? []),
        ...Object.values(basic.statuses ?? {}).flatMap((s) => s.abilities ?? []),
        ...(card?.abilities ?? []),
      ].find((a) => a.name === outcome.name);
      return {
        participants: [participant(game, outcome.fighter, 'Abilità attivata', card?.id)],
        explanation:
          contentText(ability?.description) ??
          `${contentText(outcome.name)} si attiva. Seguono i suoi effetti confermati.`,
        result: ability ? hookDescriptions[ability.trigger] : undefined,
      };
    }
    case 'status': {
      const status = basic.statuses?.[outcome.status];
      return {
        participants: [participant(game, outcome.fighter, 'Effetto di stato')],
        explanation: outcome.stacks
          ? `${contentText(status?.name) ?? outcome.status} è attivo con ${outcome.stacks} ${outcome.stacks === 1 ? 'accumulo' : 'accumuli'}.`
          : `${contentText(status?.name) ?? outcome.status} viene rimosso.`,
        result: outcome.stacks
          ? status?.abilities?.map((a) => contentText(a.description)).join(' ')
          : undefined,
      };
    }
    case 'damage':
      // The combat reveal already contains the authoritative combat damage.
      if (outcome.reason === 'combat') return;
      return {
        participants: [
          participant(
            game,
            outcome.fighter,
            outcome.reason === 'exhaustion' ? 'Esaurimento' : 'Effetto di danno',
          ),
        ],
        explanation: `${outcome.amount} danni inflitti.`,
      };
    case 'revived':
      return {
        participants: [participant(game, outcome.fighter, 'Alleato ritornato')],
        explanation:
          'Lo stesso alleato ritorna con tutta la vita iniziale, senza stati e con i contatori iniziali.',
      };
    case 'heal':
      return {
        participants: [participant(game, outcome.fighter, 'Effetto di cura')],
        explanation: `${outcome.amount} punti vita recuperati.`,
      };
    default:
      return;
  }
}
