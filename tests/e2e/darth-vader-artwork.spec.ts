import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src/index';
import type { Outcome } from '../../packages/game/src/index';

test('Vader keeps his SVG figure when its raster fails in a mixed match', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
  await page.route('**/artwork/darth-vader/*token*', (route) => route.abort());
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const players: GameView['players'] = ['darth-vader', 'medusa'].map((character, i) => ({
    id: i ? 'b' : 'a',
    name: character,
    character,
    handCount: 0,
    deckCount: 10,
    discard: [],
    eliminated: false,
  }));
  const fighters: GameView['fighters'] = players.map((player, i) => ({
    id: `${player.id}:main`,
    player: player.id,
    character: player.character,
    definition: player.character,
    role: 'main',
    hp: i ? 16 : 20,
    position: i ? 'n13' : 'n0',
    defeated: false,
    counters: {},
    statuses: [],
  }));
  const failed = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().includes('/darth-vader-token-'),
  });
  await presentationHarness(page, true, { players, fighters });
  await failed;
  await page.evaluate(async () => {
    const assetsUrl = '/src/artwork/assets.ts',
      texturesUrl = '/src/artwork/textures.ts';
    const { rasterAssets } = await import(assetsUrl);
    const { loadFigureTexture } = await import(texturesUrl);
    await loadFigureTexture(rasterAssets['medusa-token'].url);
  });
  await page.locator('[data-fighter="a:main"]').click();
  for (const width of [1440, 844]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 390 });
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath(`vader-svg-raster-fallback-${width}.png`),
    });
  }
  expect(errors).toEqual([]);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Darth Vader shares one figure texture across four owner colors and survives lifecycle changes (${reducedMotion})`, async ({
    page,
  }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors: string[] = [],
      textures: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/artwork/darth-vader/'))
        errors.push(response.url());
    });
    page.on('request', (request) => {
      if (/\/darth-vader-token-/.test(request.url())) textures.push(request.url());
    });
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Owner ${i + 1}`,
      character: 'darth-vader',
      handCount: 0,
      deckCount: 10,
      discard: [],
      eliminated: false,
    }));
    let fighters: GameView['fighters'] = players.map((player, i) => ({
      id: `${player.id}:main`,
      player: player.id,
      character: 'darth-vader',
      definition: 'darth-vader',
      role: 'main',
      hp: 20,
      position: ['n0', 'n7', 'n13', 'n20'][i],
      defeated: false,
      counters: {},
      statuses: [],
    }));
    await presentationHarness(page, true, { players, fighters });
    await expect(page.locator('.pixi-surface canvas')).toBeVisible();
    await page.evaluate(async () => {
      const assetsUrl = '/src/artwork/assets.ts',
        texturesUrl = '/src/artwork/textures.ts';
      const { rasterAssets } = (await import(
        assetsUrl
      )) as typeof import('../../apps/client/src/artwork/assets');
      const { loadFigureTexture } = (await import(
        texturesUrl
      )) as typeof import('../../apps/client/src/artwork/textures');
      await loadFigureTexture(rasterAssets['darth-vader-token'].url);
    });
    const vader = page.locator('[data-fighter="a:main"]');
    await vader.click();
    await expect(vader).toHaveAttribute('aria-pressed', 'true');
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`vader-four-colors-${viewport.width}.png`),
      });
    }
    const transition = async (fighter: Partial<GameView['fighters'][number]>, outcome: Outcome) => {
      fighters = fighters.map((f) => (f.id === 'a:main' ? { ...f, ...fighter } : f));
      await page.evaluate(
        ({ fighters, outcome }) => {
          const harness = window as unknown as {
            updatePresentationGame: (game: Partial<GameView>) => void;
            presentOutcomes: (outcomes: Outcome[]) => void;
          };
          harness.updatePresentationGame({ fighters });
          harness.presentOutcomes([outcome]);
        },
        { fighters, outcome },
      );
      const notice = page.locator('.action-notice');
      await expect(notice).toHaveAttribute('data-event-revision', String(outcome.revision));
      if (outcome.type === 'revived') {
        await expect(page.getByRole('dialog').locator('img[data-raster]')).toHaveJSProperty(
          'complete',
          true,
        );
        await page.screenshot({
          animations: 'disabled',
          path: test.info().outputPath('vader-revival.png'),
        });
        await page.getByRole('button', { name: 'Conferma', exact: true }).click();
      }
      await expect(notice).not.toHaveClass(/is-visible/, { timeout: 15000 });
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`vader-${outcome.type}.png`),
      });
    };
    await transition(
      { position: 'n2' },
      {
        type: 'move',
        fighter: 'a:main',
        path: ['n0', 'n2'],
        sequence: 1,
        revision: 1,
        audience: 'all',
      },
    );
    await transition(
      { position: null, hp: 0, defeated: true },
      { type: 'defeated', fighter: 'a:main', sequence: 2, revision: 2, audience: 'all' },
    );
    await expect(vader).toHaveCount(0);
    await transition(
      { position: 'n2', hp: 20, defeated: false },
      {
        type: 'revived',
        fighter: 'a:main',
        position: 'n2',
        sequence: 3,
        revision: 3,
        audience: 'all',
      },
    );
    await expect(vader).toBeVisible();
    expect(textures).toHaveLength(1);
    expect(errors).toEqual([]);
    await test.info().attach('vader-token-requests', {
      body: JSON.stringify(textures),
      contentType: 'application/json',
    });
  });
}
