/** Client-only flavor and visual identity. Rules and stats live in @open-boards/content. */
export interface CharacterProfile {
  role: string;
  summary: string;
  tactic: string;
  accent: string;
  ground: string;
}
export const profiles: Record<string, CharacterProfile> = {
  'golden-bat': {
    role: 'Il primo supereroe',
    summary: 'Un teschio d’oro. Una risata senza paura.',
    tactic:
      'Attacca prima di effettuare una Manovra per ottenere +2. Usa schemi e movimenti dopo il combattimento per cambiare zona e preparare il prossimo colpo.',
    accent: '#d6ad4c',
    ground: '#293638',
  },
  'bloody-mary': {
    role: 'Spettro dello specchio',
    summary: 'Tre carte. Tre azioni. Un riflesso fatale.',
    tactic:
      'Inizia il turno con esattamente tre carte per ottenere un’azione extra. Prepara il terzo gesto e cambia zona per rendere imprevedibili i tuoi attacchi.',
    accent: '#b16b79',
    ground: '#382c36',
  },
  hamlet: {
    role: 'Principe di Danimarca',
    summary: 'Essere o non essere. Ogni scelta ha un prezzo.',
    tactic:
      'Scegli Essere per alimentare la mano o Non essere per attaccare con forza. Rosencrantz e Guildenstern possono pagare il prezzo della tua risolutezza.',
    accent: '#ad727c',
    ground: '#2d303d',
  },
  beowulf: {
    role: 'Re dei Geati',
    summary: 'Il dolore accende la furia. Il coraggio la trasforma.',
    tactic:
      'Accumula Furia quando Beowulf subisce danni e spendila per colpi decisivi. Wiglaf combatte al suo fianco e può aprire una nuova occasione con un attacco impetuoso.',
    accent: '#c39752',
    ground: '#2d3c32',
  },
  'harry-houdini': {
    role: 'Maestro dell’evasione',
    summary: 'Una catena spezzata. Un ultimo trucco.',
    tactic:
      'Usa i BOOST per attivare i trucchi delle carte. Houdini si libera da ogni trappola, mentre Bess prepara la scena e protegge la tua mano.',
    accent: '#c68d63',
    ground: '#283b40',
  },
  'little-red': {
    role: 'Sopravvissuta della fiaba',
    summary: 'Un cestino pieno di sorprese. Una lama per il lupo.',
    tactic:
      'Prepara il simbolo in cima agli scarti per attivare gli effetti del cestino. Il Cacciatore offre tiro a distanza e cure preziose.',
    accent: '#c27371',
    ground: '#382e31',
  },
  'nikola-tesla': {
    role: 'Inventore della corrente alternata',
    summary: 'Due bobine. Un potenziale senza limiti.',
    tactic:
      'Carica le bobine per minacciare chi si avvicina. Scaricale al momento giusto per potenziare le carte, annullare gli effetti e controllare il campo.',
    accent: '#c99052',
    ground: '#243b4b',
  },
  sinbad: {
    role: 'Marinaio dei sette viaggi',
    summary: 'Ogni viaggio lascia il segno. Ogni ritorno è un nuovo inizio.',
    tactic:
      'Accumula carte VIAGGIO negli scarti per aumentare forza e movimento di Sinbad e del Portatore. Torna a casa per recuperarle e ripartire.',
    accent: '#c79d65',
    ground: '#263d48',
  },
  'yennefer-triss': {
    role: 'Maghe rivali',
    summary: 'Due maghe. Una scelta decisiva.',
    tactic:
      'Scegli Yennefer per potenziare subito gli attacchi o Triss per infliggere danni dopo gli stratagemmi. Usa i portali e metti sotto pressione la mano avversaria.',
    accent: '#bb9fd7',
    ground: '#30283e',
  },
  eredin: {
    role: 'Re della Caccia Selvaggia',
    summary: 'Quattro cavalieri. Un re la cui furia sopravvive loro.',
    tactic:
      'Circonda i nemici con i Cavalieri Rossi, sacrificandoli per effetti decisivi. Quando Eredin si infuria, colpisci attraverso il campo di battaglia.',
    accent: '#b46d75',
    ground: '#26343e',
  },
  philippa: {
    role: 'Maga e maestra di spie',
    summary: 'Un gufo nell’ombra. Una mano in ogni complotto.',
    tactic:
      'Usa la mano per magie potenti, poi recupera carte con Due passi avanti. Invia Dijkstra a sventare i piani avversari e usa Polimorfismo per restare vicino.',
    accent: '#c6a267',
    ground: '#352c40',
  },
  alice: {
    role: 'Avventuriera nel Paese delle Meraviglie',
    summary: 'Una lama vorpale. Un mondo che cambia dimensioni.',
    tactic:
      'Diventa GRANDE per colpire più forte e PICCOLA per difenderti. Il Ciciarampa punirà chi si avvicina troppo.',
    accent: '#cba76c',
    ground: '#263e4a',
  },
  'darth-vader': {
    role: 'Signore Oscuro dei Sith',
    summary: 'Una volontà di ferro. Una galassia nella sua morsa.',
    tactic:
      'Scarta una carta per infliggere danni con Stretta della Forza. Metti all’angolo il nemico, neutralizza la sua forza e usa un’azione aggiuntiva per il colpo decisivo.',
    accent: '#c47c73',
    ground: '#302c35',
  },
  'geralt-of-rivia': {
    role: 'Witcher della Scuola del Lupo',
    summary: 'Due spade. Un segno nell’oscurità.',
    tactic:
      'Scegli l’equipaggiamento prima della caccia. Controlla lo scontro con segni e pozioni mentre Ranuncolo disturba la mano avversaria.',
    accent: '#bba469',
    ground: '#303b3b',
  },
  'invisible-man': {
    role: 'Terrore nella nebbia',
    summary: 'Un cappotto vuoto. Una strada piena di segreti.',
    tactic:
      'Spostati tra i segnalini nebbia e sfruttali per difenderti. Muovi la nebbia, colpisci a sorpresa e svanisci fino al prossimo turno.',
    accent: '#b8a47c',
    ground: '#293b41',
  },
  'bruce-lee': {
    role: 'Il Piccolo Drago',
    summary: 'Scorri come l’acqua. Colpisci senza sosta.',
    tactic:
      'Concatena gli attacchi Jeet Kune Do per ottenere azioni aggiuntive, recupera le tecniche e muovi ancora a fine turno.',
    accent: '#d8af55',
    ground: '#39372c',
  },
  'robin-hood': {
    role: 'Fuorilegge di Sherwood',
    summary: 'Una freccia tra gli alberi. Una banda al tuo fianco.',
    tactic:
      'Colpisci e ritirati con Robin e i suoi quattro Fuorilegge. Ruba carte, impedisci le difese e riporta a Sherwood gli alleati sconfitti.',
    accent: '#d6ad68',
    ground: '#293c30',
  },
  bigfoot: {
    role: 'Gigante sfuggente della foresta',
    summary: 'Passi pesanti. Un lampo di corna.',
    tactic:
      'Colpisci forte e sparisci tra gli alberi. Tieni i nemici fuori dalla zona di Bigfoot per pescare una carta aggiuntiva.',
    accent: '#c59e66',
    ground: '#2c3c32',
  },
  dracula: {
    role: 'Signore della notte',
    summary: 'Una fame paziente. Tre ombre fedeli.',
    tactic:
      'Circonda la preda con le Sorelle. Nutri Dracula per mantenerlo in vita, poi usa le carte per una Forma bestiale devastante.',
    accent: '#ba716f',
    ground: '#302535',
  },
  achilles: {
    role: 'Eroe della guerra di Troia',
    summary: 'Fratelli in battaglia. Furia nella perdita.',
    tactic:
      'Combatti al fianco di Patroclo per ottenere azioni aggiuntive. La sua caduta costa carte, ma potenzia gli attacchi di Achille e premia ogni vittoria.',
    accent: '#c98958',
    ground: '#44332f',
  },
  'the-genie': {
    role: 'Signore dei desideri senza catene',
    summary: 'Potere illimitato. Ogni desiderio ha un prezzo.',
    tactic:
      'Scarta carte per ottenere azioni aggiuntive. Scegli con cura i desideri e colpisci prima di esaurire il tuo potere.',
    accent: '#d8b77d',
    ground: '#293b46',
  },
  'king-arthur': {
    role: 'Re di Camelot',
    summary: 'Excalibur levata. Merlino al suo fianco.',
    tactic:
      'Potenzia gli attacchi di Artù con i BOOST. Usa la preveggenza e la magia di Merlino per preparare il prossimo scontro.',
    accent: '#d6b775',
    ground: '#283746',
  },
  'sherlock-holmes': {
    role: 'Investigatore consulente',
    summary: 'Leggi la mano. Risolvi lo scontro.',
    tactic:
      'Prevedi gli attacchi e smonta la mano avversaria. Tieni Watson vicino per curarti e avere supporto a distanza.',
    accent: '#b79c67',
    ground: '#283a3b',
  },
  'sun-wukong': {
    role: 'Il Re Scimmia',
    summary: 'Un solo capello. Mille inganni.',
    tactic:
      'Evoca i Cloni per circondare il nemico. Alterna trasformazioni e inganni, poi colpisci ancora con il bastone magico.',
    accent: '#d3a54b',
    ground: '#3e2929',
  },
  'jekyll-hyde': {
    role: 'Due anime nella nebbia',
    summary: 'La cura e il mostro condividono lo stesso cuore.',
    tactic:
      'Difenditi e recupera come Jekyll, poi trasformati in Hyde per colpire. Ogni Manovra di Hyde costa salute: scegli il momento giusto.',
    accent: '#8fbf89',
    ground: '#253733',
  },
  medusa: {
    role: 'Gorgone arciera',
    summary: 'Uno sguardo letale. Un cielo pieno di ali.',
    tactic:
      'Minaccia con Sguardo di pietra. Manda avanti le Arpie, poi usa Frenesia alata per riposizionarti e riportarne una in gioco.',
    accent: '#d7bb75',
    ground: '#253d39',
  },
};
