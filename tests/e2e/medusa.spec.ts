import { expect, test, type Page } from '@playwright/test';

// Deterministic engine-backed UI: production rules, projections, choices and artwork.
// Session storage supplies the same JSON recovery boundary used by serialized matches.
async function mountMedusa(page: Page) {
  await page.goto('/');
  await page.evaluate(async (rootPath) => {
    const resource = (name: string) =>
      performance
        .getEntriesByType('resource')
        .find((e) => new URL(e.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const { createElement } = (await import(resource('react'))).default;
    const { createRoot } = (await import(resource('react-dom_client'))).default;
    const gameUrl = '/src/game/Game.tsx',
      eventsUrl = '/src/animation/events.ts';
    const engineUrl = `/@fs${rootPath}/packages/game/src/index.ts`;
    const contentUrl = `/@fs${rootPath}/packages/content/src/index.ts`;
    const projectionUrl = `/@fs${rootPath}/apps/server/src/transport/projection.ts`;
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
    const saved = sessionStorage.getItem('medusa-test-state');
    let state: import('../../packages/game/src/index').GameState = saved
      ? JSON.parse(saved)
      : createGame(
          ['medusa', 'medusa'].map((character, i) => ({
            id: `p${i}`,
            name: i ? 'Briar' : 'Gorgon',
            character,
            deck: deckDefinitions(character).map((definition, j) => ({
              id: `p${i}-${j}`,
              definition,
            })),
          })),
          basic,
        );
    const apply = (command: import('../../packages/game/src/index').Command, actor = 'p0') => {
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
      apply({ type: 'choose', choice: state.resolution.choice!.id, options: ['skip'] });
      state.players[0].hand[0].definition = 'medusa-winged-frenzy';
      Object.assign(
        state.fighters.find((f) => f.id === 'p0:ally-3')!,
        { defeated: true, hp: 0 },
      );
      state.fighters.find((f) => f.id === 'p0:ally-1')!.position = 'n5';
      state.fighters.find((f) => f.id === 'p0:ally-2')!.position = 'n6';
      state.fighters.find((f) => f.id === 'p1:main')!.position = 'n1';
      for (let i = 1; i <= 3; i++)
        state.fighters.find((f) => f.id === `p1:ally-${i}`)!.position = `n${17 + i}`;
    }
    document.getElementById('root')!.hidden = true;
    const host = document.createElement('div');
    host.className = 'shell in-match';
    document.body.append(host);
    const root = createRoot(host);
    let events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
    let game = projectGame(state, 'p0', false);
    const render = () => {
      sessionStorage.setItem('medusa-test-state', JSON.stringify(state));
      root.render(
        createElement(Game, {
          room: { id: 'medusa-test', host: 'p0', capacity: 2, seats: [], game },
          user: { id: 'p0', name: 'Gorgon' },
          events,
          reset: 0,
          connected: true,
          onLeave: () => {},
          onCommand: (command: import('../../packages/game/src/index').Command) => {
            const previous = game,
              outcomes = apply(command);
            game = projectGame(state, 'p0', false);
            events = [...events, ...presentationEvents(previous, game, outcomes)];
            render();
          },
        }),
      );
    };
    render();
  }, process.cwd());
  await expect(page.locator('main.game-layout')).toBeVisible();
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Medusa’s group choices and revival recover on desktop and landscape phone (${reducedMotion})`, async ({
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
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await mountMedusa(page);
      await page.getByRole('button', { name: 'Arpia 1', exact: true }).click();
      const card = page.locator('.game-card').filter({ hasText: 'Frenesia alata' });
      await expect(card.locator('img')).toHaveJSProperty('complete', true);
      await card.click();
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText('Scegli il prossimo combattente');
      await mountMedusa(page);
      await page.getByRole('button', { name: 'Medusa', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toContainText('Scegli una destinazione');
      await expect(
        page.getByRole('button', { name: 'Scegli casella 02', exact: true }),
      ).toHaveCount(0); // Enemy occupies n1.
      await mountMedusa(page);
      await page.getByRole('button', { name: 'Scegli casella 03', exact: true }).click(); // Cross enemy n1 to n2.
      await expect(choice()).toContainText('Scegli il prossimo combattente');
      await page.getByRole('button', { name: 'Arpia 2', exact: true }).click();
      await choice().getByRole('button', { name: 'Resta fermo', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Arpia 2', exact: true })).toHaveCount(0);
      await expect(page.locator('.action-notice.is-visible')).toHaveCount(0, { timeout: 30000 });
      await page.screenshot({
        path: test.info().outputPath('medusa-desktop.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.getByRole('button', { name: 'Arpia 1', exact: true }).tap();
      await choice().getByRole('button', { name: 'Resta fermo', exact: true }).tap();
      await expect(choice()).toContainText('Riporta in gioco un alleato sconfitto');
      await mountMedusa(page);
      await page.getByRole('button', { name: 'Arpia 3', exact: true }).tap();
      await expect(choice()).toContainText('Scegli dove riportare l’alleato');
      await mountMedusa(page);
      await page.getByRole('button', { name: 'Scegli casella 04', exact: true }).focus();
      await page.keyboard.press('Enter'); // n3 shares moved Medusa's gold zone.
      await expect(
        page.locator('.player-badge').first().locator('.badge-ally').filter({ hasText: 'Arpia 3' }),
      ).toContainText('1/1 PV');
      await expect(page.getByRole('button', { name: 'Arpia 3', exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      await expect(page.locator('.action-notice.is-visible')).toHaveCount(0, { timeout: 30000 });
      await page.screenshot({
        path: test.info().outputPath('medusa-revived-phone.png'),
        animations: 'disabled',
      });
      const state = await page.evaluate(
        () =>
          JSON.parse(
            sessionStorage.getItem('medusa-test-state')!,
          ) as import('../../packages/game/src/index').GameState,
      );
      expect(state.fighters.find((f) => f.id === 'p0:main')?.position).toBe('n2');
      expect(state.fighters.find((f) => f.id === 'p0:ally-3')).toMatchObject({
        hp: 1,
        defeated: false,
        position: 'n3',
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
