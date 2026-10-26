import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { boardLayout } from '../../packages/content/src/layout';
import { presentationHarness } from './fixtures/game';

async function expectWholeMap(page: import('@playwright/test').Page) {
  const frame = (await page.locator('.board-viewport').boundingBox())!;
  for (const element of [
    page.locator('.arena'),
    ...(await page.locator('.map-terrain circle').all()),
  ]) {
    const bounds = (await element.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(bounds.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  }
  const overflow = await page.locator('.board-viewport').evaluate((node) => ({
    x: node.scrollWidth - node.clientWidth,
    y: node.scrollHeight - node.clientHeight,
    left: node.scrollLeft,
    top: node.scrollTop,
  }));
  expect(overflow).toEqual({ x: 0, y: 0, left: 0, top: 0 });
}

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
  { width: 320, height: 568 },
  { width: 390, height: 667 },
  { width: 430, height: 932 },
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
      await expectWholeMap(page);
      for (const effect of await page.locator('.hand .card-description').all()) {
        expect(await effect.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
      }
      const firstCard = page.locator('.game-card').first();
      await expect(firstCard).toHaveAccessibleName('Play Winged Frenzy');
      await expect(
        page.getByRole('button', { name: 'Play Winged Frenzy', exact: true }),
      ).toBeInViewport();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: /Enlarge map|Fit entire map|Expand map|Close expanded map/,
        }),
      ).toHaveCount(0);
      await expect(page.locator('.map-terrain')).toBeVisible();
      const map = await page.locator('.board-viewport').boundingBox();
      expect(map!.height).toBeGreaterThan(110);
      if (viewport.width === 1440) expect(arena!.width).toBeGreaterThan(1200);
      if (viewport.width === 390) {
        expect(
          (await page.locator('.player-badge').first().boundingBox())!.height,
        ).toBeLessThanOrEqual(44);
        expect(map!.height).toBeGreaterThan(240);
      }
      const dock = await page.locator('.hand').boundingBox();
      expect(
        await page.locator('.hand').evaluate((node) => node.scrollHeight - node.clientHeight),
      ).toBe(0);
      const effect = await firstCard.locator('.card-description').boundingBox();
      expect(effect!.y + effect!.height).toBeLessThanOrEqual(dock!.y + dock!.height + 1);
      if (viewport.width === 390) {
        for (const description of await page.locator('.hand .card-description').all()) {
          const bounds = await description.boundingBox();
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(dock!.y + dock!.height + 1);
        }
        const nextCard = page.locator('.game-card').nth(1);
        await nextCard.scrollIntoViewIfNeeded();
        await expect(nextCard).toHaveAccessibleName('Play Confirm Suspicion');
        await page
          .getByRole('button', { name: 'Maneuver · draw a card', exact: true })
          .scrollIntoViewIfNeeded();
      }

      await page.screenshot({ path: test.info().outputPath('game.png') });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

for (const start of ['n0', 'n13']) {
  test(`whole phone map and movement taps from ${start} work after rotation`, async ({
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
        maneuver: {
          player: 'a',
          remaining: ['a:main'],
          finishing: false,
          boost: 0,
          boostable: true,
        },
        fighters: ['a', 'b'].map((id, i) => ({
          id: `${id}:main`,
          player: id,
          role: 'main',
          character: 'medusa',
          definition: 'medusa',
          hp: 15,
          position: i ? (start === 'n0' ? 'n13' : 'n0') : start,
          defeated: false,
          counters: {},
          statuses: [],
        })),
      });
      for (const size of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(size);
        await expectWholeMap(page);
        const labels = await page
          .getByRole('button', { name: /^Move to/ })
          .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')!));
        for (const name of labels) {
          const target = page.getByRole('button', { name, exact: true });
          const bounds = (await target.boundingBox())!;
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
          await expect(target).toBeInViewport({ ratio: 1 });
          const label = (await target.getAttribute('aria-label'))!.replace('Move to ', '');
          await target.tap();
          const command = await page.evaluate(() =>
            (
              window as unknown as {
                presentationCommands: { type: string; path: string[] }[];
              }
            ).presentationCommands.at(-1),
          );
          expect(command?.type).toBe('move');
          if (command?.path.length)
            expect(command.path.at(-1)).toBe(
              Object.keys(boardLayout).find((id) => boardLayout[id].label === label),
            );
          const revision = Number(
            await page.locator('main.game-layout').getAttribute('data-revision'),
          );
          await page.evaluate(() =>
            (
              window as unknown as { updatePresentationGame: (g: object) => void }
            ).updatePresentationGame({}),
          );
          await expect(page.locator('main.game-layout')).toHaveAttribute(
            'data-revision',
            String(revision + 1),
          );
        }
      }
    } finally {
      await context.close();
    }
  });
}

