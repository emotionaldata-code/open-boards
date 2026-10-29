import { expect, test, type Page } from '@playwright/test';
import { contentText } from '../../apps/client/src/localization/text';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src';

async function mount(page: Page, viewer = 'p0', scene: 'question' | 'method' = 'question') {
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
      const saved = sessionStorage.getItem('hamlet-state');
      let state: import('../../packages/game/src').GameState = saved
        ? JSON.parse(saved)
        : createGame(
            ['hamlet', 'bigfoot'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Briar' : 'Hamlet',
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
        f('p0:ally-1').position = 'n20';
        f('p1:ally-1').position = 'n22';
        if (scene === 'method') {
          apply({ type: 'choose', choice: state.resolution.choice!.id, options: ['to-be'] }, 'p0');
          state.players[0].hand[0].definition = 'hamlet-method-in-the-madness';
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
        sessionStorage.setItem('hamlet-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: {
              id: 'hamlet-test',
              host: 'p0',
              capacity: 2,
              seats: [],
              game: projectGame(state, viewer, false),
            },
            user: { id: viewer, name: viewer === 'p0' ? 'Hamlet' : 'Briar' },
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
    await Promise.all(
      ['hamlet-token', 'hamlet-rosencrantz-guildenstern-token'].map((id) =>
        loadFigureTexture(rasterAssets[id].url),
      ),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
async function saved(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem('hamlet-state')!,
      ) as import('../../packages/game/src').GameState,
  );
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});
for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Hamlet retains The Question and exact ally payment across desktop/phone reconnect (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page);
    const notToBe = page.getByRole('button', {
      name: 'NON ESSERE · Gli attacchi di Amleto hanno +2; infliggi 2 danni a un tuo combattente',
      exact: true,
    });
    await expect(notToBe).toBeVisible();
    await notToBe.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: /^Scegli Rosencrantz e Guildenstern.*Hamlet/ }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('hamlet-question-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await mount(page, 'p1');
    await expect(
      page.getByRole('button', { name: /^Scegli Rosencrantz e Guildenstern.*Hamlet/ }),
    ).toHaveCount(0);
    await page.reload();
    await mount(page);
    await page.getByRole('button', { name: /^Scegli Rosencrantz e Guildenstern.*Hamlet/ }).click();
    await expect.poll(async () => (await saved(page)).resolution.choice).toBeNull();
    expect((await saved(page)).fighters.find((f) => f.id === 'p0:ally-1')?.hp).toBe(4);
    expect(
      (await saved(page)).fighters.find((f) => f.id === 'p0:main')?.counters['not-to-be'],
    ).toBe(1);
    await page.screenshot({ path: test.info().outputPath('hamlet-question-phone.png') });
    expect(errors).toEqual([]);
  });
}
test('Hamlet cycles privately to bottom then chooses fewer draws on a landscape phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await mount(page, 'p0', 'method');
  const state = await saved(page),
    first = state.resolution.choice!.options.find((o) => o.card)!;
  // Use the visible exact-card choice, retaining the public inspector path.
  await page.getByRole('button', { name: contentText(first.label), exact: true }).click();
  await page
    .getByRole('button', { name: 'Termina la restituzione delle carte', exact: true })
    .click();
  await expect(
    page.getByText('Scegli quante carte pescare', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Valore', exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Conferma valore', exact: true }).click();
  await expect.poll(async () => (await saved(page)).resolution.choice).toBeNull();
  expect((await saved(page)).actions).toBe(2);
});

test('Hamlet and both courtiers share two transparent figure textures across four owner colors', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests = new Set<string>();
  page.on('request', (r) => {
    if (/hamlet-(?:rosencrantz-guildenstern-)?token-/.test(r.url())) requests.add(r.url());
  });
  const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
    id,
    name: `Hamlet ${i + 1}`,
    character: 'hamlet',
    handCount: 0,
    deckCount: 10,
    discard: [],
    eliminated: false,
  }));
  const fighters: GameView['fighters'] = players.flatMap((p, i) => [
    {
      id: `${p.id}:main`,
      player: p.id,
      character: 'hamlet',
      definition: 'hamlet',
      role: 'main' as const,
      hp: 15,
      position: ['n0', 'n7', 'n13', 'n20'][i],
      defeated: false,
      counters: { 'not-to-be': i % 2 },
      statuses: [],
    },
    {
      id: `${p.id}:ally-1`,
      player: p.id,
      character: 'hamlet',
      definition: 'hamlet-rosencrantz-guildenstern',
      role: 'ally' as const,
      hp: 6,
      position: ['n1', 'n8', 'n14', 'n21'][i],
      defeated: false,
      counters: {} as Record<string, number>,
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
    await Promise.all(
      ['hamlet-token', 'hamlet-rosencrantz-guildenstern-token'].map((id) =>
        loadFigureTexture(rasterAssets[id].url),
      ),
    );
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  await page.screenshot({ path: test.info().outputPath('hamlet-four-colors-desktop.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: test.info().outputPath('hamlet-four-colors-phone.png') });
  expect(requests.size).toBe(2);
});
