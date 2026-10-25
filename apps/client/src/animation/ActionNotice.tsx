import type { PresentationEvent } from './events';
// Only the active confirmed event is announced. No permanent combat/history panel.
export function ActionNotice({ event }: { event: PresentationEvent | null }) {
  return (
    <div
      className={`action-notice ${event ? 'is-visible' : ''}`}
      data-tone={event?.tone}
      data-event={event?.id}
      data-event-revision={event?.revision}
      aria-live="polite"
      aria-atomic="true"
    >
      {event && (
        <div key={event.id}>
          <strong>{event.title}</strong>
          <span>{event.detail}</span>
        </div>
      )}
    </div>
  );
}
