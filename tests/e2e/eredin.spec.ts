import { expect, test, type Page } from '@playwright/test';

async function mountEredin(
  page: Page,
  scene: 'sacrifice' | 'faceup' | 'defense' | 'prediction',
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
      const gameUrl = '/src/game/Game.tsx';
      const engineUrl = `/@fs${rootPath}/packages/game/src/index.ts`,
        contentUrl = `/@fs${rootPath}/packages/content/src/index.ts`,
        projectionUrl = `/@fs${rootPath}/apps/server/src/transport/projection.ts`,
        eventsUrl = '/src/animation/events.ts';
      const { Game } = (await import(gameUrl)) as typeof import('../../apps/client/src/game/Game');
      const { createGame, execute, deploymentSpaces } = (await import(
        engineUrl
      )) as typeof import('../../packages/game/src');
      const { basic, deckDefinitions } = (await import(
        contentUrl
      )) as typeof import('../../packages/content/src');
      const { projectGame } = (await import(
        projectionUrl
      )) as typeof import('../../apps/server/src/transport/projection');
      const { presentationEvents } = (await import(
        eventsUrl
      )) as typeof import('../../apps/client/src/animation/events');
      const saved = sessionStorage.getItem('eredin-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['eredin', scene === 'prediction' ? 'sherlock-holmes' : 'bigfoot'].map(
              (character, i) => ({
                id: `p${i}`,
                name: i ? 'Briar' : 'Eredin',
                character,
                deck: deckDefinitions(character).map((definition, j) => ({
                  id: `p${i}-${j}`,
                  definition,
                })),
              }),
            ),
            basic,
            731,
          );
      const apply = (command: import('../../packages/game/src').Command, actor = viewer) => {
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
      const fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
      if (!saved) {
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
        fighter('p0:main').position = 'n0';
        fighter('p1:main').position = 'n1';
        fighter('p1:ally-1').position = 'n20';
        for (let i = 1; i <= 4; i++) fighter(`p0:ally-${i}`).position = `n${14 + i}`;
        state.players[0].hand[0].definition = 'eredin-foul-purpose';
        state.players[0].hand[1].definition = 'eredin-implacable';
        state.players[0].hand[2].definition = 'eredin-portal-defense';
        if (scene === 'sacrifice') {
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
        } else if (scene === 'faceup' || scene === 'prediction') {
          for (const f of state.fighters.filter((f) => f.player === 'p0' && f.role === 'ally')) {
            f.defeated = true;
            f.hp = 0;
          }
          fighter('p1:main').position = 'n22';
          if (viewer === 'p1')
            apply(
              {
                type: 'attack',
                fighter: 'p0:main',
                target: 'p1:main',
                card: state.players[0].hand[0].id,
                faceUp: true,
              },
              'p0',
            );
          if (scene === 'prediction') {
            state.players[1].hand[0].definition = 'sherlock-holmes-elementary';
            apply({ type: 'defend', card: state.players[1].hand[0].id }, 'p1');
          }
        } else {
          fighter('p0:ally-1').position = 'n9';
          state.turn = 1;
          state.players[1].hand[0].definition = 'bigfoot-savagery';
          apply(
            {
              type: 'attack',
              fighter: 'p1:main',
              target: 'p0:main',
              card: state.players[1].hand[0].id,
            },
            'p1',
          );
          apply({ type: 'defend', card: state.players[0].hand[2].id }, 'p0');
        }
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      let game = projectGame(state, viewer, false),
        events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
      const render = () => {
        sessionStorage.setItem('eredin-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'eredin-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: viewer, name: viewer === 'p0' ? 'Eredin' : 'Briar' },
            events,
            reset: 0,
            connected: true,
            onLeave: () => {},
            onCommand: (command: import('../../packages/game/src').Command) => {
              const prev = game,
                outcomes = apply(command);
              game = projectGame(state, viewer, false);
              events = [...events, ...presentationEvents(prev, game, outcomes)];
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
async function state(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('eredin-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
  await page.addInitScript(() => {
    new MutationObserver(() =>
      document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
    ).observe(document, { subtree: true, childList: true, attributes: true });
  });
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Eredin restores private sacrifice and ally selection across reload (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mountEredin(page, 'sacrifice');
    await expect(page.getByRole('button', { name: 'Use Foul Purpose', exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('sacrifice-desktop.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mountEredin(page, 'sacrifice');
    await page.getByRole('button', { name: 'Use Foul Purpose', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.hand-panel')).toContainText('Choose a fighter');
    await page.reload();
    await mountEredin(page, 'sacrifice');
    await page.getByRole('button', { name: 'Red Rider 2 · Eredin', exact: true }).click();
    await expect
      .poll(async () => (await state(page)).fighters.find((f) => f.id === 'p0:ally-2')?.defeated)
      .toBe(true);
    expect((await state(page)).players[0].hand.some((c) => c.id === 'p0-0')).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
    await page.screenshot({
      path: test.info().outputPath('sacrifice-phone.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });
}
test('Eredin declares a distant face-up attack while the defender can inspect and defend on phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await mountEredin(page, 'faceup');
  await page.getByRole('button', { name: 'Prepare attack · Foul Purpose', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Play face-up · target any space', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Target Bigfoot (Briar)', exact: true }).click();
  await expect.poll(async () => (await state(page)).phase.type).toBe('awaiting-defense');
  await page.reload();
  await mountEredin(page, 'faceup', 'p1');
  await page
    .getByRole('button', { name: 'Inspect face-up attack · Foul Purpose', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Foul Purpose', exact: true })).toContainText(
    'Foul Purpose',
  );
  await page.screenshot({
    path: test.info().outputPath('face-up-inspector-phone.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Take the hit', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Take the hit', exact: true }).click();
  await expect.poll(async () => (await state(page)).revealed?.damage).toBe(4);
});
test('Portal Defense restores an adjacent numbered Rider choice and transfers the defense', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountEredin(page, 'defense');
  await page.reload();
  await mountEredin(page, 'defense');
  await page.getByRole('button', { name: 'Red Rider 1 · Eredin', exact: true }).click();
  await expect.poll(async () => (await state(page)).revealed?.defender).toBe('p0:ally-1');
  expect((await state(page)).fighters.find((f) => f.id === 'p0:main')?.position).toBe('n9');
});

test('Eredin and Holmes retain both face-up inspectors during a private prediction after reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await mountEredin(page, 'prediction', 'p1');
  await page.reload();
  await mountEredin(page, 'prediction', 'p1');
  await expect(page.locator('.hand-panel')).toContainText('Predict the printed attack value');
  for (const name of ['Foul Purpose', 'Elementary']) {
    await page
      .getByRole('button', { name: `Inspect revealed card · ${name}`, exact: true })
      .click();
    const inspector = page.getByRole('dialog', { name, exact: true });
    await expect(inspector).toBeVisible();
    await expect(inspector.locator('.dialog-heading h2')).toBeVisible();
    await expect(inspector.locator('img[data-raster]')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.screenshot({
    path: test.info().outputPath('public-cards-private-prediction-phone.png'),
    animations: 'disabled',
  });
});
