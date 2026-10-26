import { expect, test, type Page } from '@playwright/test';

// Deterministic engine-backed UI: production rules, projections, choices and artwork.
// Session storage supplies the same JSON recovery boundary used by serialized matches.
async function mountHolmes(page: Page, scenario: 'hand' | 'defense' = 'hand') {
  await page.goto('/');
  await page.evaluate(
    async ({ rootPath, scenario }) => {
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
      const saved = sessionStorage.getItem(`holmes-${scenario}-state`);
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['sherlock-holmes', 'sherlock-holmes'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Holmes',
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
        if (state.phase.type === 'awaiting-defense' && state.phase.defender === 'p1:main') {
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
        state.players[0].hand.forEach(
          (card, i) =>
            (card.definition = [
              'sherlock-holmes-eliminate-the-impossible',
              'sherlock-holmes-confirm-suspicion',
              'sherlock-holmes-elementary',
              'sherlock-holmes-counterpunch',
              'sherlock-holmes-administer-aid',
            ][i]),
        );
        state.players[1].hand.forEach(
          (card, i) =>
            (card.definition = [
              'sherlock-holmes-service-revolver',
              'sherlock-holmes-feint',
              'sherlock-holmes-study-methods',
              'sherlock-holmes-master-of-disguise',
              'sherlock-holmes-deduce-strategy',
            ][i]),
        );
        state.fighters.find((f) => f.id === 'p0:main')!.position = 'n0';
        state.fighters.find((f) => f.id === 'p0:ally-1')!.position = 'n5';
        state.fighters.find((f) => f.id === 'p1:main')!.position = 'n1';
        state.fighters.find((f) => f.id === 'p1:ally-1')!.position = 'n18';
        if (scenario === 'defense') {
          state.turn = 1;
          const card = state.players[1].hand[0];
          card.definition = 'sherlock-holmes-counterpunch';
          apply({ type: 'attack', fighter: 'p1:main', target: 'p0:main', card: card.id }, 'p1');
        }
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      let events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
      let game = projectGame(state, 'p0', false);
      const render = () => {
        sessionStorage.setItem(`holmes-${scenario}-state`, JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'holmes-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: 'p0', name: 'Holmes' },
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
    },
    { rootPath: process.cwd(), scenario },
  );
  await expect(page.locator('main.game-layout')).toBeVisible();
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Holmes and Watson inspect hands and predict attacks across reload on desktop and phone (${reducedMotion})`, async ({
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
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/cards/sherlock-holmes/'))
        errors.push(`${response.status()} ${response.url()}`);
    });
    try {
      await mountHolmes(page);
      await expect(page.getByRole('button', { name: 'Dr. Watson 1', exact: true })).toBeVisible();
      await page.locator('.game-card').filter({ hasText: 'Eliminate the Impossible' }).click();
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await page.getByRole('button', { name: 'Briar', exact: true }).click();
      await expect(choice()).toContainText('Discard 1 card from Briar');
      await mountHolmes(page);
      await expect(
        choice().getByRole('button', { name: 'Service Revolver', exact: true }),
      ).toContainText('Service Revolver');
      await page.screenshot({
        path: test.info().outputPath('holmes-private-hand-desktop.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await mountHolmes(page);
      await choice().getByRole('button', { name: 'Service Revolver', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toHaveCount(0);
      await page.locator('.game-card').filter({ hasText: 'Confirm Suspicion' }).click();
      await page.getByRole('button', { name: 'Briar', exact: true }).click();
      await choice()
        .getByRole('combobox', { name: 'Value', exact: true })
        .selectOption('value-100');
      await mountHolmes(page);
      // The selection has not been submitted; reload restores the full domain and commitment.
      await choice()
        .getByRole('combobox', { name: 'Value', exact: true })
        .selectOption('value-100');
      await choice().getByRole('button', { name: 'Confirm value', exact: true }).tap();
      await expect(choice()).toContainText('Revealed Briar');
      for (const img of await choice().locator('img').all())
        await expect(img).toHaveJSProperty('complete', true);
      await page.screenshot({
        path: test.info().outputPath('holmes-revealed-hand-phone.png'),
        animations: 'disabled',
      });
      await choice().getByRole('button', { name: 'Feint', exact: true }).tap();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await mountHolmes(page, 'defense');
      await page.locator('.game-card').filter({ hasText: 'Elementary' }).click();
      await expect(choice()).toContainText('Predict the printed attack value');
      const observation = await page.evaluate(async (rootPath) => {
        const url = `/@fs${rootPath}/apps/server/src/transport/projection.ts`;
        const { projectGame } = (await import(
          url
        )) as typeof import('../../apps/server/src/transport/projection');
        const state = JSON.parse(
          sessionStorage.getItem('holmes-defense-state')!,
        ) as import('../../packages/game/src').GameState;
        return projectGame(state, 'spectator', false);
      }, process.cwd());
      expect(observation.choice).toBeNull();
      expect(observation.revealed).toBeNull();
      expect(observation.observation?.cards[0].definition).toBe('sherlock-holmes-elementary');
      await page.setViewportSize({ width: 844, height: 390 });
      await mountHolmes(page, 'defense');
      await choice().getByRole('combobox', { name: 'Value', exact: true }).selectOption('value-3');
      await choice().getByRole('button', { name: 'Confirm value', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toHaveCount(0);
      const final = await page.evaluate(
        () =>
          JSON.parse(
            sessionStorage.getItem('holmes-defense-state')!,
          ) as import('../../packages/game/src').GameState,
      );
      expect(final.revealed).toMatchObject({ damage: 0, prediction: 3 });
      expect(final.fighters.find((f) => f.id === 'p0:main')?.hp).toBe(14); // Named Counterpunch remains uncancellable.
      expect(final.fighters.find((f) => f.id === 'p1:main')?.hp).toBe(16); // The defender takes no combat damage.
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      await page.screenshot({
        path: test.info().outputPath('holmes-elementary-phone.png'),
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
