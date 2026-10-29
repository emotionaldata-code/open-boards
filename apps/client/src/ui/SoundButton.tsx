import { GameButton } from './GameButton';
import { useEffect, useState } from 'react';
import { sound } from '../audio/player';
import { installInteractionSounds } from '../audio/interactions';
import { Icon } from './Icon';

export function SoundButton() {
  const [enabled, setEnabled] = useState(sound.isEnabled);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(installInteractionSounds, []);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      await sound.setEnabled(!enabled);
      if (!enabled) sound.play('confirm');
      setEnabled(!enabled);
      setError('');
    } catch {
      setError('L’audio non è disponibile in questo browser.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="display-control">
      <GameButton
        data-sound="none"
        aria-busy={busy}
        disabled={busy}
        className="icon-button"
        onClick={() => void toggle()}
        aria-label={enabled ? 'Disattiva audio' : 'Attiva audio'}
        aria-pressed={enabled}
        title={enabled ? 'Disattiva audio' : 'Attiva audio'}
      >
        <Icon name={enabled ? 'sound' : 'muted'} />
      </GameButton>
      {error && (
        <span className="display-message" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
