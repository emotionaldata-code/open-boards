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
const portraitQuery = '(max-width: 900px) and (orientation: portrait) and (pointer: coarse)';
export function usePortraitPhone() {
  const [portrait, setPortrait] = useState(() => matchMedia(portraitQuery).matches);
  useEffect(() => {
    const media = matchMedia(portraitQuery);
    const update = () => setPortrait(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return portrait;
}
export function RotatePrompt({
  onLeave,
  finished = false,
}: {
  onLeave: () => void;
  finished?: boolean;
}) {
  return (
    <section className="rotate-prompt" aria-label="Landscape required">
      <Icon name="rotate" />
      <h2>Turn your phone to play</h2>
      <p>
        The arena and your hand need a little room.
        <br />
        Rotate to landscape to continue.
      </p>
      <p className="muted">Your match stays connected.</p>
      <button onClick={onLeave}>{finished ? 'Return to lobby' : 'Leave match'}</button>
    </section>
  );
}
