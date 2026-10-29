import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountGeralt(page: Page, scene: 'gear' | 'potion' | 'rend', viewer = 'p0') {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  );
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
      const saved = sessionStorage.getItem('geralt-of-rivia-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Geralt',
              character: i ? 'medusa' : 'geralt-of-rivia',
              deck: deckDefinitions(i ? 'medusa' : 'geralt-of-rivia').map((definition, j) => ({
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
      if (!saved && scene !== 'gear') {
        while (state.resolution.choice?.prompt.startsWith('Always Prepared')) {
          const c = state.resolution.choice;
          apply({ type: 'choose', choice: c.id, options: [c.options[0].id] }, c.player);
        }
        while (state.phase.type === 'placing-allies') {
          const f = state.fighters.find((f) => !f.defeated && f.position === null)!;
          apply(
            {
              type: 'place-ally',
              fighter: f.id,
              position: deploymentSpaces(state, f.id, basic.map)[0],
            },
            f.player,
          );
        }
        const pending = state.resolution.choice;
        if (pending)
          apply({ type: 'choose', choice: pending.id, options: ['skip'] }, pending.player);
        state.players[0].hand.forEach((c, i) => {
          c.definition = [
            'geralt-of-rivia-gear-blizzard',
            'geralt-of-rivia-gear-tawny-owl',
            'geralt-of-rivia-rend',
            'geralt-of-rivia-damn-youre-ugly',
            'geralt-of-rivia-plot-twist',
          ][i];
        });
        state.fighters.find((f) => f.id === 'p0:main')!.position = 'n0';
        state.fighters.find((f) => f.id === 'p0:ally-1')!.position = 'n9';
        state.fighters.find((f) => f.id === 'p1:main')!.position = 'n1';
        for (let i = 1; i <= 3; i++)
          state.fighters.find((f) => f.id === `p1:ally-${i}`)!.position = `n${15 + i}`;
        if (scene === 'rend') {
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
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      let events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
      let game = projectGame(state, viewer, false);
      const render = () => {
        sessionStorage.setItem('geralt-of-rivia-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'geralt-of-rivia-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Geralt' : 'Hector' },
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
        sessionStorage.getItem('geralt-of-rivia-test-state')!,
      ) as import('../../packages/game/src/index').GameState,
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Geralt chooses all gear before deployment across desktop and phone reconnect (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion,
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    try {
      await mountGeralt(page, 'gear');
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText('Scegli una spada');
      await page.screenshot({
        path: test.info().outputPath('geralt-gear-desktop.png'),
        animations: 'disabled',
      });
      await choice()
        .getByRole('button', { name: 'EQUIPAGGIAMENTO: spada d’acciaio', exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toContainText('Scegli un’armatura');
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountGeralt(page, 'gear');
      await choice()
        .getByRole('button', { name: 'EQUIPAGGIAMENTO: medaglione del Lupo', exact: true })
        .tap();
      await expect(choice()).toContainText('Scegli una pozione');
      await page.screenshot({
        path: test.info().outputPath('geralt-gear-phone.png'),
        animations: 'disabled',
      });
      await choice().getByRole('button', { name: 'EQUIPAGGIAMENTO: Tormenta', exact: true }).tap();
      const state = await currentState(page);
      expect(state.players[0].hand).toHaveLength(5);
      expect(state.players[0].deck).toHaveLength(25);
      expect(state.phase.type).toBe('placing-allies');
      expect(state.fighters.find((f) => f.id === 'p0:ally-1')?.position).toBeNull();
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
  test(`Geralt keeps a potion active and shows Dandelion on desktop and phone (${reducedMotion})`, async ({
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
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    try {
      await mountGeralt(page, 'potion');
      await expect(page.locator('.badge-ally').filter({ hasText: 'Ranuncolo' })).toBeVisible();
      await page.locator('.game-card').filter({ hasText: 'EQUIPAGGIAMENTO: Tormenta' }).click();
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText('Scegli una destinazione');
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountGeralt(page, 'potion');
      await choice().getByRole('button', { name: 'Resta fermo', exact: true }).tap();
      await expect(choice()).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      expect((await currentState(page)).players[0].ongoing).toHaveLength(1);
      await page.getByRole('button', { name: /Geralt \(tu\).*Dettagli giocatore/ }).tap();
      await expect(page.getByRole('dialog')).toContainText('EQUIPAGGIAMENTO: Tormenta · Attiva');
      await expect(page.getByRole('dialog')).toContainText('Ranuncolo');
      await page.screenshot({
        path: test.info().outputPath('geralt-potion-phone.png'),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: test.info().outputPath('geralt-match-desktop.png'),
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('Geralt restores a private Rend BOOST and pays the exact hand instance on phone', async ({
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
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await mountGeralt(page, 'rend');
    const choice = () => page.locator('.hand-panel:has(.ability-options)');
    await expect(choice()).toContainText('Potenzia attacco');
    await page.reload();
    await mountGeralt(page, 'rend');
    const before = await currentState(page);
    const payment = before.players[0].hand.find(
      (c) => c.definition === 'geralt-of-rivia-damn-youre-ugly',
    )!;
    await page.getByRole('button', { name: /Accidenti, quanto sei brutto · BOOST \+4/ }).tap();
    await expect(choice()).toHaveCount(0);
    expect((await currentState(page)).players[0].discard.some((c) => c.id === payment.id)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('Geralt’s complete gear pool has fifteen loaded illustrations and keyboard card inspectors', async ({
  browser,
}) => {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion: 'reduce',
    }),
    page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    page.setDefaultTimeout(10_000);
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
    );
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Accedi per giocare', exact: true }),
    ).toBeVisible();
    const explorer = page.getByRole('button', { name: /^Esplora \d+ personaggi$/ });
    if (await explorer.isVisible()) await explorer.click();
    const roster = page.getByRole('region', { name: 'Personaggi disponibili' });
    await roster.getByRole('button', { name: 'Esamina Geralt di Rivia', exact: true }).click();
    await expect(roster).toContainText('Sempre pronto');
    await expect(roster).toContainText('Ranuncolo');
    await roster
      .getByRole('button', { name: 'Mazzo di Geralt di Rivia · 15 carte diverse', exact: true })
      .click();
    const gallery = page.getByRole('dialog', { name: 'Mazzo di Geralt di Rivia', exact: true });
    await expect(gallery.locator('.deck-gallery > button')).toHaveCount(15);
    await page.screenshot({
      path: test.info().outputPath('geralt-gallery-desktop.png'),
      animations: 'disabled',
    });
    for (const button of await gallery.locator('.deck-gallery > button').all()) {
      await button.click();
      const inspector = page.getByRole('dialog').last();
      await expect(inspector.locator('.printed-card')).toBeVisible();
      await expect(inspector.locator('img')).toHaveJSProperty('complete', true);
      await expect(inspector.locator('img')).not.toHaveJSProperty('naturalWidth', 0);
      await page.keyboard.press('Escape');
      await expect(button).toBeFocused();
    }
    for (let i = 0; i < 2 && (await page.getByRole('dialog').count()); i++)
      await page
        .getByRole('dialog')
        .last()
        .getByRole('button', { name: 'Chiudi finestra', exact: true })
        .click();
    await page.setViewportSize({ width: 844, height: 390 });
    if (await explorer.isVisible()) await explorer.click();
    await roster.getByRole('button', { name: 'Esamina Geralt di Rivia', exact: true }).click();
    await roster
      .getByRole('button', { name: 'Mazzo di Geralt di Rivia · 15 carte diverse', exact: true })
      .click();
    await gallery.locator('.deck-gallery > button').last().click();
    await page.screenshot({
      path: test.info().outputPath('geralt-inspector-phone.png'),
      animations: 'disabled',
    });
    expect(
      await page
        .getByRole('dialog')
        .last()
        .evaluate((dialog) => {
          const bounds = dialog.getBoundingClientRect();
          return (
            bounds.left >= 0 &&
            bounds.right <= innerWidth &&
            bounds.top >= 0 &&
            bounds.bottom <= innerHeight
          );
        }),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
