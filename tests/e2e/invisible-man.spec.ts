import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountInvisible(
  page: Page,
  scene: 'setup' | 'rolling' | 'vanish' | 'covert' | 'notes',
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
      const saved = sessionStorage.getItem('invisible-man-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Invisible Man',
              character: i ? 'medusa' : 'invisible-man',
              deck: deckDefinitions(i ? 'medusa' : 'invisible-man').map((definition, j) => ({
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
        if (scene !== 'setup') {
          while (state.resolution.choice)
            apply(
              {
                type: 'choose',
                choice: state.resolution.choice.id,
                options: [state.resolution.choice.options[0].id],
              },
              state.resolution.choice.player,
            );
          state.players[0].hand.forEach((card, i) => {
            card.definition = [
              'invisible-man-rolling-fog',
              'invisible-man-vanish',
              'invisible-man-slip-away',
              'invisible-man-reign-of-terror',
              'invisible-man-impossible-to-see',
            ][i];
          });
          state.fighters.find((f) => f.id === 'p0:main')!.position = 'n0';
          state.fighters.find((f) => f.id === 'p1:main')!.position = 'n1';
          for (let i = 1; i <= 3; i++)
            state.fighters.find((f) => f.id === `p1:ally-${i}`)!.position = `n${15 + i}`;
          state.boardTokens!.forEach((t, i) => {
            t.position = ['n0', 'n12', 'n24'][i];
          });
          if (scene === 'covert') {
            state.players[0].hand[0].definition = 'invisible-man-covert-preparation';
            apply(
              {
                type: 'attack',
                fighter: 'p0:main',
                target: 'p1:main',
                card: state.players[0].hand[0].id,
              },
              'p0',
            );
            apply({ type: 'defend', card: null }, 'p1');
          }
          if (scene === 'notes') {
            state.turn = 1;
            state.players[1].hand[0].definition = 'medusa-gaze-of-stone';
            apply(
              {
                type: 'attack',
                fighter: 'p1:main',
                target: 'p0:main',
                card: state.players[1].hand[0].id,
              },
              'p1',
            );
            state.players[0].hand[0].definition = 'invisible-man-coded-notes';
            apply({ type: 'defend', card: state.players[0].hand[0].id }, 'p0');
          }
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
        sessionStorage.setItem('invisible-man-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'invisible-man-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Invisible Man' : 'Hector' },
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
      Object.assign(window, {
        invisibleTestApply: (
          command: import('../../packages/game/src/index').Command,
          actor: string,
        ) => {
          if (
            command.type === 'maneuver' &&
            state.resolution.choice?.player === actor &&
            state.resolution.choice.options.some((o) => o.id === 'skip')
          )
            apply({ type: 'choose', choice: state.resolution.choice.id, options: ['skip'] }, actor);
          apply(command, actor);
          game = projectGame(state, viewer, false);
          events = [];
          render();
        },
      });
      render();
    },
    { rootPath: process.cwd(), scene, viewer },
  );
  await expect(page.locator('main.game-layout')).toBeVisible();
}

async function state(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('invisible-man-test-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
async function observe(page: Page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    }),
  );
  await page.addInitScript(() => {
    new MutationObserver(() =>
      document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
    ).observe(document, { subtree: true, attributes: true, childList: true });
  });
}
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Invisible Man sets up fog, moves it and travels between tokens after reload (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await observe(page);
      await mountInvisible(page, 'setup');
      const choice = () => page.getByRole('region', { name: 'Ability choice' });
      for (let i = 1; i <= 3; i++) {
        await expect(choice()).toContainText(`Place Fog ${i}`);
        await page
          .getByRole('button', { name: /^Choose space/ })
          .first()
          .click();
      }
      await expect(page.locator('.board-token')).toHaveCount(3);
      await expect(page.locator('.arena canvas')).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath('fog-setup-desktop.png'),
        animations: 'disabled',
      });
      await page.evaluate(() => sessionStorage.removeItem('invisible-man-test-state'));
      await page.reload();
      await mountInvisible(page, 'rolling');
      await page.locator('.game-card').filter({ hasText: 'Rolling Fog' }).click();
      await page.getByRole('button', { name: 'Play Rolling Fog', exact: true }).click();
      await choice().getByRole('button', { name: /Fog 2/ }).click();
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountInvisible(page, 'rolling');
      await expect(choice()).toContainText('Move Fog 2');
      await page.getByRole('button', { name: 'Choose space 29', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toHaveCount(0);
      expect((await state(page)).boardTokens?.[1].position).toBe('n27');
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      await page.getByRole('button', { name: 'Maneuver', exact: true }).tap();
      await expect(page.getByRole('button', { name: 'Move to 26', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Move to 26', exact: true }).focus();
      await page.keyboard.press('Enter');
      expect((await state(page)).fighters[0].position).toBe('n24');
      await expect(page.locator('.arena canvas')).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath('fog-travel-phone.png'),
        animations: 'disabled',
      });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('Invisible Man restores Vanish from an empty board position across a phone reload', async ({
  page,
}) => {
  await observe(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountInvisible(page, 'vanish');
  await page.locator('.game-card').filter({ hasText: 'Vanish' }).click();
  await page.getByRole('button', { name: 'Play Vanish', exact: true }).click();
  await expect.poll(async () => (await state(page)).fighters[0].position).toBeNull();
  await page.evaluate(() => {
    const apply = (
      window as unknown as {
        invisibleTestApply: (
          command: import('../../packages/game/src').Command,
          actor: string,
        ) => void;
      }
    ).invisibleTestApply;
    for (let i = 0; i < 2; i++) {
      apply({ type: 'maneuver' }, 'p1');
      apply({ type: 'finish-maneuver' }, 'p1');
    }
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await mountInvisible(page, 'vanish');
  const choice = page.getByRole('region', { name: 'Ability choice' });
  await expect(choice).toContainText('teleport Invisible Man');
  await page.getByRole('button', { name: 'Choose space 26', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect((await state(page)).fighters[0].position).toBe('n24');
  expect((await state(page)).fighters[0].defeated).toBe(false);
  await expect(page.locator('.arena canvas')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('vanish-return-phone.png'),
    animations: 'disabled',
  });
});

test('Invisible Man keeps opponent fog control private and resumes it after reconnect', async ({
  page,
}) => {
  await observe(page);
  await mountInvisible(page, 'covert');
  const choice = () => page.getByRole('region', { name: 'Ability choice' });
  await choice().getByRole('button', { name: /Fog 1/ }).click();
  await choice().getByRole('button', { name: 'Leave token in place', exact: true }).click();
  await expect(choice()).toHaveCount(0);
  await page.reload();
  await mountInvisible(page, 'covert', 'p1');
  await expect(choice().getByRole('button', { name: /Fog 1/ })).toHaveCount(0);
  await choice().getByRole('button', { name: /Fog 2/ }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await mountInvisible(page, 'covert', 'p1');
  await expect(choice()).toContainText('Move Fog 2');
  await choice().getByRole('button', { name: 'Leave token in place', exact: true }).click();
  await expect(choice()).toHaveCount(0);
});

test('Invisible Man orders Coded Notes privately across reconnect', async ({ page }) => {
  await observe(page);
  await mountInvisible(page, 'notes');
  const choice = () => page.getByRole('region', { name: 'Ability choice' });
  await expect(choice()).toContainText('top of your deck');
  const first = (await state(page)).resolution.choice!.options[0].id;
  await choice().locator('button.game-card').first().click();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await mountInvisible(page, 'notes');
  await expect(choice()).toContainText('top of your deck');
  const second = (await state(page)).resolution.choice!.options[0].id;
  await choice().locator('button.game-card').first().focus();
  await page.keyboard.press('Enter');
  await expect(choice()).toHaveCount(0);
  expect((await state(page)).players[0].deck.slice(0, 2).map((c) => c.id)).toEqual([first, second]);
});
