import { expect, test, type Page } from '@playwright/test';

async function mount(page: Page, scene: 'summon' | 'sly' | 'eyes') {
  await page.goto('/');
  await page.evaluate(
    async ({ rootPath, scene }) => {
      const resource = (name: string) =>
        performance
          .getEntriesByType('resource')
          .find((e) => new URL(e.name).pathname.endsWith(`/deps/${name}.js`))!.name;
      const { createElement } = (await import(resource('react'))).default;
      const { createRoot } = (await import(resource('react-dom_client'))).default;
      const gameUrl = '/src/game/Game.tsx',
        engineUrl = `/@fs${rootPath}/packages/game/src/index.ts`,
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
      const saved = sessionStorage.getItem('wukong-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['sun-wukong', 'bigfoot'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Sun Wukong',
              character,
              deck: deckDefinitions(character).map((definition, j) => ({
                id: `p${i}-${j}`,
                definition,
              })),
            })),
            basic,
            731,
          );
      const apply = (command: import('../../packages/game/src').Command, actor = 'p0') => {
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
        state.fighters.find((f) => f.id === 'p0:main')!.position = 'n0';
        state.fighters.find((f) => f.id === 'p1:main')!.position = 'n1';
        state.fighters.find((f) => f.id === 'p1:ally-1')!.position = 'n20';
        if (scene !== 'summon') {
          const c = state.resolution.choice!;
          apply({ type: 'choose', choice: c.id, options: ['skip'] });
          state.players[0].hand[0].definition = `sun-wukong-${scene === 'sly' ? 'sly-monkey' : 'fiery-eyes-that-see'}`;
          if (scene === 'sly') {
            apply({
              type: 'attack',
              fighter: 'p0:main',
              target: 'p1:main',
              card: state.players[0].hand[0].id,
            });
            apply({ type: 'defend', card: null }, 'p1');
          } else
            apply({ type: 'play-action', fighter: 'p0:main', card: state.players[0].hand[0].id });
        }
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      let game = projectGame(state, 'p0', false),
        events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
      const render = () => {
        sessionStorage.setItem('wukong-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: { id: 'wukong-test', host: 'p0', capacity: 2, seats: [], game },
            user: { id: 'p0', name: 'Sun Wukong' },
            events,
            reset: 0,
            connected: true,
            onLeave: () => {},
            onCommand: (command: import('../../packages/game/src').Command) => {
              const prev = game,
                outcomes = apply(command);
              game = projectGame(state, 'p0', false);
              events = [...events, ...presentationEvents(prev, game, outcomes)];
              render();
            },
          }),
        );
      };
      render();
    },
    { rootPath: process.cwd(), scene },
  );
  await expect(page.locator('main.game-layout')).toBeVisible();
}
async function state(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('wukong-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
async function chooseFirst(page: Page) {
  const current = await state(page),
    c = current.resolution.choice!;
  const button =
    c.options[0].object?.type === 'space'
      ? page.locator('button.node-hit').first()
      : page.locator('.ability-options button').first();
  await expect(button).toBeVisible();
  await button.focus();
  await page.keyboard.press('Enter');
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: null }));
  await page.addInitScript(() =>
    new MutationObserver(() =>
      document.querySelector<HTMLButtonElement>('.event-acknowledgement button')?.click(),
    ).observe(document, { subtree: true, childList: true, attributes: true }),
  );
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Sun Wukong summons and restores private placement on phone (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page, 'summon');
    await page.getByRole('button', { name: 'Usa Evocazione dei Cloni', exact: true }).focus();
    await page.keyboard.press('Enter');
    await chooseFirst(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mount(page, 'summon');
    await page.screenshot({
      path: test.info().outputPath('summon-phone-choice.png'),
      animations: 'disabled',
    });
    await chooseFirst(page);
    await expect
      .poll(
        async () =>
          (await state(page)).fighters.filter((f) => f.player === 'p0' && !f.defeated).length,
      )
      .toBe(2);
    expect((await state(page)).fighters.find((f) => f.id === 'p0:main')!.hp).toBe(16);
    await expect(
      page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await page.screenshot({
      path: test.info().outputPath('summoned-phone.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });
}
test('Sly Monkey places Wukong and leaves a numbered Clone in his old space', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount(page, 'sly');
  await chooseFirst(page);
  await page.reload();
  await mount(page, 'sly');
  await chooseFirst(page);
  const s = await state(page);
  expect(s.fighters.find((f) => f.id === 'p0:ally-1')!.position).toBe('n0');
  expect(s.fighters.find((f) => f.id === 'p0:main')!.position).not.toBe('n0');
  await expect(
    page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await page.screenshot({
    path: test.info().outputPath('sly-desktop.png'),
    animations: 'disabled',
  });
});
test('Fiery Eyes restores private opposing-hand selection through JSON reconnect', async ({
  page,
}) => {
  await mount(page, 'eyes');
  await chooseFirst(page);
  const c = (await state(page)).resolution.choice!,
    card = c.options[0].card!;
  await page.reload();
  await mount(page, 'eyes');
  await chooseFirst(page);
  expect((await state(page)).players[1].deck.at(-1)).toEqual(card);
  await page.screenshot({ path: test.info().outputPath('fiery-eyes.png'), animations: 'disabled' });
});
