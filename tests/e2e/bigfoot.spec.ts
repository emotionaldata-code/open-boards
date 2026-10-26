import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountBigfoot(page: Page, scene: 'horns' | 'loner', viewer = 'p0') {
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
      const saved = sessionStorage.getItem('bigfoot-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Bigfoot',
              character: 'bigfoot',
              deck: deckDefinitions('bigfoot').map((definition, j) => ({
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
        while (state.phase.type === 'placing-allies') {
          const fighter = state.fighters.find((f) => f.position === null)!;
          apply(
            {
              type: 'place-ally',
              fighter: fighter.id,
              position: deploymentSpaces(state, fighter.id, basic.map)[0],
            },
            fighter.player,
          );
        }
        state.players[0].hand.forEach((card, i) => {
          card.definition = [
            'bigfoot-jackalope-horns',
            'bigfoot-crash-through-the-trees',
            'bigfoot-hoax',
            'bigfoot-larger-than-life',
            'bigfoot-feint',
          ][i];
        });
        const fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
        fighter('p0:main').position = 'n5';
        fighter('p0:ally-1').position = 'n0';
        fighter('p1:main').position = 'n2';
        fighter('p1:ally-1').position = 'n22';
        if (scene === 'loner') {
          state.actions = 1;
          apply({ type: 'maneuver' });
          apply({ type: 'finish-maneuver' });
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
        sessionStorage.setItem('bigfoot-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'bigfoot-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Bigfoot' : 'Hector' },
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

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Bigfoot directs Jackalope Horns and restores private choices on desktop and phone (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion,
    });
    await context.addInitScript(() => {
      new MutationObserver(() =>
        document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
      ).observe(document, { subtree: true, childList: true, attributes: true });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await mountBigfoot(page, 'horns');
      await page.getByRole('button', { name: 'The Jackalope 1', exact: true }).click();
      await page.locator('.game-card').filter({ hasText: 'Jackalope Horns' }).click();
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText('Choose a destination');
      await page.screenshot({
        path: test.info().outputPath('bigfoot-horns-desktop.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountBigfoot(page, 'horns');
      await page.getByRole('button', { name: 'Choose space 02', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toContainText('Choose a fighter');
      await page.reload();
      await mountBigfoot(page, 'horns');
      await page.getByRole('button', { name: /Bigfoot · Hector/ }).tap();
      await expect(choice()).toHaveCount(0);
      await expect
        .poll(async () =>
          page.evaluate(
            () =>
              JSON.parse(sessionStorage.getItem('bigfoot-test-state')!).fighters.find(
                (f: { id: string }) => f.id === 'p1:main',
              ).hp,
          ),
        )
        .toBe(14);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      await page.screenshot({
        path: test.info().outputPath('bigfoot-horns-phone.png'),
        animations: 'disabled',
      });
      const size = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        innerWidth,
        document.documentElement.scrollHeight,
        innerHeight,
      ]);
      expect(size[0]).toBeLessThanOrEqual(size[1]);
      expect(size[2]).toBeLessThanOrEqual(size[3]);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('Bigfoot offers Loner by Nature only to its owner and restores the draw on reload', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await mountBigfoot(page, 'loner');
    const choice = () => page.locator('.hand-panel:has(.ability-options)');
    await expect(choice()).toContainText('Loner by Nature');
    await page.reload();
    await mountBigfoot(page, 'loner');
    await page.getByRole('button', { name: /^Use / }).tap();
    await expect(choice()).toHaveCount(0);
    expect(
      await page.evaluate(
        () => JSON.parse(sessionStorage.getItem('bigfoot-test-state')!).players[0].hand.length,
      ),
    ).toBe(7);
    await page.screenshot({
      path: test.info().outputPath('bigfoot-loner-phone.png'),
      animations: 'disabled',
    });
  } finally {
    await context.close();
  }
});
