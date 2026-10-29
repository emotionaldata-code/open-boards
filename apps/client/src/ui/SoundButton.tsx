import { useEffect, useState } from 'react';
import { sound } from '../audio/player';
import { installInteractionSounds } from '../audio/interactions';
import { Icon } from './Icon';

export function SoundButton() {
  const [enabled, setEnabled] = useState(sound.isEnabled);
  const [error, setError] = useState('');
  useEffect(installInteractionSounds, []);
  async function toggle() {
    try {
      await sound.setEnabled(!enabled);
      if (!enabled) sound.play('confirm');
      setEnabled(!enabled);
      setError('');
    } catch {
      setError('L’audio non è disponibile in questo browser.');
    }
  }
  return (
    <div className="display-control">
      <button
        data-sound="none"
        className="icon-button"
        onClick={() => void toggle()}
        aria-label={enabled ? 'Disattiva audio' : 'Attiva audio'}
        aria-pressed={enabled}
        title={enabled ? 'Disattiva audio' : 'Attiva audio'}
      >
        <Icon name={enabled ? 'sound' : 'muted'} />
      </button>
      {error && (
        <span className="display-message" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
