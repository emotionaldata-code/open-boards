import { expect, test, type Page } from '@playwright/test';

/** Production engine and private projection, persisted through the same JSON boundary as reconnect. */
async function mountGenie(page: Page) {
  await page.goto('/');
  await page.evaluate(async (rootPath) => {
    const resource = (name: string) =>
      performance
        .getEntriesByType('resource')
        .find((e) => new URL(e.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const { createElement } = (await import(resource('react'))).default;
    const { createRoot } = (await import(resource('react-dom_client'))).default;
    const gameUrl = '/src/game/Game.tsx',
      engineUrl = `/@fs${rootPath}/packages/game/src/index.ts`,
      contentUrl = `/@fs${rootPath}/packages/content/src/index.ts`,
      projectionUrl = `/@fs${rootPath}/apps/server/src/transport/projection.ts`;
    const { Game } = (await import(gameUrl)) as typeof import('../../apps/client/src/game/Game');
    const { createGame, execute } = (await import(
      engineUrl
    )) as typeof import('../../packages/game/src');
    const { basic, deckDefinitions } = (await import(
      contentUrl
    )) as typeof import('../../packages/content/src');
    const { projectGame } = (await import(
      projectionUrl
    )) as typeof import('../../apps/server/src/transport/projection');
    const saved = sessionStorage.getItem('genie-test-state');
    let state: import('../../packages/game/src').GameState = saved
      ? JSON.parse(saved)
      : createGame(
          ['the-genie', 'the-genie'].map((character, i) => ({
            id: `p${i}`,
            name: i ? 'Rival' : 'Wishmaker',
            character,
            deck: deckDefinitions(character).map((definition, j) => ({
              id: `p${i}-${j}`,
              definition,
            })),
          })),
          basic,
        );
    const apply = (command: import('../../packages/game/src').Command, actor = 'p0') => {
      const result = execute(
        state,
        actor,
        { id: `genie-ui-${state.revision}`, revision: state.revision, command },
        basic,
      );
      if (!result.ok) throw new Error(result.message);
      state = result.state;
    };
    if (!saved) {
      apply({ type: 'choose', choice: state.resolution.choice!.id, options: ['skip'] });
      ['three-wishes', 'ive-made-sultans-out-of-less', 'i-am-freed'].forEach(
        (slug, i) => (state.players[0].hand[i].definition = `the-genie-${slug}`),
      );
      state.fighters[0].position = 'n0';
      state.fighters[1].position = 'n1';
    }
    document.getElementById('root')!.hidden = true;
    const host = document.createElement('div');
    host.className = 'shell in-match';
    document.body.append(host);
    const root = createRoot(host);
    const render = () => {
      sessionStorage.setItem('genie-test-state', JSON.stringify(state));
      root.render(
        createElement(Game, {
          room: {
            id: 'genie-test',
            host: 'p0',
            capacity: 2,
            seats: [],
            game: projectGame(state, 'p0', false),
          },
          user: { id: 'p0', name: 'Wishmaker' },
          events: [],
          reset: 0,
          connected: true,
          onLeave: () => {},
          onCommand: (command: import('../../packages/game/src').Command) => {
            apply(command);
            if (state.phase.type === 'awaiting-defense')
              apply({ type: 'defend', card: null }, 'p1');
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
  test(`Genie wishes, private hand inspection and mandatory placement recover on desktop and phone (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      reducedMotion,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/cards/the-genie/'))
        errors.push(`${r.status()} ${r.url()}`);
    });
    try {
      await mountGenie(page);
      const choice = () => page.getByRole('region', { name: 'Ability choice' });
      await page.locator('.game-card').filter({ hasText: 'Three Wishes' }).click();
      await page.getByRole('button', { name: 'Play Three Wishes', exact: true }).click();
      await expect(choice()).toContainText('Choose a wish');
      await mountGenie(page);
      await choice()
        .getByRole('button', {
          name: 'Your cards have value 4 for the rest of this turn',
          exact: true,
        })
        .focus();
      await page.keyboard.press('Enter');
      await page.locator('.game-card').filter({ hasText: "I've Made Sultans Out of Less" }).click();
      await page.getByRole('button', { name: 'Target Rival', exact: true }).click();
      await page.getByRole('button', { name: 'Commit attack', exact: true }).click();
      await expect(choice()).toContainText('from Rival’s hand');
      await mountGenie(page);
      const option = choice().locator('button.game-card').first();
      const name = await option.getAttribute('aria-label');
      await choice()
        .getByRole('button', { name: `Inspect ${name}`, exact: true })
        .first()
        .click();
      await expect(page.getByRole('dialog', { name: name!, exact: true })).toContainText('BOOST');
      await page.keyboard.press('Escape');
      await expect(
        choice()
          .getByRole('button', { name: `Inspect ${name}`, exact: true })
          .first(),
      ).toBeFocused();
      await page.screenshot({
        path: test.info().outputPath('genie-private-hand-desktop.png'),
        animations: 'disabled',
        timeout: 30000,
      });
      await page.setViewportSize({ width: 844, height: 390 });
      await mountGenie(page);
      await expect(choice().locator('.card-art img').first()).toHaveJSProperty('complete', true);
      await page.screenshot({
        path: test.info().outputPath('genie-private-hand-phone.png'),
        animations: 'disabled',
        timeout: 30000,
      });
      await choice().locator('button.game-card').first().tap();
      await page.locator('.game-card').filter({ hasText: 'I Am Freed' }).tap();
      await page.getByRole('button', { name: 'Target Rival', exact: true }).tap();
      await page.getByRole('button', { name: 'Commit attack', exact: true }).tap();
      await expect(choice()).toContainText('Choose where to teleport');
      await expect(
        choice().getByRole('button', { name: 'Stay in place', exact: true }),
      ).toHaveCount(0);
      await expect(choice().getByRole('button', { name: 'Space 2', exact: true })).toHaveCount(0);
      await mountGenie(page);
      await choice().getByRole('button', { name: 'Space 3', exact: true }).focus();
      await page.keyboard.press('Enter');
      while (await choice().count())
        await choice()
          .getByRole('button', { name: /The Genie/ })
          .first()
          .tap();
      await page.screenshot({
        path: test.info().outputPath('genie-match-phone.png'),
        animations: 'disabled',
        timeout: 30000,
      });
      const state = await page.evaluate(
        () =>
          JSON.parse(
            sessionStorage.getItem('genie-test-state')!,
          ) as import('../../packages/game/src').GameState,
      );
      expect(state.fighters[0].position).toBe('n2');
      expect(state.fighters[1].hp).toBe(7);
      expect(state.fighters[0].statuses).toEqual([]);
      expect(state.turn).toBe(1); // The final action ended the turn and expired the lock.
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

test('selects The Genie over real sockets and restores Infinite Power after reload', async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
        hasTouch: true,
      }),
    ),
  );
  const errors: string[] = [];
  try {
    const pages: Page[] = [];
    for (const [i, context] of contexts.entries()) {
      context.setDefaultTimeout(10000);
      await context.addInitScript(() => {
        new MutationObserver(() =>
          document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
        ).observe(document, { subtree: true, childList: true, attributes: true });
      });
      const page = await context.newPage();
      pages.push(page);
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/');
      await page.getByRole('button', { name: 'New to the table? Create an account' }).click();
      await page
        .getByLabel('Username', { exact: true })
        .fill(`genie_${Date.now().toString(36)}_${i}`);
      await page.getByLabel('Password', { exact: true }).fill('a-secure-genie-test-password');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Find your table' })).toBeVisible();
    }
    const [host, guest] = pages;
    await host.getByRole('button', { name: '2 Head to head', exact: true }).click();
    await expect(host.getByRole('heading', { name: 'Your table is open' })).toBeVisible();
    await guest.getByLabel('Room ID').fill(await host.getByLabel('Room ID').inputValue());
    await guest.getByRole('button', { name: 'Join table', exact: true }).click();
    for (const page of pages) {
      await page.getByRole('button', { name: 'Choose character', exact: true }).click();
      await page.getByRole('button', { name: 'Inspect The Genie', exact: true }).click();
      await page.getByRole('button', { name: 'Choose The Genie', exact: true }).click();
      await page.getByRole('button', { name: 'Ready up', exact: true }).click();
    }
    await host.getByRole('button', { name: 'Start match', exact: true }).click();
    const choice = () => host.getByRole('region', { name: 'Ability choice' });
    await expect(choice()).toContainText('Infinite Power');
    await expect(guest.getByRole('region', { name: 'Ability choice' })).toHaveCount(0);
    await host.reload();
    await expect(choice()).toContainText('Infinite Power');
    await choice().getByRole('button', { name: 'Use ability', exact: true }).click();
    await expect(choice()).toContainText('Discard 1 card');
    await host.setViewportSize({ width: 844, height: 390 });
    await host.reload();
    await expect(choice()).toContainText('Discard 1 card');
    await choice().getByRole('button').first().focus();
    await host.keyboard.press('Enter');
    await expect(host.locator('.action-count')).toContainText('3 actions');
    await expect(host.getByRole('region', { name: 'Your hand' })).toContainText('4 cards');
    await expect(host.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
    await host.screenshot({
      path: test.info().outputPath('genie-socket-phone.png'),
      animations: 'disabled',
      timeout: 30000,
    });
    expect(
      await host.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('explores all twelve Genie illustrations and inspectors on desktop and landscape phone', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    hasTouch: true,
  });
  context.setDefaultTimeout(10000);
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/cards/the-genie/'))
      errors.push(`${r.status()} ${r.url()}`);
  });
  try {
    await page.goto('/');
    const roster = page.getByRole('region', { name: 'Character roster' });
    await roster.getByRole('button', { name: 'Inspect The Genie', exact: true }).click();
    await expect(roster).toContainText('Infinite Power');
    await expect(roster.locator('.roster-detail img')).toHaveJSProperty('complete', true);
    await roster
      .getByRole('button', { name: 'Explore The Genie’s deck · 12 designs', exact: true })
      .click();
    const deck = page.getByRole('dialog', { name: 'The Genie’s deck', exact: true });
    await expect(deck.locator('.deck-gallery > button')).toHaveCount(12);
    for (const card of await deck.locator('.deck-gallery > button').all()) {
      await card.click();
      const detail = page.getByRole('dialog').last();
      await expect(detail.locator('.printed-card')).toBeVisible();
      await expect(detail).not.toContainText('How to play');
      await expect(detail.locator('img')).toHaveJSProperty('complete', true);
      await page.keyboard.press('Escape');
      await expect(card).toBeFocused();
    }
    await page.screenshot({
      path: test.info().outputPath('genie-deck-desktop.png'),
      animations: 'disabled',
      timeout: 30000,
    });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole('button', { name: /^Explore \d+ characters?$/ }).tap();
    const phoneRoster = page.getByRole('dialog').last();
    await phoneRoster.getByRole('button', { name: 'Inspect The Genie', exact: true }).tap();
    await phoneRoster
      .getByRole('button', { name: 'Explore The Genie’s deck · 12 designs', exact: true })
      .tap();
    await page
      .getByRole('dialog', { name: 'The Genie’s deck', exact: true })
      .getByRole('button', { name: 'About Feint, 3 copies', exact: true })
      .tap();
    await expect(page.getByRole('dialog').last()).toContainText('BOOST 1');
    await page.screenshot({
      path: test.info().outputPath('genie-inspector-phone.png'),
      animations: 'disabled',
      timeout: 30000,
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
