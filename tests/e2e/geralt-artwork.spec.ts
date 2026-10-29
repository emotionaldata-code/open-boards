import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src/index';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Dandelion shares one texture with SVG Geralt across four owner colors (${reducedMotion})`, async ({
    page,
  }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors: string[] = [];
    const textures: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/artwork/geralt-of-rivia/'))
        errors.push(`${response.status()} ${response.url()}`);
    });
    page.on('request', (request) => {
      if (/\/geralt-of-rivia-dandelion-token-/.test(request.url())) textures.push(request.url());
    });
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Owner ${i + 1}`,
      character: 'geralt-of-rivia',
      handCount: 0,
      deckCount: 10,
      discard: [],
      eliminated: false,
    }));
    let fighters: GameView['fighters'] = players.flatMap((player, i) => [
      {
        id: `${player.id}:main`,
        player: player.id,
        character: 'geralt-of-rivia',
        definition: 'geralt-of-rivia',
        role: 'main' as const,
        hp: 16,
        position: ['n0', 'n7', 'n13', 'n20'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
      {
        id: `${player.id}:ally-1`,
        player: player.id,
        character: 'geralt-of-rivia',
        definition: 'geralt-of-rivia-dandelion',
        role: 'ally' as const,
        hp: 5,
        position: ['n1', 'n8', 'n14', 'n21'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
    ]);
    await presentationHarness(page, true, { players, fighters });
    await expect.poll(() => textures.length).toBe(1);
    await page.evaluate(async () => {
      const assetsUrl = '/src/artwork/assets.ts';
      const texturesUrl = '/src/artwork/textures.ts';
      const { rasterAssets } = (await import(
        assetsUrl
      )) as typeof import('../../apps/client/src/artwork/assets');
      const { loadFigureTexture } = (await import(
        texturesUrl
      )) as typeof import('../../apps/client/src/artwork/textures');
      await Promise.all(
        ['geralt-of-rivia-dandelion-token'].map((id) => loadFigureTexture(rasterAssets[id].url)),
      );
    });
    const dandelion = page.locator('[data-fighter="a:ally-1"]');
    await dandelion.click();
    await page.mouse.move(0, 0);
    await expect(dandelion).toHaveAttribute('aria-pressed', 'true');
    await expect(dandelion).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('geralt-of-rivia-four-colors-desktop.png'),
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('geralt-of-rivia-four-colors-phone.png'),
    });
    const transition = async (
      fighter: Partial<GameView['fighters'][number]>,
      outcome: import('../../packages/game/src/index').Outcome,
    ) => {
      fighters = fighters.map((f) => (f.id === 'a:ally-1' ? { ...f, ...fighter } : f));
      await page.evaluate(
        ({ fighters, outcome }) => {
          const harness = window as unknown as {
            updatePresentationGame: (game: Partial<GameView>) => void;
            presentOutcomes: (outcomes: import('../../packages/game/src/index').Outcome[]) => void;
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
          path: test.info().outputPath('dandelion-revival-portrait.png'),
        });
        await page.getByRole('button', { name: 'Conferma', exact: true }).click();
      }
      await expect(notice).not.toHaveClass(/is-visible/, { timeout: 15000 });
    };
    await transition(
      { position: 'n2' },
      {
        type: 'move',
        fighter: 'a:ally-1',
        path: ['n1', 'n2'],
        sequence: 1,
        revision: 1,
        audience: 'all',
      },
    );
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('dandelion-moved.png'),
    });
    await transition(
      { defeated: true, hp: 0, position: null },
      { type: 'defeated', fighter: 'a:ally-1', sequence: 2, revision: 2, audience: 'all' },
    );
    await expect(dandelion).toHaveCount(0);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('dandelion-defeated.png'),
    });
    await transition(
      { defeated: false, hp: 5, position: 'n2' },
      {
        type: 'revived',
        fighter: 'a:ally-1',
        position: 'n2',
        sequence: 3,
        revision: 3,
        audience: 'all',
      },
    );
    await expect(dandelion).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('dandelion-returned.png'),
    });
    // Geralt intentionally retains SVG art while Dandelion uses one shared raster texture.
    expect(new Set(textures).size).toBe(1);
    expect(textures).toHaveLength(1);
    expect(errors).toEqual([]);
    await test.info().attach('geralt-of-rivia-token-requests', {
      body: JSON.stringify(textures, null, 2),
      contentType: 'application/json',
    });
  });
}
