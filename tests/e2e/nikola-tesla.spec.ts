import { expect, test, type Page } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src';

async function mount(page: Page, viewer = 'p0') {
  await page.goto('/');
  await page.evaluate(
    async ({ rootPath, viewer }) => {
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
      const saved = sessionStorage.getItem('tesla-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['nikola-tesla', 'nikola-tesla'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Tesla',
              character,
              deck: deckDefinitions(character).map((definition, j) => ({
                id: `p${i}-${j}`,
                definition,
              })),
            })),
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
      };
      if (!saved) {
        state.fighters[0].position = 'n0';
        state.fighters[1].position = 'n1';
        state.fighters[0].counters.coils = 2;
        state.players[0].hand[0].definition = 'nikola-tesla-x-ray-radiation';
        state.players[1].deck[0].definition = 'nikola-tesla-death-ray';
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
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      const render = () => {
        sessionStorage.setItem('tesla-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: {
              id: 'tesla-test',
              host: 'p0',
              capacity: 2,
              seats: [],
              game: projectGame(state, viewer, false),
            },
            user: { id: viewer, name: viewer === 'p0' ? 'Tesla' : 'Briar' },
            events: [],
            reset: 0,
            connected: true,
            onLeave: () => {},
            onCommand: (command: import('../../packages/game/src').Command) => {
              apply(command);
              render();
            },
          }),
        );
      };
      render();
    },
    { rootPath: process.cwd(), viewer },
  );
  await expect(page.locator('main.game-layout')).toBeVisible();
  await page.evaluate(async () => {
    const assetsUrl = '/src/artwork/assets.ts',
      texturesUrl = '/src/artwork/textures.ts';
    const { rasterAssets } = (await import(
      assetsUrl
    )) as typeof import('../../apps/client/src/artwork/assets');
    const { loadFigureTexture } = (await import(
      texturesUrl
    )) as typeof import('../../apps/client/src/artwork/textures');
    await loadFigureTexture(rasterAssets['nikola-tesla-token'].url);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
async function saved(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('tesla-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Tesla retains a public X-Ray reveal and private coil decision across desktop/phone reconnect (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page);
    await expect(page.getByRole('button', { name: 'Scarica 2 bobine', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Esamina carta rivelata · Raggio della morte',
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('tesla-xray-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mount(page, 'p1');
    await expect(page.getByRole('button', { name: 'Scarica 2 bobine', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('region', { name: 'Carte rivelate', exact: true })).toBeVisible();
    await page.reload();
    await mount(page);
    await page.getByRole('button', { name: 'Scarica 2 bobine', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await saved(page)).resolution.choice).toBeNull();
    expect((await saved(page)).revealed?.damage).toBe(8);
    expect((await saved(page)).fighters[0].counters.coils).toBe(0);
    await page.screenshot({ path: test.info().outputPath('tesla-xray-phone.png') });
    expect(errors).toEqual([]);
  });
}

test('Tesla shares one transparent figure texture across all four owner colors', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests = new Set<string>();
  page.on('request', (request) => {
    if (/nikola-tesla-token-/.test(request.url())) requests.add(request.url());
  });
  const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
    id,
    name: `Tesla ${i + 1}`,
    character: 'nikola-tesla',
    handCount: 0,
    deckCount: 10,
    discard: [],
    eliminated: false,
  }));
  const fighters: GameView['fighters'] = players.map((p, i) => ({
    id: `${p.id}:main`,
    player: p.id,
    character: 'nikola-tesla',
    definition: 'nikola-tesla',
    role: 'main',
    hp: 14,
    position: ['n0', 'n7', 'n13', 'n20'][i],
    defeated: false,
    counters: { coils: i % 3 },
    statuses: [],
  }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await presentationHarness(page, true, { players, fighters });
  await page.evaluate(async () => {
    const a = '/src/artwork/assets.ts',
      t = '/src/artwork/textures.ts';
    const { rasterAssets } = (await import(
      a
    )) as typeof import('../../apps/client/src/artwork/assets');
    const { loadFigureTexture } = (await import(
      t
    )) as typeof import('../../apps/client/src/artwork/textures');
    await loadFigureTexture(rasterAssets['nikola-tesla-token'].url);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.screenshot({ path: test.info().outputPath('tesla-four-colors-desktop.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: test.info().outputPath('tesla-four-colors-phone.png') });
  expect(requests.size).toBe(1);
});
