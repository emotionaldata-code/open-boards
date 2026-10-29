import { contentText } from '../../apps/client/src/localization/text';
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
      const { createGame, execute, deploymentSpaces } = (await import(
        engineUrl
      )) as typeof import('../../packages/game/src');
      const { basic, deckDefinitions } = (await import(
        contentUrl
      )) as typeof import('../../packages/content/src');
      const { projectGame } = (await import(
        projectionUrl
      )) as typeof import('../../apps/server/src/transport/projection');
      const saved = sessionStorage.getItem('houdini-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['harry-houdini', 'harry-houdini'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Houdini',
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
        state.fighters.find((f) => f.id === 'p0:main')!.position = 'n0';
        state.fighters.find((f) => f.id === 'p1:main')!.position = 'n1';
        state.fighters.find((f) => f.id === 'p0:ally-1')!.position = 'n5';
        state.fighters.find((f) => f.id === 'p1:ally-1')!.position = 'n15';
        state.players[0].hand[0].definition = 'harry-houdini-the-big-reveal';
        state.players[0].hand[1].definition = 'harry-houdini-flourish';
        state.players[0].hand[2].definition = 'harry-houdini-sleight-of-hand';
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
        sessionStorage.setItem('houdini-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: {
              id: 'houdini-test',
              host: 'p0',
              capacity: 2,
              seats: [],
              game: projectGame(state, viewer, false),
            },
            user: { id: viewer, name: viewer === 'p0' ? 'Houdini' : 'Briar' },
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
    await loadFigureTexture(rasterAssets['harry-houdini-token'].url);
    await loadFigureTexture(rasterAssets['harry-houdini-bess-token'].url);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
async function saved(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('houdini-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Houdini retains simultaneous BOOST payments and exact recovery across desktop/phone reconnect (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page);
    await expect(
      page.getByRole('button', { name: 'BOOST with 2 cards', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('houdini-desktop.png') });
    await page.getByRole('button', { name: 'BOOST with 2 cards', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await saved(page)).resolution.choice?.min).toBe(2);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mount(page, 'p1');
    await expect(page.getByRole('button', { name: /BOOST \+/ })).toHaveCount(0);
    await page.reload();
    await mount(page);
    const c = (await saved(page)).resolution.choice!;
    const selected = c.options.slice(0, 2).map((o) => o.id);
    for (const option of c.options.slice(0, 2))
      await page
        .getByRole('button', {
          name: option.card
            ? option.label.replace(
                option.label.split(' · ')[0],
                contentText(option.label.split(' · ')[0])!,
              )
            : option.label,
          exact: true,
        })
        .click();
    await page.getByRole('button', { name: /Conferma/ }).click();
    await expect.poll(async () => (await saved(page)).resolution.choice?.options.length).toBe(2);
    const recovery = (await saved(page)).resolution.choice!;
    expect(recovery.options.map((o) => o.id).sort()).toEqual([...selected].sort());
    await page
      .getByRole('button', { name: contentText(recovery.options[0].label), exact: true })
      .click();
    await expect.poll(async () => (await saved(page)).resolution.choice).toBeNull();
    await page.screenshot({ path: test.info().outputPath('houdini-phone.png') });
    expect(errors).toEqual([]);
  });
}

test('Houdini and Bess share transparent figure textures across all four owner colors', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests = new Set<string>();
  page.on('request', (request) => {
    if (/harry-houdini-(?:bess-)?token-/.test(request.url())) requests.add(request.url());
  });
  const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
    id,
    name: `Houdini ${i + 1}`,
    character: 'harry-houdini',
    handCount: 0,
    deckCount: 10,
    discard: [],
    eliminated: false,
  }));
  const fighters: GameView['fighters'] = players.flatMap((p, i) => [
    {
      id: `${p.id}:main`,
      player: p.id,
      character: 'harry-houdini',
      definition: 'harry-houdini',
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
      character: 'harry-houdini',
      definition: 'harry-houdini-bess',
      role: 'ally' as const,
      hp: 5,
      position: ['n5', 'n10', 'n16', 'n22'][i],
      defeated: false,
      counters: {},
      statuses: [],
    },
  ]);
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
    await loadFigureTexture(rasterAssets['harry-houdini-token'].url);
    await loadFigureTexture(rasterAssets['harry-houdini-bess-token'].url);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.screenshot({ path: test.info().outputPath('houdini-four-colors-desktop.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: test.info().outputPath('houdini-four-colors-phone.png') });
  expect(requests.size).toBe(2);
});
