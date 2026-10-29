import { GameButton } from './GameButton';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { AudioSettings } from './AudioSettings';
export function HowToPlay() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GameButton className="text-button rules-trigger" onClick={() => setOpen(true)}>
        Guida
      </GameButton>
      {open && (
        <Dialog title="Come si gioca" onClose={() => setOpen(false)}>
          <div className="rules-grid">
            <AudioSettings />
            <p>
              Scegli un eroe e sconfiggi gli avversari: vince l’ultimo eroe rimasto in gioco. Open
              Boards permette duelli a 2 giocatori e partite tutti contro tutti a 4.
            </p>
            <section>
              <h3>Il tuo turno</h3>
              <p>
                Hai due azioni da usare, anche ripetendo la stessa: manovrare, attaccare o giocare
                una carta stratagemma. Non puoi passare. Gli effetti di carte e abilità possono
                concedere azioni aggiuntive o terminare il turno.
              </p>
            </section>
            <section>
              <h3>Preparazione</h3>
              <p>
                Gli eroi iniziano nelle caselle assegnate ai giocatori. Prima del primo turno,
                colloca gli alleati nelle caselle vuote evidenziate, nella zona di partenza del tuo
                eroe. Eroe e alleati condividono mazzo, mano e azioni. Inizi con cinque carte e i
                punti vita del personaggio.
              </p>
            </section>
            <section>
              <h3>Manovrare e potenziare</h3>
              <p>
                Con «Pesca e manovra» spendi un’azione: peschi una carta e puoi muovere ogni tuo
                combattente fino al suo valore di movimento. Seleziona il combattente e poi una
                casella evidenziata; seleziona la sua casella attuale per restare fermo. Puoi
                scartare una sola carta, prima di muovere, per aggiungere il suo valore BOOST al
                movimento. Puoi attraversare gli alleati, ma non i nemici, e devi terminare in una
                casella vuota. «Termina manovra» lascia fermi i combattenti rimanenti.
              </p>
            </section>
            <section>
              <h3>Carte e attacchi</h3>
              <p>
                Ogni carta indica chi può usarla. Scegli prima il combattente: una carta stratagemma
                si gioca per il suo effetto; una carta attacco o versatile prepara un attacco contro
                un nemico evidenziato. Entrambe le azioni costano un’azione. In mischia puoi
                attaccare solo caselle adiacenti; a distanza puoi anche attaccare nemici in una zona
                del tuo stesso colore. Le caselle multicolore appartengono a tutte le zone mostrate;
                gli altri combattenti non bloccano gli attacchi a distanza.
              </p>
            </section>
            <section>
              <h3>Zone e portali</h3>
              <p>
                Le sigle Au, Y, R, B, Br, Gy e G indicano oro, giallo, rosso, blu, marrone, grigio e
                verde. Le caselle con frecce sotto il cerchio sono portali: da un portale puoi
                spendere un punto movimento per raggiungere un altro portale libero e continuare a
                muoverti. I portali non collegano le caselle per attacchi, spinte o attrazioni.
              </p>
            </section>
            <section>
              <h3>Difendersi</h3>
              <p>
                Chi subisce un attacco può giocare gratis una carta difesa o versatile del
                combattente attaccato, oppure scegliere «Subisci il colpo». Le carte si rivelano
                dopo la scelta. Il danno è il valore di attacco meno la difesa, con un minimo di
                zero; gli effetti delle carte possono modificare l’esito.
              </p>
            </section>
            <section>
              <h3>Abilità e dettagli</h3>
              <p>
                Le abilità si risolvono automaticamente oppure richiedono una scelta. Tocca il
                riquadro di un giocatore per leggere le sue abilità e «Scarti» per consultarne le
                carte scartate. Conferma i riepiloghi degli eventi per proseguire.
              </p>
            </section>
            <section>
              <h3>Fine turno e vittoria</h3>
              <p>
                A fine turno scarta fino ad avere sette carte. Il mazzo esaurito non si rimescola:
                per ogni carta che non puoi pescare, ogni tuo combattente in vita subisce due danni.
                A zero punti vita un alleato viene rimosso; la sconfitta dell’eroe elimina il
                giocatore e tutti i suoi alleati. Vince l’ultimo eroe rimasto.
              </p>
            </section>
            <p className="muted">
              Sul telefono scorri la mano per sfogliare le carte; la mappa si adatta allo schermo.
              Una disconnessione imprevista mette in pausa la partita fino a 120 secondi;
              abbandonare equivale alla resa.
            </p>
            <section>
              <h3>Regolamento ufficiale di Unmatched</h3>
              <p>
                Per approfondire il gioco da tavolo, consulta il{' '}
                <a
                  href="https://iellogames.com/wp-content/uploads/2021/02/Unmatched-BoL-1_Rulebook_EN_Light.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  regolamento ufficiale (PDF in inglese, nuova scheda)
                </a>{' '}
                o il{' '}
                <a
                  href="https://restorationgames.com/unmatched/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  sito di Restoration Games (in inglese, nuova scheda)
                </a>
                . Questa guida descrive le modalità disponibili in Open Boards; i regolamenti dei
                singoli set includono anche varianti e regole specifiche.
              </p>
            </section>
          </div>
        </Dialog>
      )}
    </>
  );
}
