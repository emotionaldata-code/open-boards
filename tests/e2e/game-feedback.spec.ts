import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';

const hand = ['medusa-winged-frenzy', 'medusa-dash', 'medusa-hiss-and-slither'].map(
  (definition) => ({ id: definition, definition }),
);

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 667 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(`printed hand and sharp arena remain usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await presentationHarness(page, true, { hand });
    await expect(page.locator('.arena canvas')).toBeVisible();
    await expect(page.locator('.game-card')).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator('.game-card img')
          .first()
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.arena canvas')!;
      const board = document.querySelector('.board-viewport')!.getBoundingClientRect();
      const card = document.querySelector('.game-card')!.getBoundingClientRect();
      const dock = document.querySelector('.hand')!.getBoundingClientRect();
      return {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        resolution: canvas.width / canvas.getBoundingClientRect().width,
        boardHeight: board.height,
        cardRatio: card.height / card.width,
        rulesFit: [...document.querySelectorAll('.hand .card-description')].every(
          (node) => node.getBoundingClientRect().bottom <= dock.bottom + 1,
        ),
      };
    });
    await page.screenshot({ path: test.info().outputPath('tabletop.png') });
    expect(metrics.width).toBe(viewport.width);
    expect(metrics.height).toBe(viewport.height);
    expect(metrics.resolution).toBeGreaterThanOrEqual(1.98);
    expect(metrics.boardHeight).toBeGreaterThan(110);
    expect(metrics.cardRatio).toBeGreaterThan(1);
    expect(metrics.rulesFit).toBe(true);
    await page.screenshot({ path: test.info().outputPath('tabletop.png') });
    const card = page.locator('.game-card[data-card="versatile"]').first();
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });
}

test('interaction SFX distinguish selections and confirmations, and mute persists', async ({
  page,
}) => {
  await presentationHarness(page, true, { hand });
  await page.evaluate(async () => {
    const url = '/src/audio/player.ts';
    const { sound } = (await import(url)) as typeof import('../../apps/client/src/audio/player');
    const calls: string[] = [];
    sound.play = (cue) => {
      calls.push(cue);
      return () => {};
    };
    Object.assign(window, { feedbackSounds: calls });
  });
  await page.locator('.game-card[data-card="versatile"]').first().click();
  await page.locator('.draw-pile').click();
  expect(
    await page.evaluate(() => (window as unknown as { feedbackSounds: string[] }).feedbackSounds),
  ).toEqual(['select', 'confirm']);
  await page.evaluate(() => {
    document.getElementById('root')!.hidden = false;
  });
  await page.locator('[data-sound="none"]').click();
  await expect(page.locator('[data-sound="none"]')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('[data-sound="none"]')).toHaveAttribute('aria-pressed', 'false');
});

test('confirmed effects play with the generated atlas and reduced motion remains available', async ({
  page,
}) => {
  await presentationHarness(page, true, { hand });
  const atlas = await page.request.get('/effects/tabletop-vfx.webp');
  expect(atlas.ok()).toBe(true);
  await page.evaluate(async () => {
    const url = '/src/animation/sprites.ts';
    const { preloadEffects } = (await import(
      url
    )) as typeof import('../../apps/client/src/animation/sprites');
    const frames = await preloadEffects();
    if (!frames.impact[0].source.autoGenerateMipmaps) throw new Error('Missing texture mipmaps');
    if (frames.impact.length !== 4 || frames.parry[3].frame.x !== 768)
      throw new Error('Invalid VFX atlas');
  });
  await page.evaluate(() => {
    (window as unknown as { presentOutcomes: (outcomes: unknown[]) => void }).presentOutcomes([
      { type: 'damage', fighter: 'a:main', amount: 2, reason: 'ability', sequence: 1, revision: 1 },
    ]);
  });
  await expect(page.locator('.action-notice.is-visible .icon')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('impact.png') });
  await page.locator('.event-acknowledgement button').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.action-notice.is-visible')).toHaveCount(0, { timeout: 10000 });
  await page.evaluate(() => {
    (window as unknown as { presentOutcomes: (outcomes: unknown[]) => void }).presentOutcomes([
      { type: 'heal', fighter: 'a:main', amount: 2, sequence: 2, revision: 2 },
    ]);
  });
  await expect(page.locator('.action-notice.is-visible .icon')).toBeVisible();
});
