import { expect, test, type Page } from '@playwright/test';

// Production engine/projection with fixed decks. Reloads restore the JSON continuation boundary.
async function mountPhilippa(
  page: Page,
  scene: 'ruse' | 'zone' | 'polymorphy' | 'end',
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
      const saved = sessionStorage.getItem('philippa-test-state');
      let state: import('../../packages/game/src/index').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [0, 1].map((i) => ({
              id: `p${i}`,
              name: i ? 'Hector' : 'Philippa',
              character: 'philippa',
              deck: deckDefinitions('philippa').map((definition, j) => ({
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
        const own = [
          'philippa-spymasters-ruse',
          'philippa-polymorphy',
          'philippa-backup-plan',
          'philippa-chain-lightning',
          'philippa-owlform',
        ];
        const enemy = [
          'philippa-regicide',
          'philippa-cunning',
          'philippa-spellbreaker',
          'philippa-blinding-dust',
          'philippa-lightning-bolt',
        ];
        state.players[0].hand.forEach((c, i) => {
          c.definition = own[i];
        });
        state.players[1].hand.forEach((c, i) => {
          c.definition = enemy[i];
        });
        const fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
        fighter('p0:main').position = 'n1';
        fighter('p0:ally-1').position = 'n9';
        fighter('p1:main').position = 'n0';
        fighter('p1:ally-1').position = 'n2';
        const play = (definition: string, fighter: string) =>
          apply(
            {
              type: 'play-action',
              fighter,
              card: state.players[0].hand.find((c) => c.definition === definition)!.id,
            },
            'p0',
          );
        if (scene === 'ruse') play('philippa-spymasters-ruse', 'p0:ally-1');
        if (scene === 'polymorphy') play('philippa-polymorphy', 'p0:main');
        if (scene === 'end') {
          state.actions = 1;
          state.players[0].hand = state.players[0].hand.filter(
            (c) => c.definition === 'philippa-backup-plan',
          );
          play('philippa-backup-plan', 'p0:main');
          apply({ type: 'choose', choice: state.resolution.choice!.id, options: ['health'] }, 'p0');
        }
        if (scene === 'zone') {
          apply(
            {
              type: 'attack',
              fighter: 'p0:main',
              target: 'p1:main',
              card: state.players[0].hand.find((c) => c.definition === 'philippa-chain-lightning')!
                .id,
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
        sessionStorage.setItem('philippa-test-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'philippa-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Philippa' : 'Hector' },
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
        sessionStorage.getItem('philippa-test-state')!,
      ) as import('../../packages/game/src/index').GameState,
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Philippa restores delegated reveal, selected-zone damage and end-step draw (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion,
    });
    context.setDefaultTimeout(10_000);
    await context.addInitScript(() => {
      new MutationObserver(() =>
        document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
      ).observe(document, { subtree: true, childList: true, attributes: true });
    });
    await context.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const choice = () => page.locator('.hand-panel:has(.ability-options)');
    const reset = async () => {
      await page.evaluate(() => sessionStorage.removeItem('philippa-test-state'));
    };
    try {
      await mountPhilippa(page, 'ruse');
      await page.getByRole('button', { name: 'Hector', exact: true }).click();
      // View each private selection as its actual owner; all intermediate choices survive reload.
      for (let i = 0; i < 4; i++) {
        await page.reload();
        await mountPhilippa(page, 'ruse', 'p1');
        await expect(choice()).toContainText(`Choose cards to reveal (${i}/4)`);
        await choice().locator('button.game-card').first().click();
      }
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload();
      await mountPhilippa(page, 'ruse');
      await expect(choice()).toContainText('Discard 2 revealed cards');
      await choice().getByRole('button', { name: 'Regicide', exact: true }).focus();
      await page.keyboard.press('Enter');
      await choice().getByRole('button', { name: 'Cunning', exact: true }).tap();
      await page.screenshot({
        path: test.info().outputPath('philippa-ruse-phone.png'),
        animations: 'disabled',
      });
      await choice()
        .getByRole('button', { name: /^Confirm choice/ })
        .tap();
      await expect.poll(async () => (await currentState(page)).players[1].discard.length).toBe(2);
      await reset();
      await mountPhilippa(page, 'zone');
      await expect(choice()).toContainText('Choose a zone');
      await page.reload();
      await mountPhilippa(page, 'zone');
      await choice().getByRole('button', { name: 'gold', exact: true }).tap();
      expect((await currentState(page)).fighters.find((f) => f.id === 'p1:ally-1')?.hp).toBe(5);
      expect((await currentState(page)).fighters.find((f) => f.id === 'p1:main')?.hp).toBe(10);
      await reset();
      await mountPhilippa(page, 'polymorphy');
      await page
        .getByRole('button', { name: /^Choose space / })
        .first()
        .tap();
      await expect.poll(async () => (await currentState(page)).players[0].ongoing?.length).toBe(1);
      await expect(
        page.getByRole('button', { name: /Philippa \(you\): 12 health, 5 movement/ }),
      ).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath('philippa-polymorphy-phone.png'),
        animations: 'disabled',
      });
      await reset();
      await mountPhilippa(page, 'end');
      await expect(choice()).toContainText('Two Steps Ahead');
      await page.reload();
      await mountPhilippa(page, 'end');
      await page.getByRole('button', { name: 'Use Two Steps Ahead', exact: true }).tap();
      await expect.poll(async () => (await currentState(page)).players[0].hand.length).toBe(4);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
