import { useState, type FormEvent } from 'react';
import type { User } from '@open-boards/protocol';
import { http } from '../network/http';
import { CharacterRoster } from '../characters/CharacterRoster';
import { CharacterExplorer } from '../characters/CharacterExplorer';
import { HowToPlay } from './HowToPlay';
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
        <p className="entry-intro">A tactical card arena</p>
        <h1>Choose your ground.</h1>
        <p>
          Your deck. Two actions.
          <br />A small arena with nowhere to hide.
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <h2>{register ? 'Create your account' : 'Sign in to play'}</h2>
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              pattern="[a-zA-Z0-9_]{3,24}"
              minLength={3}
              maxLength={24}
              required
              placeholder="Your table name"
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
              placeholder="At least 8 characters"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Connecting…' : register ? 'Create account' : 'Sign in'}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError('');
            }}
          >
            {register ? 'Already have an account? Sign in' : 'New to the table? Create an account'}
          </button>
        </form>
        <div className="entry-explore">
          <CharacterExplorer />
        </div>
        <div className="entry-bottom">
          <span className="muted">2 or 4 players · One survivor</span>
          <HowToPlay />
        </div>
      </section>
      <section className="entry-roster" aria-label="Meet the fighters">
        <CharacterRoster />
      </section>
    </main>
  );
}
