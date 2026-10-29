import { useEffect, useImperativeHandle, useRef, type ComponentPropsWithRef } from 'react';
import { mountChrome, type ChromeKind, type ChromeState } from './chrome';

function kindFor(className: string): ChromeKind {
  if (/game-card|compact-card/.test(className)) return 'card';
  if (/roster-portrait/.test(className)) return 'portrait';
  if (/icon-button/.test(className)) return 'medallion';
  if (/draw-pile|choice-pile/.test(className)) return 'pile';
  return 'command';
}

/** Pixi owns the sculpted plate; the native input keeps focus, forms and keyboard access. */
export function GameButton({
  children,
  className = '',
  ref,
  ...props
}: ComponentPropsWithRef<'button'>) {
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const chrome = useRef<ReturnType<typeof mountChrome> | null>(null);
  const state = useRef<ChromeState>({ kind: 'command' });
  const kind = kindFor(className);
  useImperativeHandle(ref, () => button.current!, []);
  useEffect(() => {
    chrome.current = mountChrome(canvas.current!, () => state.current);
    const node = button.current!;
    const update = () => {
      state.current = {
        ...state.current,
        hovered: node.matches(':hover'),
        pressed: node.matches(':active'),
      };
      void chrome.current?.draw();
    };
    const events = [
      'pointerenter',
      'pointerleave',
      'pointerdown',
      'pointerup',
      'pointercancel',
      'focus',
      'blur',
      'keydown',
      'keyup',
    ];
    events.forEach((event) => node.addEventListener(event, update));
    return () => {
      events.forEach((event) => node.removeEventListener(event, update));
      chrome.current?.destroy();
    };
  }, []);
  useEffect(() => {
    state.current = {
      ...state.current,
      kind,
      primary: className.split(' ').includes('primary'),
      selected:
        props['aria-pressed'] === true ||
        props['aria-pressed'] === 'true' ||
        className.includes('active-player'),
      disabled: props.disabled,
    };
    void chrome.current?.draw();
  }, [kind, className, props.disabled, props['aria-pressed']]);
  return (
    <button {...props} ref={button} className={`game-control ${className}`} data-chrome={kind}>
      <canvas className="control-plate" ref={canvas} aria-hidden="true" />
      {children}
    </button>
  );
}
