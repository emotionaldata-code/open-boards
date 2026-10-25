// One local timeline per board. New snapshots append; only reconnect/unmount cancels it.
export class AnimationQueue<T extends { id: string }> {
  private generation = 0;
  private seen = new Set<string>();
  private tail = Promise.resolve();
  reset(): void {
    this.generation++;
    this.seen.clear();
    this.tail = Promise.resolve();
  }
  consume(events: T[], play: (event: T, active: () => boolean) => Promise<void>): T[] {
    const accepted: T[] = [];
    const generation = this.generation;
    for (const event of events) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      accepted.push(event);
      if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
      this.tail = this.tail.then(async () => {
        if (generation === this.generation) await play(event, () => generation === this.generation);
      });
    }
    return accepted;
  }
}
