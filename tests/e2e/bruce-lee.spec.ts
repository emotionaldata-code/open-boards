import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountBruceLee(
  page: Page,
  scene: 'recovery' | 'placement' | 'punch' | 'end-step',
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
      const saved = sessionStorage.getItem('bruce-lee-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Bruce Lee',
              character: i ? 'medusa' : 'bruce-lee',
              deck: deckDefinitions(i ? 'medusa' : 'bruce-lee').map((definition, j) => ({
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
        if (state.resolution.choice)
          apply({ type: 'choose', choice: state.resolution.choice.id, options: ['skip'] }, 'p0');
        state.players[0].hand.forEach((card, i) => {
          card.definition = [
            'bruce-lee-hoo-whaaaaaa',
            'bruce-lee-bring-it-on',
            'bruce-lee-one-inch-punch',
            'bruce-lee-nunchaku',
            'bruce-lee-feint',
          ][i];
        });
        const fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
        fighter('p0:main').position = 'n0';
        fighter('p1:main').position = 'n9';
        for (let i = 1; i <= 3; i++) fighter(`p1:ally-${i}`).position = `n${15 + i}`;
        if (scene === 'recovery')
          state.players[0].discard.push(
            { id: 'recover-wrist', definition: 'bruce-lee-jeet-kune-do-wrist-lock' },
            { id: 'ineligible', definition: 'bruce-lee-feint' },
          );
        if (scene === 'punch') fighter('p1:ally-2').position = 'n1';
        if (scene === 'end-step') {
          state.actions = 1;
          apply({ type: 'maneuver' }, 'p0');
          apply({ type: 'finish-maneuver' }, 'p0');
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
        sessionStorage.setItem('bruce-lee-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'bruce-lee-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Bruce Lee' : 'Hector' },
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
        sessionStorage.getItem('bruce-lee-test-state')!,
      ) as import('../../packages/game/src/index').GameState,
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Bruce Lee recovers a technique and places an enemy after reload (${reducedMotion})`, async ({
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
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await mountBruceLee(page, 'recovery');
      await page.locator('.game-card').filter({ hasText: 'HOO!' }).click();
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText('Riprendi in mano una carta scartata');
      await expect(choice().getByRole('button', { name: 'Finta', exact: true })).toHaveCount(0);
      await page.screenshot({
        path: test.info().outputPath('bruce-lee-recovery-desktop.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountBruceLee(page, 'recovery');
      await choice()
        .getByRole('button', { name: 'Jeet Kune Do: leva al polso', exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      expect((await currentState(page)).players[0].hand.some((c) => c.id === 'recover-wrist')).toBe(
        true,
      );
      expect((await currentState(page)).actions).toBe(2);
      await page.locator('.game-card').filter({ hasText: 'Fatti sotto' }).tap();
      await expect(choice()).toContainText('Scegli un combattente');
      await page.getByRole('button', { name: 'Medusa · Hector', exact: true }).tap();
      await page.reload();
      await mountBruceLee(page, 'recovery');
      await expect(choice()).toContainText('Scegli dove teletrasportare');
      await page.screenshot({
        path: test.info().outputPath('bruce-lee-placement-phone.png'),
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Scegli casella 02', exact: true }).tap();
      await expect(choice()).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      expect((await currentState(page)).fighters.find((f) => f.id === 'p1:main')?.position).toBe(
        'n1',
      );
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

test('Bruce Lee returns One-Inch Punch after defeating the exact numbered ally on phone', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    new MutationObserver(() =>
      document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
    ).observe(document, { subtree: true, childList: true, attributes: true });
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await mountBruceLee(page, 'punch');
    await page.locator('.game-card').filter({ hasText: 'Pugno da un pollice' }).tap();
    const choice = () => page.locator('.hand-panel:has(.ability-options)');
    await expect(page.getByRole('button', { name: 'Arpia 2 · Hector', exact: true })).toBeVisible();
    await page.reload();
    await mountBruceLee(page, 'punch');
    await page.getByRole('button', { name: 'Arpia 2 · Hector', exact: true }).tap();
    await expect(choice()).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
    const state = await currentState(page);
    expect(state.fighters.find((f) => f.id === 'p1:ally-2')?.defeated).toBe(true);
    expect(state.players[0].hand.some((c) => c.definition === 'bruce-lee-one-inch-punch')).toBe(
      true,
    );
    expect(state.players[0].discard.some((c) => c.definition === 'bruce-lee-one-inch-punch')).toBe(
      false,
    );
    await page.screenshot({
      path: test.info().outputPath('bruce-lee-punch-phone.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('Bruce Lee restores the optional end step before ending his turn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountBruceLee(page, 'end-step');
  const choice = () => page.locator('.hand-panel:has(.ability-options)');
  await expect(choice()).toContainText('Scegli una destinazione');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await mountBruceLee(page, 'end-step');
  await page.getByRole('button', { name: 'Scegli casella 02', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(choice()).toHaveCount(0);
  expect((await currentState(page)).fighters.find((f) => f.id === 'p0:main')?.position).toBe('n1');
  expect((await currentState(page)).turn).toBe(1);
});
