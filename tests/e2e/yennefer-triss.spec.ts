import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountSorceresses(page: Page, scene: 'setup' | 'lodge', viewer = 'p0') {
  await page.goto('/');
  await page.evaluate(
    async ({ rootPath, scene, viewer }) => {
      const resource = (name: string) =>
        performance
          .getEntriesByType('resource')
          .find((e) => new URL(e.name).pathname.endsWith(`/deps/${name}.js`))!.name;
      const { createElement } = (await import(resource('react'))).default;
      const { createRoot } = (await import(resource('react-dom_client'))).default;
      const gameUrl = '/src/game/Game.tsx',
        eventsUrl = '/src/animation/events.ts';
      const engineUrl = `/@fs${rootPath}/packages/game/src/index.ts`,
        contentUrl = `/@fs${rootPath}/packages/content/src/index.ts`,
        projectionUrl = `/@fs${rootPath}/apps/server/src/transport/projection.ts`;
      const { Game } = (await import(gameUrl)) as typeof import('../../apps/client/src/game/Game');
      const { presentationEvents } = (await import(
        eventsUrl
      )) as typeof import('../../apps/client/src/animation/events');
      const { createGame, execute, deploymentSpaces } = (await import(
        engineUrl
      )) as typeof import('../../packages/game/src/index');
      const { basic, deckDefinitions } = (await import(
        contentUrl
      )) as typeof import('../../packages/content/src/index');
      const { projectGame } = (await import(
        projectionUrl
      )) as typeof import('../../apps/server/src/transport/projection');
      const saved = sessionStorage.getItem('sorceresses-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Sorceresses',
              character: i ? 'medusa' : 'yennefer-triss',
              deck: deckDefinitions(i ? 'medusa' : 'yennefer-triss').map((definition, j) => ({
                id: `p${i}-${j}`,
                definition,
              })),
            })),
            basic,
            731,
          );
      const apply = (command: import('../../packages/game/src/index').Command, actor = viewer) => {
        const result = execute(
          state,
          actor,
          { id: `ui-${state.revision}`, revision: state.revision, command },
          basic,
        );
        if (!result.ok) throw new Error(result.message);
        state = result.state;
        return result.outcomes;
      };
      if (!saved) {
        if (scene !== 'setup') {
          apply(
            {
              type: 'choose',
              choice: state.resolution.choice!.id,
              options: ['yennefer-triss-triss'],
            },
            'p0',
          );
          while (state.phase.type === 'placing-allies') {
            const f = state.fighters.find((f) => f.position === null)!;
            apply(
              {
                type: 'place-ally',
                fighter: f.id,
                position: deploymentSpaces(state, f.id, basic.map)[0],
              },
              f.player,
            );
          }
          const fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
          fighter('p0:main').position = 'n0';
          fighter('p0:ally-1').position = 'n9';
          fighter('p1:main').position = 'n20';
          for (let i = 1; i <= 3; i++) fighter(`p1:ally-${i}`).position = `n${15 + i}`;
          state.players[0].hand = [
            { id: 'lodge', definition: 'yennefer-triss-lodge-of-sorceresses' },
            { id: 'commitment', definition: 'yennefer-triss-incinerate' },
          ];
          state.players[1].hand = [{ id: 'rival-commitment', definition: 'medusa-feint' }];
          apply({ type: 'play-action', fighter: 'p0:main', card: 'lodge' }, 'p0');
        }
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      let events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
      let game = projectGame(state, viewer, false);
      const render = () => {
        sessionStorage.setItem('sorceresses-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'sorceresses-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Sorceresses' : 'Hector' },
            events,
            reset: 0,
            connected: true,
            onLeave: () => {},
            onCommand: (command: import('../../packages/game/src/index').Command) => {
              const previous = game,
                outcomes = apply(command);
              game = projectGame(state, viewer, false);
              events = [...events, ...presentationEvents(previous, game, outcomes)];
              render();
            },
          }),
        );
      };
      render();
    },
    { rootPath: process.cwd(), scene, viewer },
  );
  await expect(page.locator('main.game-layout')).toBeVisible();
}

async function currentState(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('sorceresses-test-state')!,
      ) as import('../../packages/game/src/index').GameState,
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Sorceress hero selection and private Lodge recovery (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion,
    });
    await context.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
    await context.addInitScript(() => {
      new MutationObserver(() =>
        document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
      ).observe(document, { subtree: true, childList: true, attributes: true });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    try {
      await mountSorceresses(page, 'setup');
      expect((await currentState(page)).players.every((p) => p.hand.length === 0)).toBe(true);
      await page.getByRole('button', { name: 'Triss', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await currentState(page)).phase.type).toBe('placing-allies');
      expect((await currentState(page)).fighters[0]).toMatchObject({
        definition: 'yennefer-triss-triss',
        hp: 14,
      });
      await page.evaluate(async () => {
        const assetsUrl = '/src/artwork/assets.ts';
        const texturesUrl = '/src/artwork/textures.ts';
        const { rasterAssets } = (await import(
          assetsUrl
        )) as typeof import('../../apps/client/src/artwork/assets');
        const { loadFigureTexture } = (await import(
          texturesUrl
        )) as typeof import('../../apps/client/src/artwork/textures');
        await loadFigureTexture(rasterAssets['triss-token'].url);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      await page.screenshot({
        path: test.info().outputPath('triss-hero-desktop.png'),
        animations: 'disabled',
      });
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await mountSorceresses(page, 'lodge');
      await expect(page.locator('.hand-panel')).toContainText('Secretly choose a card to reveal');
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountSorceresses(page, 'lodge');
      const card = page.getByRole('button', { name: 'Incinerate', exact: true });
      await card.click();
      await expect
        .poll(async () => (await currentState(page)).resolution.choice?.player)
        .toBe('p1');
      expect((await currentState(page)).players[1].hand).toHaveLength(1);
      await page.reload();
      await mountSorceresses(page, 'lodge', 'p1');
      await expect(page.locator('.hand-panel')).toContainText('Secretly choose a card to reveal');
      await page.getByRole('button', { name: 'Feint', exact: true }).click();
      await expect
        .poll(async () => (await currentState(page)).resolution.choice?.player)
        .toBe('p0');
      await page.reload();
      await mountSorceresses(page, 'lodge', 'p0');
      await expect(page.locator('.hand-panel')).toContainText('Choose a fighter');
      await page.getByRole('button', { name: 'Yennefer 1 · Sorceresses', exact: true }).click();
      await expect.poll(async () => (await currentState(page)).resolution.choice).toBeNull();
      expect((await currentState(page)).fighters.find((f) => f.id === 'p0:ally-1')!.hp).toBe(4);
      expect((await currentState(page)).fighters.find((f) => f.id === 'p0:main')!.hp).toBe(12);
      await expect(page.locator('.event-dialog')).toHaveCount(0, { timeout: 15000 });
      await page.screenshot({
        path: test.info().outputPath('lodge-resolved-phone.png'),
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
