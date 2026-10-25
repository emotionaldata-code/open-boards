import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountRobin(page: Page, scene: 'skirmish' | 'rich' | 'defenders', viewer = 'p0') {
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
      const saved = sessionStorage.getItem('robin-hood-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Robin Hood',
              character: 'robin-hood',
              deck: deckDefinitions('robin-hood').map((definition, j) => ({
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
        if (scene === 'skirmish' && state.phase.type === 'awaiting-defense') {
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
        state.players[0].hand.forEach((card, i) => {
          card.definition = [
            'robin-hood-steal-from-the-rich',
            'robin-hood-a-hunter-s-eye',
            'robin-hood-defenders-of-sherwood',
            'robin-hood-highway-robbery',
            'robin-hood-snark',
          ][i];
        });
        state.players[1].hand.forEach((card) => {
          card.definition = 'robin-hood-a-hunter-s-eye';
        });
        const fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
        fighter('p0:main').position = 'n0';
        fighter('p1:main').position = 'n1';
        for (let i = 1; i <= 4; i++) {
          fighter(`p0:ally-${i}`).position = `n${20 + i}`;
          fighter(`p1:ally-${i}`).position = `n${15 + i}`;
        }
        if (scene === 'skirmish') {
          fighter('p0:main').position = 'n25';
          fighter('p0:ally-4').position = 'n0';
        }
        if (scene === 'defenders') {
          fighter('p0:ally-4').hp = 0;
          fighter('p0:ally-4').defeated = true;
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
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      let events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
      let game = projectGame(state, viewer, false);
      const render = () => {
        sessionStorage.setItem('robin-hood-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'robin-hood-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Robin Hood' : 'Hector' },
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
  await expect(page.locator('.pixi-surface canvas')).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function currentState(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('robin-hood-test-state')!,
      ) as import('../../packages/game/src/index').GameState,
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Robin Hood delegates an opponent's private discard and resumes it after reload (${reducedMotion})`, async ({
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
    // The deterministic Game fixture has no authenticated app session.
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    try {
      await mountRobin(page, 'rich');
      for (let i = 1; i <= 4; i++)
        await expect(
          page
            .getByRole('group', { name: 'Your fighters' })
            .getByRole('button', { name: `Outlaw ${i}`, exact: true }),
        ).toBeVisible();
      await page.locator('.game-card').filter({ hasText: 'Steal From the Rich' }).click();
      await page.getByRole('button', { name: 'Play Steal From the Rich', exact: true }).click();
      const choice = () => page.getByRole('region', { name: 'Ability choice' });
      await choice().getByRole('button', { name: 'Hector', exact: true }).click();
      await expect(choice()).toHaveCount(0);
      await page.screenshot({
        path: test.info().outputPath('robin-rich-desktop.png'),
        animations: 'disabled',
      });
      await mountRobin(page, 'rich', 'p1');
      await expect(choice()).toContainText('Steal From the Rich');
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountRobin(page, 'rich', 'p1');
      await choice().getByRole('button', { name: 'Discard 1 card', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toContainText('Discard 1 card');
      await page.reload();
      await mountRobin(page, 'rich', 'p1');
      await page.screenshot({
        path: test.info().outputPath('robin-rich-phone.png'),
        animations: 'disabled',
      });
      await choice().getByRole('button', { name: "A Hunter's Eye", exact: true }).first().tap();
      await expect(choice()).toHaveCount(0);
      const state = await currentState(page);
      expect(state.players.map((p) => p.hand.length)).toEqual([5, 4]);
      expect(state.players[1].discard).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test(`Outlaw 4 attacks and uses Hit and Run across desktop and landscape phone (${reducedMotion})`, async ({
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
    // The deterministic Game fixture has no authenticated app session.
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    try {
      await mountRobin(page, 'skirmish');
      await page
        .getByRole('group', { name: 'Your fighters' })
        .getByRole('button', { name: 'Outlaw 4', exact: true })
        .click();
      await page.locator('.game-card').filter({ hasText: 'Highway Robbery' }).click();
      await page.getByRole('button', { name: 'Target Hector', exact: true }).click();
      await page.getByRole('button', { name: 'Commit attack', exact: true }).click();
      const choice = () => page.getByRole('region', { name: 'Ability choice' });
      await expect(choice()).toContainText('Choose a destination');
      await page.screenshot({
        path: test.info().outputPath('outlaw-retreat-desktop.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountRobin(page, 'skirmish');
      await page.screenshot({
        path: test.info().outputPath('outlaw-retreat-phone.png'),
        animations: 'disabled',
      });
      await choice()
        .getByRole('button', { name: /^Space / })
        .first()
        .tap();
      await expect(choice()).toHaveCount(0);
      const state = await currentState(page);
      expect(state.revealed?.damage).toBe(2);
      expect(state.fighters.find((f) => f.id === 'p0:ally-4')?.position).not.toBe('n0');
      expect(state.fighters.find((f) => f.id === 'p0:main')?.position).toBe('n25');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('Defenders of Sherwood returns numbered Outlaw 4 after reload on a landscape phone', async ({
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
  // The deterministic Game fixture has no authenticated app session.
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  try {
    await mountRobin(page, 'defenders');
    await page.locator('.game-card').filter({ hasText: 'Defenders of Sherwood' }).tap();
    await page
      .getByRole('button', { name: 'Defend with Defenders of Sherwood', exact: true })
      .tap();
    const choice = () => page.getByRole('region', { name: 'Ability choice' });
    await expect(choice()).toContainText('Outlaw 4');
    await choice().getByRole('button', { name: 'Outlaw 4', exact: true }).tap();
    await page.reload();
    await mountRobin(page, 'defenders');
    await choice().getByRole('button').first().tap();
    await expect(choice()).toHaveCount(0);
    expect((await currentState(page)).fighters.find((f) => f.id === 'p0:ally-4')).toMatchObject({
      hp: 1,
      defeated: false,
    });
    await page.screenshot({
      path: test.info().outputPath('robin-outlaws-revived-phone.png'),
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
