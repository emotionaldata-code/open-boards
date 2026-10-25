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
          'This browser does not support fullscreen. Use Add to Home Screen for an immersive view.',
        );
    } catch {
      setError('Fullscreen is unavailable in this browser. You can keep playing here.');
    }
  }
  return (
    <div className="display-control">
      <button
        className="icon-button"
        onClick={() => void toggle()}
        aria-label={active ? 'Exit fullscreen' : 'Enter fullscreen'}
        title={active ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        <Icon name="fullscreen" />
      </button>
      {error && (
        <div className="display-message" role="alert">
          {error}
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
