import { useEffect, useRef } from 'react';
import { mountChrome } from './chrome';

export function GameFrame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const chrome = mountChrome(canvas.current!, () => ({ kind: 'panel' }));
    return () => chrome.destroy();
  }, []);
  return <canvas ref={canvas} className="surface-plate" aria-hidden="true" />;
}
