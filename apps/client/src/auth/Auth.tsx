import { GameButton } from '../ui/GameButton';
import { messageText } from '../ui/messages';
import { useState, type FormEvent } from 'react';
import type { User } from '@open-boards/protocol';
import { http } from '../network/http';
import { CharacterRoster } from '../characters/CharacterRoster';
import { GameFrame } from '../ui/GameFrame';
export function Auth({ onUser }: { onUser: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      onUser(
        await http<User>(`/auth/${register ? 'register' : 'login'}`, {
          username: data.get('username'),
          password: data.get('password'),
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="entry-grid">
      <section className="entry-copy">
        <h1>Gioca a Open Boards</h1>
        <p>Un gioco tattico di carte per 2 o 4 giocatori.</p>
        <form aria-busy={busy} onSubmit={(e) => void submit(e)}>
          <GameFrame />
          <h2>{register ? 'Crea il tuo account' : 'Accedi per giocare'}</h2>
          <label>
            Nome utente
            <input
              name="username"
              autoComplete="username"
              pattern="[a-zA-Z0-9_]{3,24}"
              minLength={3}
              maxLength={24}
              required
              placeholder="Il tuo nome al tavolo"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              required
              placeholder="Almeno 8 caratteri"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {messageText(error)}
            </p>
          )}
          <GameButton className="primary" disabled={busy}>
            {busy ? 'Connessione…' : register ? 'Crea account' : 'Accedi'}
          </GameButton>
          <GameButton
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setRegister(!register);
              setError('');
            }}
          >
            {register ? 'Hai già un account? Accedi' : 'Prima partita? Crea un account'}
          </GameButton>
        </form>
        <div className="entry-bottom">
          <span className="muted">2 o 4 giocatori · Un solo vincitore</span>
        </div>
      </section>
      <section className="entry-roster" aria-label="Scopri i combattenti">
        <CharacterRoster featured selected="medusa" />
      </section>
    </main>
  );
}
