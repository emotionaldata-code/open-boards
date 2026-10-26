import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src/index';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});

test('Medusa raster gallery selects small variants and larger inspector images on desktop and phone', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const roster = page.getByRole('region', { name: 'Character roster' });
  await roster.getByRole('button', { name: 'Inspect Medusa', exact: true }).click();
  await expect(roster.locator('.roster-detail img[data-raster]')).toBeVisible();
  await roster
    .getByRole('button', { name: 'Explore Medusa’s deck · 11 designs', exact: true })
    .click();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 844, height: 390 },
  ]) {
    if (viewport.width === 844) {
      await page.keyboard.press('Escape');
      await page.setViewportSize(viewport);
      await page.getByRole('button', { name: /^Explore \d+ characters$/ }).click();
      const picker = page.getByRole('dialog').last();
      await picker.getByRole('button', { name: 'Inspect Medusa', exact: true }).click();
      await picker
        .getByRole('button', { name: 'Explore Medusa’s deck · 11 designs', exact: true })
        .click();
    }
    const deck = page.getByRole('dialog', { name: 'Medusa’s deck', exact: true });
    const cards = deck.locator('.deck-gallery > button');
    await expect(cards).toHaveCount(11);
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      const image = card.locator('img');
      await expect(image).toHaveAttribute('loading', 'lazy');
      await expect
        .poll(() =>
          image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);
      await card.click();
      const inspector = page.getByRole('dialog').last();
      const large = inspector.locator('img[data-raster]');
      await expect(large).toHaveAttribute('loading', 'eager');
      await expect
        .poll(() =>
          large.evaluate(
            (image: HTMLImageElement) => image.complete && /-(640|1280)-/.test(image.currentSrc),
          ),
        )
        .toBe(true);
      await page.screenshot({
        animations: 'disabled',
        path: test
          .info()
          .outputPath(`card-${viewport.width}-${await card.getAttribute('aria-label')}.png`),
      });
      await page.keyboard.press('Escape');
    }
    await deck.locator('.dialog-body').evaluate((body) => {
      body.scrollTop = 0;
    });
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath(`gallery-${viewport.width}.png`),
    });
  }
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/artwork/'))
      .map((entry) => ({
        url: entry.name,
        bytes: (entry as PerformanceResourceTiming).encodedBodySize,
      })),
  );
  await test.info().attach('artwork-transfers', {
    body: JSON.stringify(resources, null, 2),
    contentType: 'application/json',
  });
  expect(resources.filter((entry) => /-320-/.test(entry.url)).length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`mixed SVG/raster scene shares two textures across four owner colors (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const errors: string[] = [];
    const textures: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => {
      if (/\/(medusa|harpy)-token-/.test(request.url())) textures.push(request.url());
    });
    const players: GameView['players'] = ['medusa', 'medusa', 'medusa', 'king-arthur'].map(
      (character, i) => ({
        id: ['a', 'b', 'c', 'd'][i],
        name: `Owner ${i + 1}`,
        character,
        handCount: 0,
        deckCount: 10,
        discard: [],
        eliminated: false,
      }),
    );
    const fighters: GameView['fighters'] = players.flatMap((player, i) => [
      {
        id: `${player.id}:main`,
        player: player.id,
        character: player.character,
        definition: player.character,
        role: 'main' as const,
        hp: 16,
        position: ['n0', 'n7', 'n13', 'n20'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
      ...Array.from({ length: player.character === 'medusa' ? 3 : 0 }, (_, j) => ({
        id: `${player.id}:ally-${j + 1}`,
        player: player.id,
        character: 'medusa',
        definition: 'medusa-harpy',
        role: 'ally' as const,
        hp: 1,
        position: `n${i * 7 + j + 1}`,
        defeated: false,
        counters: {},
        statuses: [],
      })),
    ]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await presentationHarness(page, true, { players, fighters });
    await expect(page.locator('.pixi-surface canvas')).toBeVisible();
    // Pixi fetches images in workers, outside the main window's resource timings.
    await expect.poll(() => textures.length).toBe(2);
    expect(new Set(textures).size).toBe(2);
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
        ['medusa-token', 'harpy-token'].map((id) => loadFigureTexture(rasterAssets[id].url)),
      );
    });
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('mixed-desktop.png'),
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('mixed-phone.png'),
    });
    expect(errors).toEqual([]);
  });
}

test('React artwork falls back to local SVG when raster requests fail', async ({ page }) => {
  await page.route('**/artwork/medusa/**', (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const roster = page.getByRole('region', { name: 'Character roster' });
  await roster.getByRole('button', { name: 'Inspect Medusa', exact: true }).click();
  await expect(roster.locator('.roster-detail img')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  );
  await roster
    .getByRole('button', { name: 'Explore Medusa’s deck · 11 designs', exact: true })
    .click();
  const card = page
    .getByRole('dialog', { name: 'Medusa’s deck', exact: true })
    .locator('.deck-gallery > button')
    .first();
  await card.click();
  await expect(page.getByRole('dialog').last().locator('img')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  );
});
