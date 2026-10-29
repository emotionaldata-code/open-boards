import { contentText } from '../localization/text';

// Translate public server copy at the presentation boundary; commands and saved rules stay unchanged.
const messages: Record<string, string> = {
  Connected: 'Connesso',
  Disconnected: 'Disconnesso',
  'Reconnecting…': 'Riconnessione…',
  'Stay in place': 'Resta fermo',
  'Leave token in place': 'Lascia il segnalino dov’è',
  'Decline discard': 'Non scartare',
  'Ignore this discard effect?': 'Ignorare questo effetto di scarto?',
  'Ignore the effect': 'Ignora l’effetto',
  'Resolve the effect': 'Risolvi l’effetto',
  'Choose a player': 'Scegli un giocatore',
  'Choose a fighter': 'Scegli un combattente',
  'Choose the replacement attack': 'Scegli l’attacco sostitutivo',
  'Choose the next fighter': 'Scegli il prossimo combattente',
  'Choose a destination': 'Scegli una destinazione',
  'Choose a token': 'Scegli un segnalino',
  'Choose the next token': 'Scegli il prossimo segnalino',
  'Choose a zone this fighter is in': 'Scegli una zona del combattente',
  'Choose the first space': 'Scegli la prima casella',
  'Choose an adjacent space': 'Scegli una casella adiacente',
  'Return a defeated ally': 'Riporta in gioco un alleato sconfitto',
  'Choose where to return the ally': 'Scegli dove riportare l’alleato',
  'Predict the printed attack value': 'Prevedi il valore di attacco stampato',
  'Name an attack or defense value': 'Indica un valore di attacco o difesa',
  'Secretly choose a card to reveal': 'Scegli in segreto una carta da rivelare',
  'Choose a pile to search': 'Scegli dove cercare',
  'Search deck first': 'Cerca prima nel mazzo',
  'Search discard first': 'Cerca prima negli scarti',
  'Order the remaining cards: choose the next top card':
    'Ordina le carte rimanenti: scegli la prossima carta in cima',
  'Shuffle a discarded card into your deck': 'Rimescola una carta scartata nel mazzo',
  'Return a discarded card to your hand': 'Riprendi in mano una carta scartata',
  'Choose a card from your deck or discard': 'Scegli una carta dal mazzo o dagli scarti',
  'Choose the next card for the top of your deck':
    'Scegli la prossima carta da mettere in cima al mazzo',
  'Discard 1 card or decline': 'Scarta una carta oppure rifiuta',
  'Boost attack': 'Potenzia attacco',
  'Boost defense': 'Potenzia difesa',
  'Face-up combat cards': 'Carte di combattimento scoperte',
  'Face-up attack': 'Attacco scoperto',
  'Face-up defense · predicting the attack value':
    'Difesa scoperta · previsione del valore di attacco',
  'That username is already taken.': 'Questo nome utente è già in uso.',
  'Username or password is incorrect.': 'Nome utente o password errati.',
  'Sign in to continue.': 'Accedi per continuare.',
  'Sign in to join a room.': 'Accedi per entrare in una stanza.',
  'Invalid session.': 'Sessione non valida.',
  'This room is full or has already started.': 'Questa stanza è piena o la partita è già iniziata.',
  'This account already has an active seat.': 'Questo account ha già un posto attivo.',
  'Readiness cannot change now.': 'Non puoi cambiare lo stato di pronto adesso.',
  'Characters can only change before the match starts.':
    'Puoi cambiare personaggio solo prima dell’inizio della partita.',
  'Choose a supported character.': 'Scegli un personaggio disponibile.',
  'The host can start when every seat is filled and ready.':
    'L’organizzatore può iniziare quando tutti i posti sono occupati e tutti sono pronti.',
  'The match has not started.': 'La partita non è ancora iniziata.',
  'Waiting for disconnected players to return.': 'In attesa della riconnessione dei giocatori.',
  'This seat cannot reconnect.': 'Non è possibile riconnettersi a questo posto.',
  'Choose 2 or 4 seats.': 'Scegli 2 o 4 posti.',
  'Invalid command.': 'Comando non valido.',
  'This command was already applied.': 'Questo comando è già stato eseguito.',
  'The board changed. Try again with the latest state.':
    'La plancia è cambiata. Riprova con lo stato aggiornato.',
  'You do not have an active seat.': 'Non hai un posto attivo.',
  'The match is finished.': 'La partita è terminata.',
  'Wait for your deployment turn.': 'Attendi il tuo turno di posizionamento.',
  'Choose a legal empty starting space.':
    'Scegli una casella iniziale vuota tra quelle consentite.',
  'Only the defender can respond.': 'Può rispondere solo il difensore.',
  'That card cannot defend.': 'Questa carta non può essere usata per difendersi.',
  'No combat is pending.': 'Nessun combattimento in corso.',
  'Boost only once, before any fighter moves in this Maneuver.':
    'Puoi potenziare una sola volta, prima di muovere un combattente in questa manovra.',
  'No Maneuver is pending for you.': 'Non hai una manovra da completare.',
  'No movement is pending for you.': 'Non hai un movimento da completare.',
  'Choose a fighter that has not moved in this Maneuver.':
    'Scegli un combattente che non si è ancora mosso in questa manovra.',
  'Choose an unoccupied path within your movement range.':
    'Scegli un percorso libero entro il tuo movimento.',
  'No discard is pending for you.': 'Non devi scartare carte adesso.',
  'Discard exactly enough cards to keep seven.': 'Scarta le carte in eccesso per tenerne sette.',
  'Choose a card from your hand.': 'Scegli una carta dalla tua mano.',
  'Resolve the pending choice first.': 'Risolvi prima la scelta in sospeso.',
  'Wait for your turn.': 'Attendi il tuo turno.',
  'No actions remain.': 'Non hai più azioni disponibili.',
  'Choose an opponent within your character’s attack range.':
    'Scegli un avversario entro la portata del tuo combattente.',
  'Choose a living owned fighter.': 'Scegli un tuo combattente in vita.',
  'Choose an action card.': 'Scegli una carta stratagemma.',
  'Unknown command.': 'Comando sconosciuto.',
  'Untrusted origin.': 'Origine della richiesta non consentita.',
};

