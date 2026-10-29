import { useState } from 'react';
import { sound } from '../audio/player';

export function AudioSettings() {
  const [volume, setVolume] = useState(sound.level);
  return (
    <section className="audio-settings">
      <h3>Suoni del tavolo</h3>
      <label>
        Volume degli effetti · {Math.round(volume * 100)}%
        <input
          aria-label="Volume degli effetti"
          type="range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(event) => {
            const value = Number(event.target.value) / 100;
            sound.setVolume(value);
            setVolume(value);
          }}
          onPointerUp={() => sound.play('cards')}
          onKeyUp={() => sound.play('cards')}
        />
      </label>
      <p className="muted">
        Il volume viene salvato. Usa il sigillo dell’altoparlante per attivare o disattivare
        l’audio.
      </p>
      <small>
        Suoni di{' '}
        <a href="https://kenney.nl/assets/casino-audio" target="_blank" rel="noopener noreferrer">
          Kenney
        </a>{' '}
        · CC0
      </small>
    </section>
  );
}