test('waiting cards stay compact and can be inspected without playing them', async ({ page }) => {
  await presentationHarness(page, true, { hand, turn: 1 });
  await expect(page.locator('.game-card')).toHaveCount(0);
  await expect(page.locator('.compact-card')).toHaveCount(hand.length);
  await page.getByRole('button', { name: 'View Confirm Suspicion · unavailable now' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('If none match, they reveal their hand.');
  await expect(dialog.locator('.card-art')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { presentationCommands: unknown[] }).presentationCommands,
    ),
  ).toEqual([]);
});

const mixedHand = [
  'medusa-gaze-of-stone',
  'medusa-hiss-and-slither',
  'medusa-dash',
  'medusa-winged-frenzy',
  'medusa-the-hounds-of-mighty-zeus',
].map((definition, i) => ({ id: `mixed-${i}`, definition }));

for (const viewport of [
  { width: 390, height: 667 },
  { width: 844, height: 390 },
]) {
  test(`defense expands eligible cards and compacts the others at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await presentationHarness(page, true, {
      hand: mixedHand,
      turn: 1,
      phase: { type: 'awaiting-defense', attacker: 'b:main', defender: 'a:main' },
    });
    await expect(page.locator('.game-card')).toHaveCount(2);
    await expect(page.locator('.game-card[data-card="defense"]')).toHaveCount(1);
    await expect(page.locator('.game-card[data-card="versatile"]')).toHaveCount(1);
    await expect(page.locator('.game-card:disabled')).toHaveCount(0);
    await expect(page.locator('.compact-card')).toHaveCount(3);
    await expect(page.locator('.compact-card[data-card="attack"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'All cards', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Take the hit', exact: true })).toBeInViewport();
    await page.locator('.game-card[data-card="defense"]').click();
    expect(
      await page.evaluate(() =>
        (window as unknown as { presentationCommands: unknown[] }).presentationCommands.at(-1),
      ),
    ).toEqual({ type: 'defend', card: 'mixed-1' });
    await page.screenshot({ path: test.info().outputPath('defense.png') });
  });

  test(`whole-card tints and larger artwork at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await presentationHarness(page, true, { hand: mixedHand });
    await expect(
      page.getByRole('button', { name: /Hide hand|Reveal hand|All cards|Playable only/ }),
    ).toHaveCount(0);
    await expect(page.locator('.game-card')).toHaveCount(3);
    await expect(page.locator('.compact-card')).toHaveCount(2);
    const colors = await page
      .locator('.game-card, .compact-card')
      .evaluateAll((nodes) => [
        ...new Set(
          nodes.map((node) => getComputedStyle(node).getPropertyValue('--card-color').trim()),
        ),
      ]);
    expect(colors).toHaveLength(4);
    const fills = await page.locator('.game-card').evaluateAll((nodes) =>
      nodes.map((node) => ({
        card: getComputedStyle(node).backgroundColor,
        top: getComputedStyle(node.querySelector('.card-top')!).backgroundColor,
      })),
    );
    expect(new Set(fills.map(({ card }) => card)).size).toBe(3);
    expect(fills.every(({ top }) => top === 'rgba(0, 0, 0, 0)')).toBe(true);
    for (const art of await page.locator('.game-card .card-art').all()) {
      const bounds = (await art.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(110);
      expect(bounds.height).toBeGreaterThanOrEqual(70);
    }
    const compact = page.getByRole('button', { name: 'View Hiss and Slither · unavailable now' });
    await compact.scrollIntoViewIfNeeded();
    const strip = (await compact.boundingBox())!;
    expect(strip.height).toBe(44);
    await compact.click();
    await expect(page.getByRole('dialog')).toContainText('Hiss and Slither');
    await page.keyboard.press('Escape');
    await expectWholeMap(page);
    await page.screenshot({ path: test.info().outputPath('card-tints.png') });
  });
}