const patterns: [RegExp, (...parts: string[]) => string][] = [
  [/^Use (.+)$/, (name) => `Usa ${contentText(name)}`],
  [/^Space (\d+)$/, (space) => `Casella ${space}`],
  [/^Place (.+)$/, (name) => `Colloca ${contentText(name)}`],
  [/^Move (.+)$/, (name) => `Muovi ${contentText(name)}`],
  [/^Choose where to move (.+)$/, (name) => `Scegli dove muovere ${contentText(name)}`],
  [/^Choose where to place (.+)$/, (name) => `Scegli dove collocare ${contentText(name)}`],
  [/^Choose where to push (.+)$/, (name) => `Scegli dove spingere ${contentText(name)}`],
  [/^Choose where to pull (.+)$/, (name) => `Scegli dove attirare ${contentText(name)}`],
  [/^Choose where to teleport (.+)$/, (name) => `Scegli dove teletrasportare ${contentText(name)}`],
  [/^Discard (\d+) cards\?$/, (count) => `Scartare ${count} ${count === '1' ? 'carta' : 'carte'}?`],
  [/^Discard (\d+) cards$/, (count) => `Scarta ${count} ${count === '1' ? 'carta' : 'carte'}`],
  [
    /^Discard a card with printed value (\d+)$/,
    (value) => `Scarta una carta con valore stampato ${value}`,
  ],
  [
    /^Choose cards to reveal \((\d+)\/(\d+)\)$/,
    (chosen, count) => `Scegli carte da rivelare (${chosen}/${count})`,
  ],
  [/^Discard (\d+) revealed cards$/, (count) => `Scarta ${count} carte rivelate`],
  [
    /^Choose a card for your hand \((\d+) remaining\)$/,
    (count) =>
      `Scegli una carta da aggiungere alla mano (${count} ${count === '1' ? 'rimanente' : 'rimanenti'})`,
  ],
  [
    /^Discard (up to )?(\d+) cards?(?: from (.+)’s hand)?$/,
    (upTo, count, name) =>
      `Scarta ${upTo ? 'fino a ' : ''}${count} ${count === '1' ? 'carta' : 'carte'}${name ? ` dalla mano di ${name}` : ''}`,
  ],
  [/^(?:Look at|Revealed) (.+)’s hand$/, (name) => `Mano rivelata di ${name}`],
  [/^Predicted attack value: (\d+)$/, (value) => `Valore di attacco previsto: ${value}`],
];

export function messageText(text: string): string {
  const localized = contentText(text);
  if (localized !== text) return localized;
  if (Object.hasOwn(messages, text)) return messages[text];
  for (const [pattern, translate] of patterns) {
    const match = pattern.exec(text);
    if (match) return translate(...match.slice(1));
  }
  const setup = /^(.+) · Choose (.+)$/.exec(text);
  if (setup) return `${contentText(setup[1])} · Scegli ${contentText(setup[2])}`;
  return text;
}
