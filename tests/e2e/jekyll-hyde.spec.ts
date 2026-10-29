import { expect, test, type Page } from '@playwright/test';
import { contentText } from '../../apps/client/src/localization/text';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src';

async function mount(page: Page, viewer = 'p0', scene: 'serum' | 'research' = 'serum') {
  await page.goto('/');
  await page.evaluate(
    async ({ rootPath, viewer, scene }) => {
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
      const saved = sessionStorage.getItem('jekyll-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['jekyll-hyde', 'bigfoot'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Jekyll',
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
        f('p1:ally-1').position = 'n22';
        state.players[0].hand[0].definition = 'jekyll-hyde-pure-evil';
        state.players[0].hand[1].definition = 'jekyll-hyde-calming-research';
        state.players[0].hand[2].definition = 'jekyll-hyde-forever-hyde';
        if (scene === 'research') {
          apply({ type: 'choose', choice: state.resolution.choice!.id, options: ['skip'] }, 'p0');
          state.players[0].hand[0].definition = 'jekyll-hyde-calming-research';
          apply(
            { type: 'play-action', fighter: 'p0:main', card: state.players[0].hand[0].id },
            'p0',
          );
        }
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      const render = () => {
        sessionStorage.setItem('jekyll-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: {
              id: 'jekyll-test',
              host: 'p0',
              capacity: 2,
              seats: [],
              game: projectGame(state, viewer, false),
            },
            user: { id: viewer, name: viewer === 'p0' ? 'Jekyll' : 'Briar' },
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
    { rootPath: process.cwd(), viewer, scene },
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
    await Promise.all(['jekyll-hyde-token'].map((id) => loadFigureTexture(rasterAssets[id].url)));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
async function saved(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('jekyll-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Jekyll changes form across desktop/phone reconnect and Hyde pays once after Stay (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page);
    await page.getByRole('button', { name: 'Usa Il siero', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Sig. Hyde', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('jekyll-serum-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mount(page, 'p1');
    await expect(page.getByRole('button', { name: 'Sig. Hyde', exact: true })).toHaveCount(0);
    await page.reload();
    await mount(page);
    await page.getByRole('button', { name: 'Sig. Hyde', exact: true }).click();
    await expect.poll(async () => (await saved(page)).fighters[0].statuses[0].id).toBe('hyde-form');
    await expect(page.getByRole('button', { name: 'Gioca Male puro', exact: true })).toBeEnabled();
    await expect(
      page.getByRole('button', {
        name: 'Esamina Ricerca rasserenante · non disponibile ora',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Esamina Ricerca rasserenante · non disponibile ora',
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog').last().locator('.card-fighter')).toHaveText(
      'Dott. Jekyll',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).click();
    await expect.poll(async () => (await saved(page)).fighters[0].hp).toBe(15);
    await page.screenshot({ path: test.info().outputPath('hyde-stay-phone.png') });
    expect(errors).toEqual([]);
  });
}
test('Jekyll privately keeps only drawn research cards and bottom-orders the rest after reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await mount(page, 'p0', 'research');
  await page.getByRole('combobox', { name: 'Valore', exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Conferma valore', exact: true }).click();
  const state = await saved(page),
    choice = state.resolution.choice!,
    first = choice.options[0];
  await page.screenshot({ path: test.info().outputPath('jekyll-research-phone.png') });
  await page.reload();
  await mount(page, 'p1', 'research');
  await expect(page.getByText('Tieni 1 carta appena pescata', { exact: true })).toHaveCount(0);
  await page.reload();
  await mount(page, 'p0', 'research');
  await page
    .getByRole('button', { name: contentText(first.label), exact: true })
    .first()
    .click();
  const order = (await saved(page)).resolution.choice!.options[0];
  await page
    .getByRole('button', { name: contentText(order.label), exact: true })
    .first()
    .click();
  await expect.poll(async () => (await saved(page)).resolution.choice).toBeNull();
  expect((await saved(page)).players[0].hand.some((c) => c.id === first.id)).toBe(true);
});

test('Jekyll and Hyde share a transparent figure across all four owner colors', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests = new Set<string>();
  page.on('request', (r) => {
    if (/jekyll-hyde-token-/.test(r.url())) requests.add(r.url());
  });
  const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
    id,
    name: `Jekyll ${i + 1}`,
    character: 'jekyll-hyde',
    handCount: 0,
    deckCount: 10,
    discard: [],
    eliminated: false,
  }));
  const fighters: GameView['fighters'] = players.map((p, i) => ({
    id: `${p.id}:main`,
    player: p.id,
    character: 'jekyll-hyde',
    definition: 'jekyll-hyde',
    role: 'main',
    hp: 16,
    position: ['n0', 'n7', 'n13', 'n20'][i],
    defeated: false,
    counters: {},
    statuses: [{ id: i % 2 ? 'hyde-form' : 'jekyll-form', stacks: 1 }],
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
    await loadFigureTexture(rasterAssets['jekyll-hyde-token'].url);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.screenshot({ path: test.info().outputPath('jekyll-four-colors-desktop.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: test.info().outputPath('jekyll-four-colors-phone.png') });
  expect(requests.size).toBe(1);
});
