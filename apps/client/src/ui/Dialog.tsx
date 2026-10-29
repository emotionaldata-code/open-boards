import { GameButton } from './GameButton';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { Icon } from './Icon';
import { GameFrame } from './GameFrame';
export function Dialog({
  title,
  children,
  onClose,
  className = '',
  dismissible = true,
  initialFocus,
}: {
  className?: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    initialFocus?.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      className={`arcane-dialog ${className}`}
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-frame">
        <GameFrame />
        <header className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          {dismissible && (
            <GameButton className="icon-button" onClick={onClose} aria-label="Chiudi finestra">
              <Icon name="close" />
            </GameButton>
          )}
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </dialog>
  );
}
