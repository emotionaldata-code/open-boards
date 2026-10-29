import { expect, test, type Page } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src';

async function mount(page: Page) {
  await page.goto('/');
  await page.evaluate(
    async ({ rootPath }) => {
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
      const { createGame, execute, deploymentSpaces } = (await import(
        engineUrl
      )) as typeof import('../../packages/game/src');
      const { basic, deckDefinitions } = (await import(
        contentUrl
      )) as typeof import('../../packages/content/src');
      const { projectGame } = (await import(
        projectionUrl
      )) as typeof import('../../apps/server/src/transport/projection');
      const saved = sessionStorage.getItem('bloody-mary-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['bloody-mary', 'bloody-mary'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Bloody Mary',
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
        const r = execute(
          state,
          actor,
          { id: `lr-${state.revision}`, revision: state.revision, command },
          basic,
        );
        if (!r.ok) throw new Error(r.message);
        state = r.state;
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
        const f = (id: string) => state.fighters.find((f) => f.id === id)!;
        f('p0:main').position = 'n0';
        f('p1:main').position = 'n1';
        state.players[0].hand[0].definition = 'bloody-mary-broken-glass';
        state.players[1].hand[0].definition = 'bloody-mary-mirror-image';
        apply({
          type: 'attack',
          fighter: 'p0:main',
          target: 'p1:main',
          card: state.players[0].hand[0].id,
        });
        apply({ type: 'defend', card: state.players[1].hand[0].id }, 'p1');
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      const render = () => {
        sessionStorage.setItem('bloody-mary-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: {
              id: 'bloody-mary-test',
              host: 'p0',
              capacity: 2,
              seats: [],
              game: projectGame(state, 'p0', false),
            },
            user: { id: 'p0', name: 'Bloody Mary' },
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
    { rootPath: process.cwd() },
  );
  await expect(page.locator('main.game-layout')).toBeVisible();
  await readyFigures(page);
}
async function readyFigures(page: Page) {
  await page.evaluate(async () => {
    const assetUrl = '/src/artwork/assets.ts',
      textureUrl = '/src/artwork/textures.ts';
    const { rasterAssets } = (await import(
      assetUrl
    )) as typeof import('../../apps/client/src/artwork/assets');
    const { loadFigureTexture } = (await import(
      textureUrl
    )) as typeof import('../../apps/client/src/artwork/textures');
    await Promise.all(['bloody-mary-token'].map((id) => loadFigureTexture(rasterAssets[id].url)));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
async function state(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('bloody-mary-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Bloody Mary adjusts Broken Glass across desktop/phone reconnect (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page);
    await expect(page.getByRole('button', { name: 'Aumenta di 1', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('bloody-mary-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mount(page);
    await page.getByRole('button', { name: 'Mantieni il valore', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await state(page)).resolution.choice).toBeNull();
    expect((await state(page)).fighters.find((f) => f.id === 'p1:main')!.hp).toBe(14);
    await page.screenshot({ path: test.info().outputPath('bloody-mary-phone.png') });
    expect(errors).toEqual([]);
  });
  test(`Bloody Mary shares one transparent texture across all four owner colors (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const textures = new Set<string>(),
      errors: string[] = [];
    page.on('request', (r) => {
      if (/\/bloody-mary-token-/.test(r.url())) textures.add(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Mirror ${i + 1}`,
      character: 'bloody-mary',
      handCount: 0,
      deckCount: 10,
      discard: [],
      eliminated: false,
    }));
    const fighters: GameView['fighters'] = players.map((p, i) => ({
      id: `${p.id}:main`,
      player: p.id,
      character: 'bloody-mary',
      definition: 'bloody-mary',
      role: 'main',
      hp: 16,
      position: ['n0', 'n7', 'n13', 'n20'][i],
      defeated: false,
      counters: {},
      statuses: [],
    }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await presentationHarness(page, true, { players, fighters });
    await expect.poll(() => textures.size).toBe(1);
    await readyFigures(page);
    await page.screenshot({ path: test.info().outputPath('bloody-mary-four-colors-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: test.info().outputPath('bloody-mary-four-colors-phone.png') });
    expect(errors).toEqual([]);
  });
}