for (const mode of ['portrait', 'landscape', 'defense', 'boost'] as const) {
  test(`all authored card effects fit without vertical scrolling in ${mode}`, async ({ page }) => {
    const directory = new URL('../../packages/content/src/characters/', import.meta.url);
    const cards = readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .flatMap((file) =>
        (
          JSON.parse(readFileSync(new URL(file, directory), 'utf8')) as { cards: { id: string }[] }
        ).cards.map(({ id }) => ({ id, definition: id })),
      );
    const viewport =
      mode === 'portrait' ? { width: 320, height: 568 } : { width: 667, height: 375 };
    await page.setViewportSize(viewport);
    await presentationHarness(page, true, {
      hand: cards,
      turn: 0,
      phase:
        mode === 'defense'
          ? { type: 'awaiting-defense', attacker: 'b:main', defender: 'a:main' }
          : mode === 'portrait'
            ? { type: 'taking-actions' }
            : { type: 'choosing-movement', player: 'a' },
      maneuver:
        mode !== 'defense' && mode !== 'portrait'
          ? { player: 'a', remaining: ['a:main'], finishing: false, boost: 0, boostable: true }
          : null,
    });
    const cropped = await page.locator('.hand').evaluate((dock) => {
      const bottom = dock.getBoundingClientRect().bottom;
      return [...dock.querySelectorAll('.card-description')]
        .filter(
          (node) =>
            node.scrollHeight > node.clientHeight ||
            node.getBoundingClientRect().bottom > bottom + 1,
        )
        .map((node) => node.textContent);
    });
    expect(cropped).toEqual([]);
    expect(
      await page.locator('.hand').evaluate((node) => node.scrollHeight - node.clientHeight),
    ).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
    await page.screenshot({ path: test.info().outputPath('all-cards.png') });
    await expectWholeMap(page);
  });
}

test('empty defense still offers taking the hit', async ({ page }) => {
  await presentationHarness(page, true, {
    hand: mixedHand.filter((card) => [0, 3, 4].includes(mixedHand.indexOf(card))),
    turn: 1,
    phase: { type: 'awaiting-defense', attacker: 'b:main', defender: 'a:main' },
  });
  await expect(page.locator('.game-card')).toHaveCount(0);
  await expect(page.locator('.hand')).toContainText('No defense cards for this fighter.');
  await page.getByRole('button', { name: 'Take the hit', exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { presentationCommands: unknown[] }).presentationCommands.at(-1),
    ),
  ).toEqual({ type: 'defend', card: null });
});

for (const mode of ['boost', 'discard'] as const) {
  test(`${mode} keeps every card available`, async ({ page }) => {
    const hand = [...mixedHand, ...mixedHand.map((card) => ({ ...card, id: `${card.id}-copy` }))];
    await presentationHarness(page, true, {
      hand,
      phase:
        mode === 'boost'
          ? { type: 'choosing-movement', player: 'a' }
          : { type: 'discarding', player: 'a' },
      maneuver:
        mode === 'boost'
          ? { player: 'a', remaining: ['a:main'], finishing: false, boost: 0, boostable: true }
          : null,
    });
    await expect(page.locator('.game-card')).toHaveCount(hand.length);
    await expect(page.locator('.game-card:disabled')).toHaveCount(0);
    await page.locator('.game-card[data-card="defense"]').first().click();
    if (mode === 'boost') {
      await expect(
        page.getByRole('button', { name: 'Finish Maneuver', exact: true }),
      ).toBeVisible();
    } else {
      await page.locator('.game-card').nth(0).click();
      await page.locator('.game-card').nth(2).click();
      await page.getByRole('button', { name: 'Discard 3 / 3', exact: true }).click();
    }
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { presentationCommands: { type: string }[] }
          ).presentationCommands.at(-1)?.type,
      ),
    ).toBe(mode === 'boost' ? 'boost-maneuver' : 'discard');
  });
}

