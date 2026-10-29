import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountAchilles(page: Page, scene: 'recovery' | 'helm', viewer = 'p0') {
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
      const saved = sessionStorage.getItem('achilles-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Achilles',
              character: 'achilles',
              deck: deckDefinitions('achilles').map((definition, j) => ({
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
        // Recovery scene has a passive rival for the first defense; bonus defense remains interactive.
        if (scene === 'recovery' && state.phase.type === 'awaiting-defense' && !state.phase.bonus) {
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
            'achilles-battle-hardened',
            'achilles-test-for-weakness',
            'achilles-under-achilles-helm',
            'achilles-the-day-of-your-doom',
            'achilles-spear-throw',
          ][i];
        });
        state.players[1].hand.forEach((card) => {
          card.definition = 'achilles-feint';
        });
        state.fighters.find((f) => f.id === 'p0:main')!.position = 'n0';
        state.fighters.find((f) => f.id === 'p0:ally-1')!.position = 'n5';
        state.fighters.find((f) => f.id === 'p1:main')!.position = 'n1';
        state.fighters.find((f) => f.id === 'p1:ally-1')!.position = 'n18';
        state.players[0].discard.push({ id: 'prior', definition: 'achilles-feint' });
        if (scene === 'helm') {
          state.turn = 1;
          state.players[1].hand[0].definition = 'achilles-test-for-weakness';
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
        sessionStorage.setItem('achilles-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'achilles-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Achilles' : 'Hector' },
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
        sessionStorage.getItem('achilles-test-state')!,
      ) as import('../../packages/game/src/index').GameState,
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Achilles recovers a discard and resolves a public bonus defense on desktop/phone (${reducedMotion})`, async ({
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
      await mountAchilles(page, 'recovery');
      await expect(page.locator('.fighter-hit[data-fighter="p0:ally-1"]')).toBeVisible();
      await page.locator('.game-card').filter({ hasText: 'Temprato dalla battaglia' }).click();
      await page.getByRole('button', { name: /^Bersaglio .*\(Hector\)$/ }).click();
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText('Riprendi in mano una carta scartata');
      await expect(choice().getByRole('button', { name: 'Finta', exact: true })).toContainText(
        'annulla tutti gli effetti',
      );
      await page.screenshot({
        path: test.info().outputPath('achilles-recovery-desktop.png'),
        animations: 'disabled',
      });
      await mountAchilles(page, 'recovery');
      await choice().getByRole('button', { name: 'Finta', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      expect((await currentState(page)).players[0].hand.some((c) => c.id === 'prior')).toBe(true);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.locator('.game-card').filter({ hasText: 'Sondare le debolezze' }).click();
      await page.getByRole('button', { name: /^Bersaglio .*\(Hector\)$/ }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      await mountAchilles(page, 'recovery', 'p1');
      await expect(page.getByRole('status')).toContainText('Assalto implacabile · Attack 3');
      await page.screenshot({
        path: test.info().outputPath('achilles-bonus-phone.png'),
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Subisci il colpo', exact: true }).tap();
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      const state = await currentState(page);
      expect(state.revealed).toMatchObject({
        damage: 3,
        bonus: { name: 'Relentless Assault', value: 3 },
      });
      expect(
        state.players[0].discard.filter((c) => c.definition === 'achilles-test-for-weakness'),
      ).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test(`Achilles exchanges his helm and Patroclus inherits the second defense (${reducedMotion})`, async ({
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
      await mountAchilles(page, 'helm');
      await page.locator('.game-card').filter({ hasText: 'Sotto l’elmo di Achille' }).click();
      await expect(page.locator('.hand-panel:has(.ability-options)')).toContainText(
        'Sotto l’elmo di Achille',
      );
      await page.screenshot({
        path: test.info().outputPath('achilles-helm-desktop.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await mountAchilles(page, 'helm');
      await page.getByRole('button', { name: /^Usa / }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      await expect(page.getByRole('status')).toContainText('Assalto implacabile · Attack 3');
      await expect(page.locator('.fighter-hit[data-fighter="p0:ally-1"]')).toBeVisible();
      let state = await currentState(page);
      expect(state.phase).toMatchObject({ type: 'awaiting-defense', defender: 'p0:ally-1' });
      expect(state.fighters.find((f) => f.id === 'p0:main')?.position).toBe('n5');
      expect(state.fighters.find((f) => f.id === 'p0:ally-1')?.position).toBe('n0');
      await mountAchilles(page, 'helm');
      await page.getByRole('button', { name: 'Subisci il colpo', exact: true }).tap();
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      state = await currentState(page);
      expect(state.fighters.find((f) => f.id === 'p0:ally-1')?.hp).toBe(3);
      expect(state.fighters.find((f) => f.id === 'p0:main')?.hp).toBe(18);
      await page.screenshot({
        path: test.info().outputPath('achilles-patroclus-phone.png'),
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
