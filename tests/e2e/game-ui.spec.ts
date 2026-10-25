import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';

const hand = [
  'medusa-winged-frenzy',
  'sherlock-holmes-confirm-suspicion',
  'the-genie-three-wishes',
  'king-arthur-bewilderment',
  'medusa-dash',
].map((definition, i) => ({ id: `card-${i}`, definition }));

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 667 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
  { width: 3840, height: 2160 },
]) {
  test(`readable cards and proportional, usable map at ${viewport.width}×${viewport.height}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 900,
      deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await presentationHarness(page, true, { hand });
      await expect(page.locator('canvas')).toBeVisible();
      await expect(page.getByText('Turn your phone to play', { exact: true })).toHaveCount(0);
      await expect(page.locator('.card-info')).toHaveCount(0);
      const size = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      expect(size).toEqual({ w: viewport.width, h: viewport.height });
      const canvas = await page.locator('canvas').evaluate((node) => ({
        width: (node as HTMLCanvasElement).width,
        rendered: node.getBoundingClientRect().width,
      }));
      expect(Math.abs(canvas.width - canvas.rendered * 3)).toBeLessThan(4);
      const arena = await page.locator('.arena').boundingBox();
      expect(arena!.width / arena!.height).toBeCloseTo(1900 / 780, 2);
      for (const effect of await page.locator('.hand .card-description').all()) {
        expect(await effect.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
      }
      const firstCard = page.locator('.game-card').first();
      await firstCard.click();
      await expect(firstCard).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.getByRole('button', { name: 'Play Winged Frenzy', exact: true }),
      ).toBeInViewport();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: 'Expand map', exact: true }).click();
      await expect(page.locator('.map-expanded')).toBeVisible();
      await page.getByRole('button', { name: 'Close expanded map', exact: true }).click();
      await expect(page.locator('.map-expanded')).toHaveCount(0);
      await expect(firstCard).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: test.info().outputPath('game.png') });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('portrait map pans, fits, and keeps movement targets aligned after rotation', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await presentationHarness(page, true, {
      hand,
      phase: { type: 'choosing-movement', player: 'a' },
      maneuver: { player: 'a', remaining: ['a:main'], finishing: false, boost: 0, boostable: true },
    });
    const viewport = page.locator('.board-viewport');
    expect(await viewport.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    const target = page.getByRole('button', { name: /^Move to/ }).last();
    await target.scrollIntoViewIfNeeded();
    const bounds = await target.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await target.tap();
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { presentationCommands: { type: string }[] }
          ).presentationCommands.at(-1)?.type,
      ),
    ).toBe('move');
    await page.getByRole('button', { name: 'Fit entire map', exact: true }).click();
    expect(await viewport.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('canvas')).toBeVisible();
    const arena = await page.locator('.arena').boundingBox();
    expect(arena!.width / arena!.height).toBeCloseTo(1900 / 780, 2);
    await page.getByRole('button', { name: 'Enlarge map', exact: true }).click();
    expect(await viewport.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  } finally {
    await context.close();
  }
});

test('disabled hand cards remain fully readable while waiting for a rival', async ({ page }) => {
  await presentationHarness(page, true, { hand, turn: 1 });
  await expect(page.locator('.game-card:disabled')).toHaveCount(hand.length);
  await expect(page.locator('.hand')).toContainText('If none match, they reveal their hand.');
  await expect(page.locator('.hand')).toContainText('Each opponent discards 2 cards.');
  await expect(page.locator('.card-info')).toHaveCount(0);
});

test('portrait detail view opens around your fighter on the far side of the board', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await presentationHarness(page, true, {
    hand,
    fighters: ['a', 'b'].map((id, i) => ({
      id: `${id}:main`,
      player: id,
      role: 'main',
      character: 'medusa',
      definition: 'medusa',
      hp: 15,
      position: i ? 'n0' : 'n13',
      defeated: false,
      counters: {},
      statuses: [],
    })),
  });
  await expect
    .poll(() => page.locator('.board-viewport').evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Fit entire map', exact: true }).click();
  await expect
    .poll(() => page.locator('.board-viewport').evaluate((node) => node.scrollLeft))
    .toBe(0);
});
