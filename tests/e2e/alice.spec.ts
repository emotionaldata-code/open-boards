import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountAlice(page: Page, scene: 'setup' | 'looking' | 'hatter', viewer = 'p0') {
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
      const saved = sessionStorage.getItem('alice-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Alice',
              character: i ? 'medusa' : 'alice',
              deck: deckDefinitions(i ? 'medusa' : 'alice').map((definition, j) => ({
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
          apply({ type: 'choose', choice: state.resolution.choice!.id, options: ['big'] }, 'p0');
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
          fighter('p1:main').position = 'n1';
          for (let i = 1; i <= 3; i++) fighter(`p1:ally-${i}`).position = `n${15 + i}`;
          if (scene === 'looking') {
            fighter('p0:main').hp = 7;
            state.turn = 1;
            state.players[1].hand[0].definition = 'medusa-second-shot-3';
            state.players[0].hand[0].definition = 'alice-looking-glass';
            apply(
              {
                type: 'attack',
                fighter: 'p1:main',
                target: 'p0:main',
                card: state.players[1].hand[0].id,
              },
              'p1',
            );
            apply({ type: 'defend', card: state.players[0].hand[0].id }, 'p0');
            if (state.resolution.choice?.player === 'p1')
              apply(
                { type: 'choose', choice: state.resolution.choice.id, options: ['$skip'] },
                'p1',
              );
          } else {
            state.players[0].hand[0].definition = 'alice-mad-as-a-hatter';
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
        sessionStorage.setItem('alice-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'alice-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Alice' : 'Hector' },
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
        sessionStorage.getItem('alice-test-state')!,
      ) as import('../../packages/game/src/index').GameState,
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Alice chooses size before seeing her hand and restores Looking Glass (${reducedMotion})`, async ({
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
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/artwork/alice/'))
        errors.push(`${r.status()} ${r.url()}`);
    });
    try {
      await mountAlice(page, 'setup');
      expect((await currentState(page)).players.every((p) => p.hand.length === 0)).toBe(true);
      await page.getByRole('button', { name: 'PICCOLA · Carte difesa +1', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await currentState(page)).phase.type).toBe('placing-allies');
      expect(
        (await currentState(page)).fighters.find((f) => f.id === 'p0:main')!.statuses[0].id,
      ).toBe('small');
      await page.screenshot({
        path: test.info().outputPath('alice-setup-desktop.png'),
        animations: 'disabled',
      });
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await mountAlice(page, 'looking');
      const panel = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(panel()).toContainText('Scegli 2 effetti diversi');
      await panel()
        .getByRole('button', { name: 'Colloca Alice in qualsiasi altra casella', exact: true })
        .click();
      await expect(panel().getByRole('button', { name: /Conferma/ })).toBeDisabled();
      await panel()
        .getByRole('button', { name: 'Alice recupera 3 punti vita', exact: true })
        .click();
      await panel()
        .getByRole('button', { name: /Conferma/ })
        .click();
      await expect(panel()).toContainText('Scegli dove teletrasportare');
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountAlice(page, 'looking');
      await expect(panel()).toContainText('Scegli dove teletrasportare');
      const destination = page.getByRole('button', { name: 'Scegli casella 15', exact: true });
      await destination.focus();
      await page.keyboard.press('Enter');
      await expect
        .poll(
          async () => (await currentState(page)).fighters.find((f) => f.id === 'p0:main')!.position,
        )
        .toBe('n13');
      expect((await currentState(page)).fighters.find((f) => f.id === 'p0:main')!.hp).toBe(9);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      await page.screenshot({
        path: test.info().outputPath('alice-looking-phone.png'),
        animations: 'disabled',
      });
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await mountAlice(page, 'hatter');
      await expect(panel()).toContainText('Scegli');
      await page.getByRole('button', { name: 'Il Ciciarampa 1', exact: true }).tap();
      await expect(panel()).toContainText('Scegli una destinazione');
      await page.getByRole('button', { name: 'Resta fermo', exact: true }).tap();
      await page.getByRole('button', { name: 'Alice', exact: true }).tap();
      await page.getByRole('button', { name: 'Resta fermo', exact: true }).tap();
      await expect
        .poll(
          async () =>
            (await currentState(page)).fighters.find((f) => f.id === 'p0:main')!.statuses[0].id,
        )
        .toBe('small');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
