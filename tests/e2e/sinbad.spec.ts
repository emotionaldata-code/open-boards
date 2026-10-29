import { expect, test, type Page } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src';
import { contentText } from '../../apps/client/src/localization/text';

async function mount(page: Page, scene: 'home' | 'leap' | 'snakes', viewer = 'p0') {
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
      const saved = sessionStorage.getItem('sinbad-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['sinbad', 'bigfoot'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Sinbad',
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
      const fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
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
        fighter('p0:main').position = 'n0';
        fighter('p1:main').position = 'n1';
        fighter('p0:ally-1').position = 'n20';
        fighter('p1:ally-1').position = 'n22';
        const voyages = Object.values(basic.cards).filter(
          (c) => c.tags?.includes('voyage') && c.id !== 'sinbad-voyage-home',
        );
        state.players[0].discard.push(
          ...voyages.map((c, i) => ({ id: `prior-${i}`, definition: c.id })),
        );
        state.players[0].hand[0].definition =
          scene === 'home'
            ? 'sinbad-voyage-home'
            : scene === 'leap'
              ? 'sinbad-leap-away'
              : 'sinbad-voyage-to-the-valley-of-the-giant-snakes';
        if (scene !== 'home') {
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
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      const render = () => {
        sessionStorage.setItem('sinbad-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: {
              id: 'sinbad-test',
              host: 'p0',
              capacity: 2,
              seats: [],
              game: projectGame(state, viewer, false),
            },
            user: { id: viewer, name: viewer === 'p0' ? 'Sinbad' : 'Briar' },
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
    { rootPath: process.cwd(), scene, viewer },
  );
  await expect(page.locator('main.game-layout')).toBeVisible();
  await readyFigures(page);
}
async function readyFigures(page: Page) {
  await page.evaluate(async () => {
    const assetsUrl = '/src/artwork/assets.ts',
      texturesUrl = '/src/artwork/textures.ts';
    const { rasterAssets } = (await import(
      assetsUrl
    )) as typeof import('../../apps/client/src/artwork/assets');
    const { loadFigureTexture } = (await import(
      texturesUrl
    )) as typeof import('../../apps/client/src/artwork/textures');
    await Promise.all(
      ['sinbad-token', 'sinbad-porter-token'].map((id) => loadFigureTexture(rasterAssets[id].url)),
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
        sessionStorage.getItem('sinbad-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Sinbad restores Voyage Home attack and both shared movement allowances (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page, 'home');
    await page.screenshot({ path: test.info().outputPath('sinbad-home-desktop.png') });
    await page
      .getByRole('button', { name: 'Prepara attacco · Viaggio verso casa', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Bersaglio Bigfoot (Briar)', exact: true }).click();
    await expect.poll(async () => (await state(page)).phase.type).toBe('awaiting-defense');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mount(page, 'home', 'p1');
    await page.getByRole('button', { name: 'Subisci il colpo', exact: true }).click();
    await expect.poll(async () => (await state(page)).revealed?.damage).toBe(8);
    expect(
      (await state(page)).players[0].hand.filter((c) => c.id.startsWith('prior-')),
    ).toHaveLength(6);
    await page.reload();
    await mount(page, 'home');
    await page.screenshot({ path: test.info().outputPath('sinbad-home-phone.png') });
    expect(
      (await state(page)).players[0].discard.filter((c) => c.definition.includes('voyage-')),
    ).toHaveLength(1);
    expect(errors).toEqual([]);
  });
  test(`Sinbad restores Leap Away choice and the exact movement recipient (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 844, height: 390 });
    await mount(page, 'leap');
    await page.getByRole('button', { name: 'Scegli Sinbad · Sinbad', exact: true }).click();
    await page.reload();
    await mount(page, 'leap');
    await page.getByRole('button', { name: 'Resta fermo', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await state(page)).resolution.choice).toBeNull();
    expect((await state(page)).fighters.find((f) => f.id === 'p0:ally-1')?.position).toBe('n20');
  });
  test(`Sinbad and Porter share two textures across four owner colors (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const textures = new Set<string>(),
      errors: string[] = [];
    page.on('request', (r) => {
      if (/\/sinbad-(porter-)?token-/.test(r.url())) textures.add(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Sailor ${i + 1}`,
      character: 'sinbad',
      handCount: 0,
      deckCount: 10,
      discard: [],
      eliminated: false,
    }));
    const fighters: GameView['fighters'] = players.flatMap((p, i) => [
      {
        id: `${p.id}:main`,
        player: p.id,
        character: 'sinbad',
        definition: 'sinbad',
        role: 'main',
        hp: 15,
        position: ['n0', 'n7', 'n13', 'n20'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
      {
        id: `${p.id}:ally-1`,
        player: p.id,
        character: 'sinbad',
        definition: 'sinbad-porter',
        role: 'ally',
        hp: 6,
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
    await page.screenshot({ path: test.info().outputPath('sinbad-four-colors-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: test.info().outputPath('sinbad-four-colors-phone.png') });
    expect(errors).toEqual([]);
  });
}
test('Sinbad keeps Snakes hand inspection private across desktop and phone reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount(page, 'snakes');
  const snapshot = await state(page);
  expect(snapshot.resolution.choice?.player).toBe('p0');
  await page.reload();
  await mount(page, 'snakes', 'p1');
  expect(await page.locator('.ability-choice').count()).toBe(0);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await mount(page, 'snakes');
  const choice = (await state(page)).resolution.choice!;
  const option = choice.options[0];
  await page
    .getByRole('button', { name: contentText(option.label), exact: true })
    .first()
    .click();
  await expect.poll(async () => (await state(page)).resolution.choice).toBeNull();
});
