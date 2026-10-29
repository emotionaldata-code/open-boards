import { expect, test, type Page } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src';

async function mount(page: Page, scene: 'path' | 'hands' | 'defense') {
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
      const saved = sessionStorage.getItem('little-red-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['little-red', 'bigfoot'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Red',
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
        if (scene === 'path') {
          state.players[0].hand[0].definition = 'little-red-never-leave-the-path';
          apply({ type: 'play-action', fighter: 'p0:main', card: state.players[0].hand[0].id });
        } else if (scene === 'hands') {
          state.players[0].discard.push({
            id: 'prior-basket',
            definition: 'little-red-once-upon-a-time',
          });
          state.players[0].hand[0].definition = 'little-red-what-large-hands-you-have';
          apply({
            type: 'attack',
            fighter: 'p0:main',
            card: state.players[0].hand[0].id,
            target: 'p1:main',
          });
          apply({ type: 'defend', card: null }, 'p1');
        } else {
          state.players[0].discard.push({
            id: 'prior-basket',
            definition: 'little-red-the-wolf-s-skin',
          });
          state.players[0].hand[0].definition = 'little-red-what-big-ears-you-have';
          state.players[1].hand[0].definition = 'bigfoot-larger-than-life';
          state.turn = 1;
          apply(
            {
              type: 'attack',
              fighter: 'p1:main',
              card: state.players[1].hand[0].id,
              target: 'p0:main',
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
      const render = () => {
        sessionStorage.setItem('little-red-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: {
              id: 'little-red-test',
              host: 'p0',
              capacity: 2,
              seats: [],
              game: projectGame(state, 'p0', false),
            },
            user: { id: 'p0', name: 'Red' },
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
    { rootPath: process.cwd(), scene },
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
      ['little-red-token', 'little-red-huntsman-token'].map((id) =>
        loadFigureTexture(rasterAssets[id].url),
      ),
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
        sessionStorage.getItem('little-red-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Little Red wild basket chooses one effect across desktop/phone reconnect (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page, 'path');
    await page.screenshot({ path: test.info().outputPath('little-red-wild-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mount(page, 'path');
    await page.getByRole('button', { name: 'Aconito: pesca 3 carte', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await state(page)).resolution.choice).toBeNull();
    expect((await state(page)).players[0].hand).toHaveLength(7);
    expect((await state(page)).actions).toBe(1);
    await page.screenshot({ path: test.info().outputPath('little-red-wild-phone.png') });
    expect(errors).toEqual([]);
  });
  test(`Little Red top-discard recovery restores exact private choice (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 844, height: 390 });
    await mount(page, 'hands');
    await page
      .getByRole('button', { name: 'Riprendi la carta in cima agli scarti', exact: true })
      .click();
    await page.reload();
    await mount(page, 'hands');
    await page.getByRole('button', { name: 'C’era una volta 🌹', exact: true }).click();
    await expect.poll(async () => (await state(page)).resolution.choice).toBeNull();
    expect((await state(page)).players[0].hand.some((c) => c.id === 'prior-basket')).toBe(true);
  });
  test(`Little Red Big Ears is offered as a conditional defense (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 844, height: 390 });
    await mount(page, 'defense');
    await page
      .getByRole('button', { name: 'Difendi con Che orecchie grandi che hai 🐺', exact: true })
      .click();
    await expect.poll(async () => (await state(page)).phase.type).toBe('taking-actions');
    expect((await state(page)).revealed?.defense?.definition).toBe(
      'little-red-what-big-ears-you-have',
    );
  });
  test(`Little Red and Huntsman share two textures across four owner colors (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const textures = new Set<string>(),
      errors: string[] = [];
    page.on('request', (r) => {
      if (/\/little-red-(huntsman-)?token-/.test(r.url())) textures.add(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Storyteller ${i + 1}`,
      character: 'little-red',
      handCount: 0,
      deckCount: 10,
      discard: [],
      eliminated: false,
    }));
    const fighters: GameView['fighters'] = players.flatMap((p, i) => [
      {
        id: `${p.id}:main`,
        player: p.id,
        character: 'little-red',
        definition: 'little-red',
        role: 'main',
        hp: 14,
        position: ['n0', 'n7', 'n13', 'n20'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
      {
        id: `${p.id}:ally-1`,
        player: p.id,
        character: 'little-red',
        definition: 'little-red-huntsman',
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
    await page.screenshot({ path: test.info().outputPath('little-red-four-colors-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: test.info().outputPath('little-red-four-colors-phone.png') });
    expect(errors).toEqual([]);
  });
}
