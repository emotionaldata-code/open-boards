import type { Hook } from '@open-boards/game';

/** Human timing labels, independent of the interpreter and its implementation. */
export const hookDescriptions: Record<Hook, string> = {
  'game-start': 'Durante la preparazione, prima del primo turno.',
  'turn-start': 'All’inizio del tuo turno.',
  'turn-end': 'Alla fine del tuo turno.',
  'before-draw': 'Prima di pescare carte.',
  'after-draw': 'Dopo aver pescato carte.',
  'after-maneuver': 'Dopo aver completato la Manovra, anche senza muovere.',
  'maneuver-boosted': 'Dopo aver potenziato una manovra e risolto le reazioni allo scarto.',
  'before-move': 'Prima del movimento.',
  'after-move': 'Dopo il movimento.',
  'before-attack': 'Prima della scelta del difensore; questo effetto resta privato.',
  'after-attack': 'Dopo la risoluzione del tuo attacco.',
  'before-defense': 'Prima di rivelare la difesa; questo effetto resta privato.',
  'after-defense': 'Dopo la risoluzione della tua difesa.',
  'combat-reveal': 'Quando entrambe le carte di combattimento vengono rivelate.',
  'before-combat': 'Dopo la rivelazione, prima dei danni da combattimento.',
  'after-combat': 'Dopo la risoluzione dei danni da combattimento.',
  'before-damage': 'Prima di applicare i danni.',
  'after-damage': 'Dopo aver applicato i danni.',
  'before-heal': 'Prima di applicare la cura.',
  'after-heal': 'Dopo aver applicato la cura.',
  'after-action': 'Dopo la risoluzione dello stratagemma.',
  'card-played': 'Quando la carta viene giocata.',
  'card-discarded': 'Quando la carta viene scartata.',
  eliminated: 'Quando un combattente viene sconfitto.',
};
