import { useState } from 'react';
import { sound } from '../audio/player';
import { Icon } from './Icon';

export function SoundButton() {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    try {
      await sound.setEnabled(!enabled);
      setEnabled(!enabled);
      setError('');
    } catch {
      setError('Sound is unavailable in this browser.');
    }
  }
  return (
    <div className="display-control">
      <button
        className="icon-button"
        onClick={() => void toggle()}
        aria-label={enabled ? 'Mute sound' : 'Enable sound'}
        aria-pressed={enabled}
        title={enabled ? 'Mute sound' : 'Enable sound'}
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
