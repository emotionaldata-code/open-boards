import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountDracula(page: Page, scene: 'beast' | 'bidding' | 'ritual', viewer = 'p0') {
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
      const saved = sessionStorage.getItem('dracula-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Dracula',
              character: 'dracula',
              deck: deckDefinitions('dracula').map((definition, j) => ({
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
        if (scene === 'beast' && state.phase.type === 'awaiting-defense') {
          const defense = execute(
            state,
            'p1',
            {
              id: `ui-${state.revision}`,
              revision: state.revision,
              command: { type: 'defend', card: null },
            },
            basic,
          );
          if (!defense.ok) throw new Error(defense.message);
          state = defense.state;
          return [...result.outcomes, ...defense.outcomes];
        }
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
            'dracula-beastform',
            'dracula-baptism-of-blood',
            'dracula-ravening-seduction',
            'dracula-mistform',
            'dracula-do-my-bidding',
          ][i];
        });
        state.players[1].hand.forEach((card, i) => {
          card.definition = [
            'dracula-feeding-frenzy',
            'dracula-feint',
            'dracula-beastform',
            'dracula-prey-upon',
            'dracula-dash',
          ][i];
        });
        const fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
        fighter('p0:main').position = 'n0';
        fighter('p1:main').position = 'n1';
        for (let i = 1; i <= 3; i++) {
          fighter(`p0:ally-${i}`).position = `n${20 + i}`;
          fighter(`p1:ally-${i}`).position = `n${15 + i}`;
        }
        if (scene === 'bidding') {
          state.turn = 1;
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
        if (scene === 'ritual') {
          fighter('p0:main').hp = 8;
          fighter('p0:ally-2').hp = 0;
          fighter('p0:ally-2').defeated = true;
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
        sessionStorage.setItem('dracula-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'dracula-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Dracula' : 'Hector' },
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
        sessionStorage.getItem('dracula-test-state')!,
      ) as import('../../packages/game/src/index').GameState,
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Dracula pays any number for Beastform on desktop/phone after reload (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion,
    });
    context.setDefaultTimeout(10000);
    await context.addInitScript(() => {
      new MutationObserver(() =>
        document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
      ).observe(document, { subtree: true, childList: true, attributes: true });
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await mountDracula(page, 'beast');
      for (let i = 1; i <= 3; i++)
        await expect(page.getByRole('button', { name: `Sister ${i}`, exact: true })).toBeVisible();
      await page.locator('.game-card').filter({ hasText: 'Beastform' }).click();
      await page.getByRole('button', { name: /^Target .*\(Hector\)$/ }).click();
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText('Discard up to 4 cards');
      await expect(choice().getByRole('button', { name: 'Pass', exact: true })).toBeEnabled();
      await page.screenshot({
        path: test.info().outputPath('dracula-beast-desktop.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountDracula(page, 'beast');
      await choice().getByRole('button', { name: 'Baptism of Blood', exact: true }).focus();
      await page.keyboard.press('Enter');
      await choice().getByRole('button', { name: 'Mistform', exact: true }).tap();
      await choice()
        .getByRole('button', { name: /^Confirm choice ·/ })
        .tap();
      await expect(choice()).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      expect((await currentState(page)).revealed?.damage).toBe(8);
      expect((await currentState(page)).players[0].discard).toHaveLength(3);
      await page.screenshot({
        path: test.info().outputPath('dracula-beast-phone.png'),
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test(`Dracula inspects and replaces a revealed attack privately across reload (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion,
    });
    context.setDefaultTimeout(10000);
    await context.addInitScript(() => {
      new MutationObserver(() =>
        document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
      ).observe(document, { subtree: true, childList: true, attributes: true });
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await mountDracula(page, 'bidding');
      await page.locator('.game-card').filter({ hasText: 'Do My Bidding' }).click();
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText('Look at Hector');
      const prey = choice().getByRole('button', { name: 'Prey Upon', exact: true });
      await expect(prey).toContainText('Deal 1 damage');
      await expect(prey.locator('img')).toHaveJSProperty('complete', true);
      await page.screenshot({
        path: test.info().outputPath('dracula-inspection-desktop.png'),
        animations: 'disabled',
      });
      await page.reload();
      await mountDracula(page, 'bidding');
      await choice().getByRole('button', { name: 'Feint', exact: true }).click();
      await expect(choice()).toContainText('Choose the replacement attack');
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountDracula(page, 'bidding');
      await page.screenshot({
        path: test.info().outputPath('dracula-replacement-phone.png'),
        animations: 'disabled',
      });
      await choice().getByRole('button', { name: 'Feint', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      expect((await currentState(page)).revealed).toMatchObject({
        attack: { definition: 'dracula-feint' },
        damage: 0,
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('Dracula restores a numbered Sister and directs Ravening Seduction on a landscape phone', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  context.setDefaultTimeout(10000);
  await context.addInitScript(() => {
    new MutationObserver(() =>
      document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
    ).observe(document, { subtree: true, childList: true, attributes: true });
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await mountDracula(page, 'ritual');
    await page.locator('.game-card').filter({ hasText: 'Baptism of Blood' }).tap();
    const choice = () => page.locator('.hand-panel:has(.ability-options)');
    await expect(page.getByRole('button', { name: 'Sister 2', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sister 2', exact: true }).tap();
    await page.reload();
    await mountDracula(page, 'ritual');
    await page
      .getByRole('button', { name: /^Choose space / })
      .first()
      .tap();
    await expect(choice()).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
    const state = await currentState(page);
    expect(state.fighters.find((f) => f.id === 'p0:ally-2')).toMatchObject({
      hp: 1,
      defeated: false,
    });
    expect(state.fighters.find((f) => f.id === 'p0:main')?.hp).toBe(10);
    await page.screenshot({
      path: test.info().outputPath('dracula-sisters-phone.png'),
      animations: 'disabled',
    });
    await page
      .getByRole('group', { name: 'Your fighters', exact: true })
      .getByRole('button', { name: 'Sister 1', exact: true })
      .tap();
    await page.locator('.game-card').filter({ hasText: 'Ravening Seduction' }).tap();
    await page.getByRole('button', { name: /^Dracula · Hector$/ }).tap();
    await page.reload();
    await mountDracula(page, 'ritual');
    await choice().getByRole('button', { name: 'Stay in place', exact: true }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
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
