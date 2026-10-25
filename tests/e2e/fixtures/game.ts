import { expect } from '@playwright/test';

// Render the real client with deterministic, viewer-safe snapshots; no engine or server hooks.
export async function presentationHarness(
  page: import('@playwright/test').Page,
  webgl = true,
  overrides: Partial<import('../../../packages/protocol/src/index').GameView> = {},
) {
  if (!webgl)
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = (() =>
        null) as typeof HTMLCanvasElement.prototype.getContext;
    });
  await page.goto('/');
  await page.evaluate(async (overrides) => {
    const resourceUrl = (file: string) =>
      performance
        .getEntriesByType('resource')
        .find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${file}.js`))!.name;
    const reactUrl = resourceUrl('react');
    const domUrl = resourceUrl('react-dom_client');
    const gameUrl = '/src/game/Game.tsx';
    const eventsUrl = '/src/animation/events.ts';
    const { createElement } = (await import(reactUrl)).default;
    const { createRoot } = (await import(domUrl)).default;
    const { Game } = (await import(gameUrl)) as typeof import('../../../apps/client/src/game/Game');
    const { presentationEvents } = (await import(
      eventsUrl
    )) as typeof import('../../../apps/client/src/animation/events');
    document.getElementById('root')!.hidden = true;
    const host = document.createElement('div');
    host.className = 'shell in-match';
    document.body.append(host);
    const root = createRoot(host);
    let game: import('../../../packages/protocol/src/index').GameView = {
      revision: 0,
      sequence: 0,
      turn: 0,
      actions: 2,
      phase: { type: 'taking-actions' },
      revealed: null,
      hand: [],
      paused: false,
      choice: null,
      maneuver: null,
      players: ['Arden', 'Briar'].map((name, i) => ({
        id: i ? 'b' : 'a',
        name,
        character: 'medusa',
        handCount: 5,
        deckCount: 15,
        discard: [],
        eliminated: false,
      })),
      fighters: ['a', 'b'].map((id, i) => ({
        id: `${id}:main`,
        player: id,
        role: 'main',
        character: 'medusa',
        definition: 'medusa',
        hp: 15,
        position: i ? 'n13' : 'n0',
        defeated: false,
        counters: {},
        statuses: [],
      })),
    };
    game = { ...game, ...overrides };
    let events: import('../../../apps/client/src/animation/events').PresentationEvent[] = [];
    let reset = 0;
    const commands: import('../../../packages/game/src/index').Command[] = [];
    const render = () =>
      root.render(
        createElement(Game, {
          room: { id: 'test', host: 'a', capacity: 2, seats: [], game },
          user: { id: 'a', name: 'Arden' },
          events,
          reset,
          connected: true,
          onCommand: (command: import('../../../packages/game/src/index').Command) =>
            commands.push(command),
          onLeave: () => {},
        }),
      );
    Object.assign(window, {
      presentOutcomes: (
        outcomes: import('../../../packages/game/src/index').Outcome[],
        reconnect = false,
      ) => {
        const next = { ...game, revision: game.revision + 1 };
        events = reconnect ? [] : [...events, ...presentationEvents(game, next, outcomes)];
        if (reconnect) reset++;
        game = next;
        render();
      },
      presentationCommands: commands,
    });
    render();
  }, overrides);
  await expect(page.locator('main.game-layout')).toHaveAttribute('data-revision', '0');
}
