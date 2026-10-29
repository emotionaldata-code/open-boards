import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import {
  BotDriver as AgentDriver,
  createAgent,
  isPolicyId,
  pendingActor,
  type Agent,
} from '@open-boards/agents';
import type { Outcome } from '@open-boards/game';
import type { Match } from './match';

/** Live pacing and lifecycle belong to the room; policies only select commands. */
export class BotDriver {
  private watching = false;
  private readonly driver: AgentDriver;
  private readonly agents = new Map<string, Agent>();
  constructor(match: Match, publish: (outcomes: Outcome[]) => void, delay = 550) {
    const agents = this.agents;
    this.driver = new AgentDriver({
      agent: {
        async decide(observation, signal) {
          await setTimeout(delay, undefined, { signal, ref: false });
          const seat = match.seats.find((seat) => seat.id === observation.player);
          if (seat?.controller.type !== 'bot' || !isPolicyId(seat.controller.policy))
            throw new Error('Unknown bot controller.');
          let agent = agents.get(seat.id);
          if (!agent) {
            agent = createAgent(seat.controller.policy, randomInt(1, 0x100000000));
            agents.set(seat.id, agent);
          }
          return agent.decide(observation, signal);
        },
      },
      observe: () => {
        if (!this.watching || !match.game || match.paused) return null;
        const actor = pendingActor(match.view(null).game!);
        if (
          !actor ||
          !match.seats.some((seat) => seat.id === actor && seat.controller.type === 'bot')
        )
          return null;
        return match.botObservation(actor);
      },
      submit: (command, revision, signal) => {
        if (signal.aborted || !this.watching || match.paused || match.game?.revision !== revision)
          return;
        const actor = pendingActor(match.view(null).game!);
        if (!actor) return;
        const result = match.command(actor, { id: randomUUID(), revision, command });
        if (result.error)
          throw new Error(`Bot command rejected: ${result.error.code}: ${result.error.message}`);
        publish(result.outcomes);
      },
      onError: (error) => console.error('Bot decision failed', error),
    });
  }
  update(watching: boolean): void {
    this.watching = watching;
    this.driver.update();
  }
  dispose(): void {
    this.watching = false;
    this.driver.stop();
    this.agents.clear();
  }
}
