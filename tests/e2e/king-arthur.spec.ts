import { expect, test, type Page } from '@playwright/test';

// Deterministic engine-backed UI: production rules, projections, choices and artwork.
// Session storage supplies the same JSON recovery boundary used by serialized matches.
async function mountArthur(page: Page) {
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
    const saved = sessionStorage.getItem('arthur-test-state');
    let state: import('../../packages/game/src/index').GameState = saved
      ? JSON.parse(saved)
      : createGame(
          ['king-arthur', 'king-arthur'].map((character, i) => ({
            id: `p${i}`,
            name: i ? 'Briar' : 'Arthur',
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
      if (state.phase.type === 'awaiting-defense') {
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
      state.players[0].hand[0].definition = 'king-arthur-prophecy';
      state.players[0].hand[1].definition = 'king-arthur-restless-spirits';
      state.players[0].hand[2].definition = 'king-arthur-noble-sacrifice';
      state.players[0].hand[3].definition = 'king-arthur-excalibur';
      state.players[0].hand[4].definition = 'king-arthur-the-holy-grail';
      state.players[0].deck.slice(0, 4).forEach((card, i) => {
        card.definition = [
          'king-arthur-feint',
          'king-arthur-swift-strike',
          'king-arthur-regroup',
          'king-arthur-bewilderment',
        ][i];
      });
      state.fighters.find((f) => f.id === 'p0:main')!.position = 'n0';
      state.fighters.find((f) => f.id === 'p0:ally-1')!.position = 'n5';
      state.fighters.find((f) => f.id === 'p1:main')!.position = 'n1';
      state.fighters.find((f) => f.id === 'p1:ally-1')!.position = 'n18';
    }
    document.getElementById('root')!.hidden = true;
    const host = document.createElement('div');
    host.className = 'shell in-match';
    document.body.append(host);
    const root = createRoot(host);
    let events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
    let game = projectGame(state, 'p0', false);
    const render = () => {
      sessionStorage.setItem('arthur-test-state', JSON.stringify(state));
      root.render(
        createElement(Game, {
          room: { id: 'arthur-test', host: 'p0', capacity: 2, seats: [], game },
          user: { id: 'p0', name: 'Arthur' },
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
  test(`Arthur and Merlin recover private choices on desktop and landscape phone (${reducedMotion})`, async ({
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
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await mountArthur(page);
      await expect(page.getByRole('button', { name: 'Merlino 1', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Merlino 1', exact: true }).click();
      await page.locator('.game-card').filter({ hasText: 'Profezia' }).click();
      const choice = () => page.locator('.hand-panel:has(.ability-options)');
      await expect(choice()).toContainText(
        'Scegli una carta da aggiungere alla mano (2 rimanenti)',
      );
      for (const img of await choice().locator('img').all())
        await expect(img).toHaveJSProperty('complete', true);
      await expect(choice().getByRole('button', { name: 'Finta', exact: true })).toContainText(
        'annulla tutti gli effetti',
      );
      await page.screenshot({
        path: test.info().outputPath('arthur-prophecy-desktop.png'),
        animations: 'disabled',
      });
      await mountArthur(page);
      await choice().getByRole('button', { name: 'Finta', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(choice()).toContainText('(1 rimanente)');
      await page.setViewportSize({ width: 844, height: 390 });
      await mountArthur(page);
      await choice().getByRole('button', { name: 'Colpo rapido', exact: true }).tap();
      await expect(choice()).toContainText('Ordina le carte rimanenti');
      await mountArthur(page);
      await choice().getByRole('button', { name: 'Smarrimento', exact: true }).tap();
      await expect(choice()).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      await page.screenshot({
        path: test.info().outputPath('arthur-merlin-phone.png'),
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Re Artù', exact: true }).tap();
      await page.locator('.game-card').filter({ hasText: 'Nobile sacrificio' }).click();
      await page.getByRole('button', { name: /^Bersaglio .*\(Briar\)$/ }).click();
      await expect(choice()).toContainText('Potenzia attacco');
      await mountArthur(page);
      await page.getByRole('button', { name: 'Excalibur · BOOST +3', exact: true }).tap();
      await expect(choice()).toContainText('Potenzia attacco');
      await mountArthur(page);
      await page.getByRole('button', { name: 'Il Santo Graal · BOOST +2', exact: true }).tap();
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
      const state = await page.evaluate(
        () =>
          JSON.parse(
            sessionStorage.getItem('arthur-test-state')!,
          ) as import('../../packages/game/src/index').GameState,
      );
      expect(state.revealed).toMatchObject({ damage: 7, boosts: [{ amount: 3 }, { amount: 2 }] });
      await page.screenshot({
        path: test.info().outputPath('arthur-double-boost-phone.png'),
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
