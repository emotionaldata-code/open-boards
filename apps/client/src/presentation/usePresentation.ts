import { useEffect, useRef, useState } from 'react';
import type { PresentationEvent } from '../animation/events';
import { PresentationSequence, type Present } from './sequence';

export function usePresentation(events: PresentationEvent[], reset: number, present: Present) {
  const [state, setState] = useState<{ event: PresentationEvent | null; pending: number }>({
    event: null,
    pending: 0,
  });
  const renderer = useRef(present);
  renderer.current = present;
  const sequence = useRef<PresentationSequence | null>(null);
  sequence.current ??= new PresentationSequence(
    (event, pending) => setState({ event, pending }),
    (event, active) => renderer.current(event, active),
  );
  useEffect(() => {
    const timeline = sequence.current!;
    timeline.reset(events);
    return () => timeline.reset();
    // A reset intentionally consumes the current batch without replaying it.
  }, [reset]);
  useEffect(() => sequence.current!.consume(events), [events, reset]);
  return {
    event: state.event,
    reviewing: state.pending > 0,
    acknowledge: (id: string) => sequence.current!.acknowledge(id),
  };
}
