import type { Command } from '@open-boards/game';
import type { Agent, PlayerObservation } from './observation';

export interface BotDriverOptions {
  agent: Agent;
  observe(): PlayerObservation | null;
  submit(command: Command, revision: number, signal: AbortSignal): Promise<void> | void;
  onError?(error: unknown): void;
}
/** Call update after snapshots. One attempt per revision; errors wait for a new revision. */
export class BotDriver {
  private controller: AbortController | null = null;
  private key: string | null = null;
  private stopped = false;
  constructor(private readonly options: BotDriverOptions) {}

  update(): void {
    if (this.stopped) return;
    const observation = this.options.observe();
    const key =
      observation?.actor === observation?.player && observation
        ? `${observation.player}:${observation.game.revision}`
        : null;
    if (key === this.key) return;
    this.controller?.abort();
    this.key = key;
    if (!key || !observation) return;
    const controller = new AbortController();
    this.controller = controller;
    // Defer policy invocation so even synchronous exceptions reach onError.
    void Promise.resolve()
      .then(async () => {
        if (controller.signal.aborted) return;
        const command = await this.options.agent.decide(observation, controller.signal);
        if (controller.signal.aborted) return;
        const current = this.options.observe();
        if (
          !current ||
          current.player !== observation.player ||
          current.actor !== observation.player ||
          current.game.revision !== observation.game.revision
        )
          return;
        await this.options.submit(command, observation.game.revision, controller.signal);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) this.options.onError?.(error);
      });
  }

  stop(): void {
    this.stopped = true;
    this.controller?.abort();
  }
}
