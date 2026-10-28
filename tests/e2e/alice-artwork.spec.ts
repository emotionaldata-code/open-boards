import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src/index';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Alice and numbered Jabberwock share textures across four owner colors (${reducedMotion})`, async ({
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
      if (response.status() >= 400 && response.url().includes('/artwork/alice/'))
        errors.push(`${response.status()} ${response.url()}`);
    });
    page.on('request', (request) => {
      if (/\/alice-(jabberwock-)?token-/.test(request.url())) textures.push(request.url());
    });
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Owner ${i + 1}`,
      character: 'alice',
      handCount: 0,
      deckCount: 10,
      discard: [],
      eliminated: false,
    }));
    const fighters: GameView['fighters'] = players.flatMap((player, i) => [
      {
        id: `${player.id}:main`,
        player: player.id,
        character: 'alice',
        definition: 'alice',
        role: 'main' as const,
        hp: 13,
        position: ['n0', 'n7', 'n13', 'n20'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
      {
        id: `${player.id}:ally-1`,
        player: player.id,
        character: 'alice',
        definition: 'alice-jabberwock',
        role: 'ally' as const,
        hp: 8,
        position: ['n1', 'n8', 'n14', 'n21'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
    ]);
    await presentationHarness(page, true, { players, fighters });
    await expect.poll(() => textures.length).toBe(2);
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
        ['alice-token', 'alice-jabberwock-token'].map((id) =>
          loadFigureTexture(rasterAssets[id].url),
        ),
      );
    });
    const jabberwock = page.getByRole('button', { name: 'The Jabberwock 1', exact: true });
    await jabberwock.click();
    await page.mouse.move(0, 0);
    await expect(jabberwock).toHaveAttribute('aria-pressed', 'true');
    await expect(jabberwock).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('alice-four-colors-desktop.png'),
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
      path: test.info().outputPath('alice-four-colors-phone.png'),
    });
    expect(new Set(textures).size).toBe(2);
    expect(errors).toEqual([]);
  });
}
