import { GameButton } from './GameButton';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
export function FullscreenButton() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const update = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  async function toggle() {
    try {
      setError('');
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else
        setError(
          'Questo browser non supporta lo schermo intero. Usa Aggiungi alla schermata Home per una vista immersiva.',
        );
    } catch {
      setError(
        'Lo schermo intero non è disponibile in questo browser. Puoi continuare a giocare qui.',
      );
    }
  }
  return (
    <div className="display-control">
      <GameButton
        className="icon-button"
        onClick={() => void toggle()}
        aria-label={active ? 'Esci da schermo intero' : 'Schermo intero'}
        title={active ? 'Esci da schermo intero' : 'Schermo intero'}
      >
        <Icon name="fullscreen" />
      </GameButton>
      {error && (
        <div className="display-message" role="alert">
          {error}
          <GameButton onClick={() => setError('')}>Chiudi</GameButton>
        </div>
      )}
    </div>
  );
}
