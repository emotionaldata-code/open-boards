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
      const saved = sessionStorage.getItem('beowulf-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['beowulf', 'bigfoot'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Beowulf',
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
        f('p0:ally-1').position = 'n20';
        f('p1:ally-1').position = 'n22';
        f('p0:main').counters.rage = 3;
        f('p0:main').hp = 10;
        state.players[0].hand[0].definition = 'beowulf-golden-drinking-horn';
        apply({ type: 'play-action', fighter: 'p0:main', card: state.players[0].hand[0].id });
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      const render = () => {
        sessionStorage.setItem('beowulf-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: {
              id: 'beowulf-test',
              host: 'p0',
              capacity: 2,
              seats: [],
              game: projectGame(state, 'p0', false),
            },
            user: { id: 'p0', name: 'Beowulf' },
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
    await Promise.all(
      ['beowulf-token', 'wiglaf-token'].map((id) => loadFigureTexture(rasterAssets[id].url)),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
async function state(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('beowulf-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Beowulf selects distinct Horn effects across desktop/phone reconnect (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page);
    await page.getByRole('button', { name: 'Spendi 2 Furia', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Beowulf recupera 2 salute', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('beowulf-horn-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mount(page);
    await page.getByRole('button', { name: 'Beowulf recupera 2 salute', exact: true }).click();
    await page.getByRole('button', { name: 'Pesca 2 carte', exact: true }).click();
    await page.getByRole('button', { name: 'Conferma scelta · 2 / 2', exact: true }).click();
    await expect.poll(async () => (await state(page)).resolution.choice).toBeNull();
    const final = await state(page);
    expect(final.fighters.find((f) => f.id === 'p0:main')!.hp).toBe(12);
    expect(final.fighters.find((f) => f.id === 'p0:main')!.counters.rage).toBe(1);
    expect(final.players[0].hand).toHaveLength(6);
    await page.screenshot({ path: test.info().outputPath('beowulf-horn-phone.png') });
    expect(errors).toEqual([]);
  });
  test(`Beowulf and Wiglaf share two textures across four owner colors (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const textures = new Set<string>(),
      errors: string[] = [];
    page.on('request', (r) => {
      if (/\/(beowulf|wiglaf)-token-/.test(r.url())) textures.add(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Geat ${i + 1}`,
      character: 'beowulf',
      handCount: 0,
      deckCount: 10,
      discard: [],
      eliminated: false,
    }));
    const fighters: GameView['fighters'] = players.flatMap((p, i) => [
      {
        id: `${p.id}:main`,
        player: p.id,
        character: 'beowulf',
        definition: 'beowulf',
        role: 'main',
        hp: 17,
        position: ['n0', 'n7', 'n13', 'n20'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
      {
        id: `${p.id}:ally-1`,
        player: p.id,
        character: 'beowulf',
        definition: 'beowulf-wiglaf',
        role: 'ally',
        hp: 9,
        position: ['n1', 'n8', 'n14', 'n21'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
    ]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await presentationHarness(page, true, { players, fighters });
    await expect.poll(() => textures.size).toBe(2);
    await readyFigures(page);
    await page.screenshot({ path: test.info().outputPath('beowulf-four-colors-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: test.info().outputPath('beowulf-four-colors-phone.png') });
    expect(errors).toEqual([]);
  });
}
