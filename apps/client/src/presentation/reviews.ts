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
      name: fighterLabel(fighter, basic),
      player: game.players.find((p) => p.id === fighter.player)!.name,
      artwork: fighter.role === 'ally' ? fighter.definition : fighter.character,
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
        explanation: `${game.players.find((p) => p.id === outcome.player)!.name} reveals their hand because no combat card matches the named value.`,
      };
    case 'played':
      if (!isActionPlay(outcome, previous)) return;
      return {
        participants: [participant(game, outcome.fighter, 'Card played', outcome.card.definition)],
        explanation: 'The card is played. Its effects resolve next, in order.',
      };
    case 'boost':
      return {
        participants: [
          participant(
            game,
            outcome.fighter,
            outcome.cancelled ? 'BOOST cancelled' : `Boost ${outcome.purpose} +${outcome.amount}`,
            outcome.card.definition,
          ),
        ],
        explanation: outcome.cancelled
          ? 'The BOOST is discarded without effect because the attack card’s effects were cancelled.'
          : `The card is discarded to add ${outcome.amount} to ${outcome.purpose === 'maneuver' ? 'each owned fighter’s movement for this Maneuver' : outcome.purpose === 'defense' ? 'this defense' : 'this attack'}. Its own effects do not resolve.`,
      };
    case 'combat': {
      const { attacker, defender, attack, defense, boosts, damage, bonus, prediction } =
        outcome.combat;
      return {
        participants: [
          participant(
            game,
            attacker,
            bonus ? `${bonus.name} · Attack ${bonus.value}` : 'Attack',
            attack.definition,
          ),
          participant(game, defender, defense ? 'Defense' : 'No defense', defense?.definition),
          ...boosts.map(({ card, amount, cancelled, field }) =>
            participant(
              game,
              field === 'defense' ? defender : attacker,
              cancelled ? 'BOOST cancelled' : `BOOST +${amount}`,
              card.definition,
            ),
          ),
        ],
        explanation:
          (prediction !== undefined ? `Predicted printed attack value: ${prediction}. ` : '') +
          (bonus
            ? `${bonus.name} is a separate attack with printed value ${bonus.value}. The original attack effects do not repeat. `
            : '') +
          (defense
            ? 'Both cards are revealed. Card values are printed below; abilities can modify the result.'
            : 'The attack card is revealed. No defense card was played.') +
          boosts
            .map(({ amount, cancelled, field }) =>
              !cancelled
                ? ` BOOST adds ${amount} to the ${field === 'defense' ? 'defense' : 'attack'}. The boosting card’s effects are ignored.`
                : ' The BOOST was discarded without effect.',
            )
            .join(''),
        result: damage
          ? `${fighterDefinition(fighterById(game, defender)!, basic).name} takes ${damage} damage.`
          : 'No combat damage is dealt.',
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
        participants: [participant(game, outcome.fighter, 'Ability triggered', card?.id)],
        explanation:
          ability?.description ?? `${outcome.name} triggers. Its confirmed effects follow.`,
        result: ability ? hookDescriptions[ability.trigger] : undefined,
      };
    }
    case 'status': {
      const status = basic.statuses?.[outcome.status];
      return {
        participants: [participant(game, outcome.fighter, 'Status effect')],
        explanation: outcome.stacks
          ? `${status?.name ?? outcome.status} is active with ${outcome.stacks} ${outcome.stacks === 1 ? 'stack' : 'stacks'}.`
          : `${status?.name ?? outcome.status} is removed.`,
        result: outcome.stacks ? status?.abilities?.map((a) => a.description).join(' ') : undefined,
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
            outcome.reason === 'exhaustion' ? 'Exhaustion' : 'Damage effect',
          ),
        ],
        explanation: `${outcome.amount} damage is dealt.`,
      };
    case 'revived':
      return {
        participants: [participant(game, outcome.fighter, 'Ally returned')],
        explanation:
          'The same ally returns at full printed health with cleared statuses and initial counters.',
      };
    case 'heal':
      return {
        participants: [participant(game, outcome.fighter, 'Healing effect')],
        explanation: `${outcome.amount} health is restored.`,
      };
    default:
      return;
  }
}