test('portrait shows both sides of the map when your fighter starts on the far side', async ({
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
  await expect(page.locator('canvas')).toBeVisible();
  await expectWholeMap(page);
});

test('native map stays complete when WebGL is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await presentationHarness(page, false, {
    hand,
    phase: { type: 'choosing-movement', player: 'a' },
    maneuver: { player: 'a', remaining: ['a:main'], finishing: false, boost: 0, boostable: true },
  });
  await expect(page.locator('.board-error')).toBeVisible();
  await expect(page.locator('.map-terrain')).toBeVisible();
  await expectWholeMap(page);
  await expect(page.locator('.map-terrain text')).toHaveCount(58);
  const invalid = await page.locator('.map-terrain path').evaluateAll((paths) =>
    paths.some((path) => {
      const bounds = (path as SVGPathElement).getBBox();
      return (
        !Number.isFinite(bounds.x + bounds.y + bounds.width + bounds.height) ||
        /NaN|undefined/.test(path.getAttribute('d')!)
      );
    }),
  );
  expect(invalid).toBe(false);
  await page
    .getByRole('button', { name: /^Move to/ })
    .first()
    .click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { presentationCommands: { type: string }[] }).presentationCommands.at(
          -1,
        )?.type,
    ),
  ).toBe('move');
});

for (const width of [390, 1440]) {
  test(`switching from Arthur to Merlin compacts fighter-specific cards at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const hand = [
      'king-arthur-excalibur',
      'king-arthur-the-lady-of-the-lake',
      'king-arthur-prophecy',
      'king-arthur-aid-the-chosen-one',
      'king-arthur-skirmish',
      'king-arthur-bewilderment',
    ].map((definition) => ({ id: definition, definition }));
    await presentationHarness(page, true, {
      hand,
      fighters: [
        {
          id: 'a:main',
          player: 'a',
          role: 'main',
          character: 'king-arthur',
          definition: 'king-arthur',
          hp: 18,
          position: 'n0',
          defeated: false,
          counters: {},
          statuses: [],
        },
        {
          id: 'a:ally-1',
          player: 'a',
          role: 'ally',
          character: 'king-arthur',
          definition: 'king-arthur-merlin',
          hp: 7,
          position: 'n1',
          defeated: false,
          counters: {},
          statuses: [],
        },
        {
          id: 'b:main',
          player: 'b',
          role: 'main',
          character: 'medusa',
          definition: 'medusa',
          hp: 15,
          position: 'n13',
          defeated: false,
          counters: {},
          statuses: [],
        },
      ],
    });
    await expect(page.locator('.game-card')).toHaveCount(3);
    await page
      .locator('.game-card')
      .filter({ has: page.locator('.card-name', { hasText: /^Excalibur$/ }) })
      .click();
    await page.getByRole('button', { name: 'Merlin 1', exact: true }).click();
    await expect(page.locator('.game-card')).toHaveCount(3);
    await expect(
      page
        .locator('.game-card')
        .filter({ has: page.locator('.card-name', { hasText: /^Excalibur$/ }) }),
    ).toHaveCount(0);
    await expect(page.locator('.compact-card').filter({ hasText: 'Excalibur' })).toHaveCount(1);
    await expect(page.locator('.game-card').filter({ hasText: 'Prophecy' })).toHaveCount(1);
    await expect(page.locator('.game-card').filter({ hasText: 'Aid the Chosen One' })).toHaveCount(
      1,
    );
    await expect(page.locator('.game-card').filter({ hasText: 'Skirmish' })).toHaveCount(1);
    await expect(page.locator('.game-card[aria-pressed="true"]')).toHaveCount(0);
    await page.locator('.game-card').filter({ hasText: 'Prophecy' }).click();
    expect(
      await page.evaluate(() =>
        (window as unknown as { presentationCommands: unknown[] }).presentationCommands.at(-1),
      ),
    ).toEqual({ type: 'play-action', fighter: 'a:ally-1', card: 'king-arthur-prophecy' });
    await expectWholeMap(page);
    await page.screenshot({ path: test.info().outputPath('merlin.png') });
  });
}
