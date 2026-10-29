import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountVader(
  page: Page,
  scene: 'force' | 'recovery' | 'meditation' | 'mastery',
  viewer = 'p0',
) {
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
      const saved = sessionStorage.getItem('darth-vader-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Darth Vader',
              character: i ? 'medusa' : 'darth-vader',
              deck: deckDefinitions(i ? 'medusa' : 'darth-vader').map((definition, j) => ({
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
          const fighter = state.fighters.find((f) => !f.defeated && f.position === null)!;
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
            'darth-vader-meditation-chamber',
            'darth-vader-unstoppable',
            'darth-vader-by-the-emperors-will',
            'darth-vader-i-have-you-now',
            'darth-vader-form-v-mastery',
          ][i];
        });
        if (state.resolution.choice)
          for (const option of state.resolution.choice.options) {
            const card = state.players[0].hand.find((c) => c.id === option.id);
            if (card) option.label = basic.cards[card.definition].name;
          }
        const fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
        fighter('p0:main').position = 'n0';
        fighter('p1:main').position = 'n9';
        for (let i = 1; i <= 3; i++) fighter(`p1:ally-${i}`).position = `n${15 + i}`;
        if (scene !== 'force' && state.resolution.choice)
          apply({ type: 'choose', choice: state.resolution.choice.id, options: [] }, 'p0');
        if (scene === 'recovery') {
          state.players[0].discard.push({ id: 'recycle', definition: 'darth-vader-unstoppable' });
          fighter('p1:main').position = 'n1';
          apply(
            {
              type: 'attack',
              fighter: 'p0:main',
              target: 'p1:main',
              card: state.players[0].hand[2].id,
            },
            'p0',
          );
          apply({ type: 'defend', card: null }, 'p1');
        }
        if (scene === 'mastery') {
          state.turn = 1;
          fighter('p1:main').position = 'n1';
          state.players[1].hand[0].definition = 'medusa-gaze-of-stone';
          state.players[1].deck[0].definition = 'medusa-second-shot-3';
          apply(
            {
              type: 'attack',
              fighter: 'p1:main',
              target: 'p0:main',
              card: state.players[1].hand[0].id,
            },
            'p1',
          );
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
        sessionStorage.setItem('darth-vader-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'darth-vader-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Darth Vader' : 'Hector' },
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
        sessionStorage.getItem('darth-vader-test-state')!,
      ) as import('../../packages/game/src/index').GameState,
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Darth Vader pays Force Grip and recovers a discard across reload (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion,
    });
    await context.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'null',
      }),
    );
    await context.addInitScript(() => {
      new MutationObserver(() =>
        document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
      ).observe(document, { subtree: true, childList: true, attributes: true });
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    try {
      await mountVader(page, 'force');
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText('Scarta fino a 1');
      await choice()
        .getByRole('button', { name: /Ora sei mio/ })
        .click();
      await choice()
        .getByRole('button', { name: /Conferma/ })
        .click();
      await expect(choice()).toContainText('Scegli un combattente');
      await page.screenshot({
        path: test.info().outputPath('force-desktop.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountVader(page, 'force');
      await page.getByRole('button', { name: 'Medusa · Hector', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toHaveCount(0);
      expect((await currentState(page)).fighters.find((f) => f.id === 'p1:main')?.hp).toBe(13);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      await expect(page.locator('.arena canvas')).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath('force-phone.png'),
        animations: 'disabled',
      });
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await mountVader(page, 'recovery');
      await page.getByRole('button', { name: /Usa/ }).tap();
      await expect(choice()).toContainText('Rimescola una carta scartata');
      await page.reload();
      await mountVader(page, 'recovery');
      await choice().getByRole('button', { name: 'Inarrestabile', exact: true }).tap();
      await expect(choice()).toHaveCount(0);
      expect((await currentState(page)).players[0].deck.some((c) => c.id === 'recycle')).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('Darth Vader chooses a starting space and defends with Form V Mastery on phone', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'null',
    }),
  );
  await page.addInitScript(() => {
    new MutationObserver(() =>
      document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
    ).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await mountVader(page, 'meditation');
  await page.locator('.game-card').filter({ hasText: 'Camera di meditazione' }).click();
  const choice = () => page.locator('.hand-panel:has(.ability-options)');
  await expect(choice()).toContainText('Scegli dove teletrasportare');
  await page.reload();
  await mountVader(page, 'meditation');
  await page.getByRole('button', { name: 'Scegli casella 15', exact: true }).click();
  expect((await currentState(page)).fighters.find((f) => f.id === 'p0:main')?.position).toBe('n13');
  await page.screenshot({
    path: test.info().outputPath('meditation-phone.png'),
    animations: 'disabled',
  });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await mountVader(page, 'mastery');
  await page.locator('.game-card').filter({ hasText: 'Maestria della Forma V' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
  const state = await currentState(page);
  expect(state.players[1].discard.some((c) => c.definition === 'medusa-second-shot-3')).toBe(true);
  expect(state.fighters.find((f) => f.id === 'p0:main')?.hp).toBe(20);
  expect(errors).toEqual([]);
});
