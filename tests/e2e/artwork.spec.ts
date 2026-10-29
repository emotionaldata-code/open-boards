import { contentText } from '../../apps/client/src/localization/text';
import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src/index';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
});

for (const { name, designs } of [
  { name: 'Sinbad', designs: 16 },
  { name: 'Darth Vader', designs: 12 },
  { name: 'Geralt of Rivia', designs: 15 },
  { name: 'Invisible Man', designs: 14 },
  { name: 'Sun Wukong', designs: 12 },
  { name: 'Eredin', designs: 11 },
  { name: 'Bruce Lee', designs: 17 },
  { name: 'Alice', designs: 15 },
  { name: 'Yennefer & Triss', designs: 11 },
  { name: 'Philippa', designs: 13 },
  { name: 'Achilles', designs: 12 },
  { name: 'Dracula', designs: 13 },
  { name: 'Bigfoot', designs: 11 },
  { name: 'The Genie', designs: 12 },
  { name: 'Robin Hood', designs: 11 },
  { name: 'Medusa', designs: 11 },
  { name: 'King Arthur', designs: 16 },
  { name: 'Sherlock Holmes', designs: 13 },
]) {
  test(`${name} raster gallery selects small variants and larger inspector images on desktop and phone`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    const roster = page.getByRole('region', { name: 'Personaggi disponibili' });
    await roster.getByRole('button', { name: `Esamina ${contentText(name)}`, exact: true }).click();
    await expect(roster.locator('.roster-detail img[data-raster]')).toBeVisible();
    await roster
      .getByRole('button', {
        name: `Mazzo di ${contentText(name)} · ${designs} carte diverse`,
        exact: true,
      })
      .click();
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 844, height: 390 },
    ]) {
      if (viewport.width === 844) {
        await page.keyboard.press('Escape');
        await page.setViewportSize(viewport);
        await roster
          .getByRole('button', { name: `Esamina ${contentText(name)}`, exact: true })
          .click();
        await roster
          .getByRole('button', {
            name: `Mazzo di ${contentText(name)} · ${designs} carte diverse`,
            exact: true,
          })
          .click();
      }
      const deck = page.getByRole('dialog', { name: `Mazzo di ${contentText(name)}`, exact: true });
      const cards = deck.locator('.deck-gallery > button');
      await expect(cards).toHaveCount(designs);
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
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Medusa and Vader share three textures across four owner colors (${reducedMotion})`, async ({
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
      if (/\/(medusa|harpy|darth-vader)-token-/.test(request.url())) textures.push(request.url());
    });
    const players: GameView['players'] = ['medusa', 'medusa', 'medusa', 'darth-vader'].map(
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
        hp: player.character === 'darth-vader' ? 20 : 16,
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
    await expect.poll(() => textures.length).toBe(3);
    expect(new Set(textures).size).toBe(3);
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
        ['medusa-token', 'harpy-token', 'darth-vader-token'].map((id) =>
          loadFigureTexture(rasterAssets[id].url),
        ),
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

test('unavailable artwork keeps its frame without SVG replacements', async ({ page }) => {
  await page.route('**/artwork/medusa/**', (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const roster = page.getByRole('region', { name: 'Personaggi disponibili' });
  await roster.getByRole('button', { name: 'Esamina Medusa', exact: true }).click();
  await expect(roster.locator('.roster-detail img')).toHaveCount(0);
  const frame = roster.locator('.roster-detail > .character-portrait');
  const bounds = await frame.boundingBox();
  expect(bounds!.height).toBeCloseTo(bounds!.width / 1.15, 0);
  await roster
    .getByRole('button', { name: 'Mazzo di Medusa · 11 carte diverse', exact: true })
    .click();
  const card = page
    .getByRole('dialog', { name: 'Mazzo di Medusa', exact: true })
    .locator('.deck-gallery > button')
    .first();
  await card.click();
  await expect(page.getByRole('dialog').last().locator('img')).toHaveCount(0);
  expect(await page.locator('img[src^="data:image/svg"], .map-preview-art svg').count()).toBe(0);
});

for (const width of [1440, 768, 390]) {
  test(`artwork loads inside stable, centered frames at ${width}px`, async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/artwork/**/*.webp', async (route) => {
      await pending;
      await route.continue();
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const portrait = page.locator('.roster-detail > .character-portrait');
    const before = await portrait.boundingBox();
    expect(before!.height).toBeLessThan(400);
    expect(await page.locator('img[src^="data:image/svg"], .map-preview-art svg').count()).toBe(0);
    release();
    await portrait.locator('img').evaluate((image: HTMLImageElement) => image.decode());
    expect(await portrait.boundingBox()).toEqual(before);
    expect(await portrait.locator('img').boundingBox()).toEqual(before);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await page.screenshot({ path: test.info().outputPath(`roster-${width}.png`), fullPage: true });
    const roster = page.getByRole('region', { name: 'Personaggi disponibili' });
    await roster.getByRole('button', { name: /Mazzo di/ }).click();
    const card = page.locator('.deck-gallery > button').first();
    await card.locator('img').evaluate((image: HTMLImageElement) => image.decode());
    const boxes = await card.locator('.card-art').evaluate((frame) => ({
      frame: frame.getBoundingClientRect().toJSON(),
      image: frame.querySelector('img')!.getBoundingClientRect().toJSON(),
    }));
    expect(boxes.image).toEqual(boxes.frame);
    await page.screenshot({ path: test.info().outputPath(`deck-${width}.png`) });
  });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Arthur and numbered Merlin figures share textures across four owner colors (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors: string[] = [];
    const textures: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => {
      if (/\/king-arthur-(merlin-)?token-/.test(request.url())) textures.push(request.url());
    });
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Owner ${i + 1}`,
      character: 'king-arthur',
      handCount: 0,
      deckCount: 10,
      discard: [],
      eliminated: false,
    }));
    let fighters: GameView['fighters'] = players.flatMap((player, i) => [
      {
        id: `${player.id}:main`,
        player: player.id,
        character: 'king-arthur',
        definition: 'king-arthur',
        role: 'main' as const,
        hp: 18,
        position: ['n0', 'n7', 'n13', 'n20'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
      {
        id: `${player.id}:ally-1`,
        player: player.id,
        character: 'king-arthur',
        definition: 'king-arthur-merlin',
        role: 'ally' as const,
        hp: 7,
        position: ['n1', 'n8', 'n14', 'n21'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
    ]);
    await presentationHarness(page, true, { players, fighters });
    await expect(page.locator('.pixi-surface canvas')).toBeVisible();
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
        ['king-arthur-token', 'king-arthur-merlin-token'].map((id) =>
          loadFigureTexture(rasterAssets[id].url),
        ),
      );
    });
    const merlin = page.getByRole('button', { name: 'Merlino 1', exact: true });
    await merlin.click();
    await expect(merlin).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('arthur-four-colors-desktop.png'),
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('arthur-four-colors-phone.png'),
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
          path: test.info().outputPath('arthur-merlin-revival-review.png'),
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
      path: test.info().outputPath('arthur-merlin-moved.png'),
    });
    await transition(
      { defeated: true, hp: 0, position: null },
      { type: 'defeated', fighter: 'a:ally-1', sequence: 2, revision: 2, audience: 'all' },
    );
    await expect(merlin).toHaveCount(0);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('arthur-merlin-defeated.png'),
    });
    await transition(
      { defeated: false, hp: 7, position: 'n2' },
      {
        type: 'revived',
        fighter: 'a:ally-1',
        position: 'n2',
        sequence: 3,
        revision: 3,
        audience: 'all',
      },
    );
    await expect(merlin).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('arthur-merlin-returned.png'),
    });
    expect(new Set(textures).size).toBe(2);
    expect(textures).toHaveLength(2);
    await test.info().attach('arthur-token-requests', {
      body: JSON.stringify(textures, null, 2),
      contentType: 'application/json',
    });
    expect(errors).toEqual([]);
  });
}
