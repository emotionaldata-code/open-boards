import type { PresentationEvent } from '../animation/events';
import { AnimationQueue } from '../animation/queue';

export type Present = (event: PresentationEvent, active: () => boolean) => Promise<void>;

/** One client timeline, independent of React, WebGL and the network. */
export class PresentationSequence {
  private queue = new AnimationQueue<PresentationEvent>();
  private acknowledgement?: { id: string; resolve: () => void };
  private reviews = 0;
  private event: PresentationEvent | null = null;

  constructor(
    private show: (event: PresentationEvent | null, pendingReviews: number) => void,
    private present: Present,
  ) {}

  consume(events: PresentationEvent[]): void {
    const accepted = this.queue.consume(events, async (event, active) => {
      const acknowledged = event.review
        ? new Promise<void>((resolve) => {
            this.acknowledgement = { id: event.id, resolve };
          })
        : Promise.resolve();
      this.event = event;
      this.show(event, this.reviews);
      await Promise.all([this.present(event, active), acknowledged]);
      if (!active()) return;
      if (event.review) this.reviews--;
      this.acknowledgement = undefined;
      this.event = null;
      this.show(null, this.reviews);
    });
    this.reviews += accepted.filter((event) => event.review).length;
    if (accepted.length) this.show(this.event, this.reviews);
  }

  acknowledge(id: string): void {
    if (this.acknowledgement?.id === id) this.acknowledgement.resolve();
  }

  reset(events: PresentationEvent[] = []): void {
    this.queue.reset();
    this.acknowledgement?.resolve();
    this.acknowledgement = undefined;
    this.reviews = 0;
    this.event = null;
    // A reconnect supplies current state, not a replay of old announcements.
    this.queue.consume(events, async () => {});
    this.show(null, 0);
  }
}
