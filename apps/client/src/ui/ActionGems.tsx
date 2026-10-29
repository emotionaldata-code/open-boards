import { useEffect, useRef } from 'react';
import { mountChrome } from './chrome';

export function ActionGems({ value }: { value: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef(value);
  const chrome = useRef<ReturnType<typeof mountChrome> | null>(null);
  useEffect(() => {
    chrome.current = mountChrome(canvas.current!, () => ({
      kind: 'actions',
      value: current.current,
    }));
    return () => chrome.current?.destroy();
  }, []);
  useEffect(() => {
    current.current = value;
    void chrome.current?.draw();
  }, [value]);
  return (
    <span
      className="action-gems"
      aria-hidden="true"
      style={{ width: `${Math.max(2, Math.min(value, 4)) * 22}px` }}
    >
      <canvas ref={canvas} className="control-plate" />
      {Array.from({ length: Math.max(2, Math.min(value, 4)) }, (_, i) => (
        <i key={i} className={`gem-fallback ${i < value ? 'filled' : ''}`} />
      ))}
    </span>
  );
}
