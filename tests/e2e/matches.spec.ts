import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
const characterSetup: Record<string, { name: string; allies: number }> = {
  medusa: { name: 'Medusa', allies: 3 },
  'bruce-lee': { name: 'Bruce Lee', allies: 0 },
  dracula: { name: 'Dracula', allies: 3 },
  bigfoot: { name: 'Bigfoot', allies: 1 },
  'robin-hood': { name: 'Robin Hood', allies: 4 },
  'sherlock-holmes': { name: 'Sherlock Holmes', allies: 1 },
  'king-arthur': { name: 'King Arthur', allies: 1 },
  achilles: { name: 'Achilles', allies: 1 },
};

async function rosterEntries(page: Page) {
  return page.evaluate(async (rootPath) => {
    const url = `/@fs${rootPath}/packages/content/src/index.ts`;
    const { characters } = (await import(url)) as typeof import('../../packages/content/src');
    return Object.values(characters).map((character): [string, number] => [
      character.name,
      character.deck.length,
    ]);
  }, process.cwd());
}
async function fitsViewport(page: Page) {
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  }));
  expect(size.width).toBeLessThanOrEqual(size.viewportWidth);
  expect(size.height).toBeLessThanOrEqual(size.viewportHeight);
}
async function seenEvents(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { seenPresentationEvents: string[] }).seenPresentationEvents,
  );
}
interface Rival {
  context: BrowserContext;
  page: Page;
  name: string;
  errors: string[];
}
async function register(
  browser: Browser,
  index: number,
  mobile = false,
  animated = false,
): Promise<Rival> {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 667 } : { width: 1440, height: 1000 },
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: animated ? 'no-preference' : 'reduce',
  });
  await context.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { seenPresentationEvents: seen });
    new MutationObserver(() => {
      // These match scenarios read automatically; presentation.spec verifies manual acknowledgement.
      const acknowledgement = document.querySelector<HTMLButtonElement>(
        '.event-acknowledgement button',
      );
      if (acknowledgement?.textContent === 'Acknowledge') acknowledgement.click();
      const notice = document.querySelector('.action-notice[data-event]');
      if (notice) {
        const value = `${notice.getAttribute('data-event')}:${notice.textContent}`;
        if (!seen.includes(value)) seen.push(value);
      }
    }).observe(document, { subtree: true, attributes: true, childList: true });
  });
  context.setDefaultTimeout(10_000);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' && /connection|room|reconnect/i.test(message.text()))
      console.warn(message.text());
  });

  const name = `e2e_${Date.now().toString(36)}_${index}`;
  await page.goto('/');
  await fitsViewport(page);
  await expect(page.getByRole('button', { name: 'How to play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New to the table? Create an account' }).click();
  await page.getByLabel('Username', { exact: true }).fill(name);
  await page.getByLabel('Password', { exact: true }).fill('a-secure-test-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find your table' })).toBeVisible();
  await fitsViewport(page);
  await expect(page.getByRole('button', { name: 'How to play', exact: true })).toHaveCount(0);
  return { context, page, name, errors };
}
async function createMatch(
  browser: Browser,
  count: 2 | 4,
  mobile = false,
  character = 'medusa',
  animated = false,
  deploy = true,
): Promise<Rival[]> {
  const rivals: Rival[] = [];
  for (let i = 0; i < count; i++) rivals.push(await register(browser, i, mobile, animated));
  const host = rivals[0].page;
  await host
    .getByRole('button', {
      name: count === 2 ? '2 Head to head' : '4 Free-for-all',
      exact: true,
    })
    .click();
  await expect(host.getByRole('heading', { name: 'Your table is open' })).toBeVisible();
  await fitsViewport(host);
  const id = await host.getByLabel('Room ID').inputValue();
  for (const rival of rivals.slice(1)) {
    await rival.page.getByLabel('Room ID').fill(id);
    await rival.page.getByRole('button', { name: 'Join table', exact: true }).click();
    await expect(rival.page.getByRole('heading', { name: 'Your table is open' })).toBeVisible();
  }
  for (const rival of rivals) {
    if (character !== 'medusa') {
      await rival.page.getByRole('button', { name: 'Choose character', exact: true }).click();
      await rival.page
        .getByRole('button', { name: `Inspect ${characterSetup[character].name}`, exact: true })
        .click();
      await rival.page
        .getByRole('button', { name: `Choose ${characterSetup[character].name}`, exact: true })
        .click();
    }
    const ready = rival.page.getByRole('button', { name: 'Ready up', exact: true });
    if (mobile) await ready.tap();
    else await ready.click();
  }
  await expect(host.getByRole('button', { name: 'Start match', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: 'Start match', exact: true }).click();
  for (const rival of rivals) {
    if (mobile) {
      await expect(
        rival.page.getByRole('heading', { name: 'Turn your phone to play' }),
      ).toHaveCount(0);
      await fitsViewport(rival.page);
      await rival.page.setViewportSize({ width: 844, height: 390 });
      await expect(
        rival.page.getByRole('heading', { name: 'Turn your phone to play' }),
      ).toHaveCount(0);
    }
    await expect(
      rival.page.getByRole('heading', { name: "King Solomon's Mine", exact: true }),
    ).toBeVisible();
    await fitsViewport(rival.page);
  }
  if (deploy) {
    for (const { page } of rivals) {
      for (let i = 0; i < characterSetup[character].allies; i++)
        await page
          .getByRole('button', { name: /^Place ally at/ })
          .first()
          .click();
    }
    if (character === 'medusa' || character === 'dracula') {
      await expect(rivals[0].page.getByRole('region', { name: 'Ability choice' })).toBeVisible();
      await skipGaze(rivals[0].page);
    }
    await Promise.all(
      rivals.map(({ page }) =>
        expect(page.locator('main')).toHaveAttribute('data-phase', 'taking-actions'),
      ),
    );
  }
  return rivals;
}
async function skipGaze(page: Page) {
  const skip = page
    .getByRole('region', { name: 'Ability choice' })
    .getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible()) {
    const before = await revision(page);
    await skip.click();
    await changed(page, before);
  }
}
async function finishManeuver(page: Page) {
  const finish = page.getByRole('button', { name: 'Finish Maneuver', exact: true });
  if (await finish.isVisible()) await finish.click();
}
async function endTurn(page: Page, next: Page) {
  await page.getByRole('button', { name: 'End turn', exact: true }).click();
  await expect(next.getByRole('region', { name: 'Ability choice' })).toBeVisible();
  await skipGaze(next);
}
async function revision(page: Page) {
  return Number(await page.locator('main').getAttribute('data-revision'));
}
async function changed(page: Page, before: number) {
  await expect.poll(() => revision(page)).toBeGreaterThan(before);
}
async function maneuver(page: Page, destination?: string) {
  let before = await revision(page);
  await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
  await changed(page, before);
  if (await page.getByRole('button', { name: 'Stay here', exact: true }).isVisible()) {
    before = await revision(page);
    if (destination)
      await page.getByRole('button', { name: `Move to ${destination}`, exact: true }).click();
    else await page.getByRole('button', { name: 'Stay here', exact: true }).click();
    await changed(page, before);
    await finishManeuver(page);
  }
}
async function finishByExhaustion(rivals: Rival[]) {
  // Advance playback between automated decisions; explicit reader interaction is tested separately.
  await Promise.all(rivals.map(({ page }) => page.clock.install()));
  async function readEvents() {
    for (let i = 0; i < 8; i++)
      await Promise.all(rivals.map(({ page }) => page.clock.fastForward(5000)));
  }
  await readEvents();
  const observer = rivals[0].page;
  for (let step = 0; step < 400; step++) {
    if (await observer.getByRole('heading', { name: 'Match complete', exact: true }).isVisible())
      return;
    const phase = await observer.locator('main').getAttribute('data-phase');
    const turn = await observer.locator('main').getAttribute('data-turn');
    const rival = rivals.find((p) => p.name === turn)!;
    if (!rival) throw new Error('No acting rival');
    const page = rival.page;
    const before = await revision(observer);
    await expect(page.locator('main')).toHaveAttribute('data-revision', String(before));
    if (phase === 'discarding') {
      await expect(page.locator('main')).toHaveAttribute('data-phase', 'discarding');
      const count = await page.locator('.game-card').count();
      for (let i = 0; i < count - 7; i++) await page.locator('.game-card').nth(i).click();
      await page.getByRole('button', { name: /^Discard \d+ \/ \d+$/ }).click();
    } else if (phase === 'taking-actions') {
      await expect(page.getByRole('button', { name: 'Maneuver', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
    } else if (phase === 'ability-choice') {
      await skipGaze(page);
    } else if (phase === 'choosing-movement') {
      await expect(page.getByRole('button', { name: 'Stay here', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Finish Maneuver', exact: true }).click();
    } else throw new Error(`Unexpected phase ${phase}`);
    await changed(observer, before);
    await readEvents();
  }
  throw new Error('Match did not finish within 400 decisions');
}
for (const count of [2, 4] as const)
  test(`completes a ${count}-player match in separate authenticated contexts${count === 4 ? ' on phones' : ''}`, async ({
    browser,
  }) => {
    const rivals = await createMatch(browser, count, count === 4, 'medusa');
    try {
      for (const { page } of rivals) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(page.locator('canvas')).toBeVisible();
        await expect
          .poll(() =>
            page
              .locator('canvas')
              .evaluate(
                (canvas) =>
                  canvas instanceof HTMLCanvasElement &&
                  Math.abs(
                    canvas.width -
                      canvas.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, 2),
                  ) < 3,
              ),
          )
          .toBe(true);
      }
      await rivals[0].page.screenshot({
        path: test.info().outputPath(`arena-${count}-initial.png`),
        fullPage: true,
      });
      const firstBadge = rivals[0].page.getByRole('button', { name: /Player details/ }).first();
      await firstBadge.click();
      await expect(rivals[0].page.getByRole('dialog')).toContainText('Discard pile');
      await rivals[0].page.keyboard.press('Escape');
      await expect(firstBadge).toBeFocused();
      if (count === 2) {
        await rivals[0].page.getByRole('button', { name: 'Maneuver', exact: true }).click();
        await expect(rivals[0].page.locator('main')).toHaveAttribute(
          'data-phase',
          'choosing-movement',
        );
        await rivals[0].page.reload();
        await expect(
          rivals[0].page.getByRole('heading', { name: "King Solomon's Mine", exact: true }),
        ).toBeVisible();
        await expect(rivals[0].page.locator('main')).toHaveAttribute(
          'data-phase',
          'choosing-movement',
        );
        await expect(rivals[0].page.locator('.action-notice')).not.toHaveAttribute(
          'data-event',
          /./,
        );
        await rivals[0].page.getByRole('button', { name: 'Move to 11', exact: true }).click();
        await finishManeuver(rivals[0].page);
      }
      if (count === 4) {
        await maneuver(rivals[0].page, '11');
        for (const { page } of rivals) {
          await expect
            .poll(() => seenEvents(page))
            .toEqual(
              expect.arrayContaining([
                expect.stringContaining('Maneuver'),
                expect.stringContaining('On the move'),
              ]),
            );
        }
      }
      await finishByExhaustion(rivals);
      for (const { page } of rivals) {
        await expect(
          page.getByRole('heading', { name: 'Match complete', exact: true }),
        ).toBeVisible();
        await expect(page.locator('.prompt')).toContainText('wins the match');
      }
      await rivals[0].page.screenshot({
        path: test.info().outputPath(`match-${count}-${count === 4 ? 'phone' : 'desktop'}.png`),
        fullPage: true,
      });
      if (count === 4) {
        await rivals[0].page.setViewportSize({ width: 844, height: 390 });
        expect(
          await rivals[0].page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        await expect(rivals[0].page.locator('canvas')).toBeVisible();
        await rivals[0].page.setViewportSize({ width: 390, height: 667 });
        await fitsViewport(rivals[0].page);
        await expect(rivals[0].page.getByLabel('Landscape required')).toBeVisible();
      }
      await rivals[0].page.getByRole('button', { name: 'Return to lobby', exact: true }).click();
      await expect(rivals[0].page.getByRole('heading', { name: 'Find your table' })).toBeVisible();
    } catch (error) {
      for (const { page, name } of rivals) {
        await page
          .screenshot({
            path: test.info().outputPath(`${name}-failure.png`),
            fullPage: true,
            timeout: 3000,
          })
          .catch(() => {});
      }
      console.error(
        await rivals[0].page
          .locator('main')
          .innerText()
          .catch(() => ''),
      );
      throw error;
    } finally {
      await Promise.allSettled(rivals.map(({ context }) => context.close()));
      for (const rival of rivals) expect(rival.errors).toEqual([]);
    }
  });
test('plays a hidden attack and free defense through the interface', async ({ browser }) => {
  const rivals = await createMatch(browser, 2, false, 'medusa', true);
  try {
    const attacker = rivals[0].page;
    const defender = rivals[1].page;
    await attacker.getByRole('button', { name: 'Enable sound', exact: true }).click();
    await maneuver(attacker, '18');
    await endTurn(attacker, defender);
    await expect(defender.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
    await endTurn(defender, attacker);
    await maneuver(attacker, '19');
    await expect(attacker.locator('main')).toHaveAttribute('data-phase', 'taking-actions');
    await expect(attacker.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
    // A shuffled opening may contain no attack card; draw on subsequent turns until one is available.
    for (let i = 0; i < 12; i++) {
      const usable = attacker
        .locator(
          '.game-card[data-card="attack"]:not(:disabled),.game-card[data-card="versatile"]:not(:disabled)',
        )
        .filter({ hasText: /Snipe|Regroup|Feint|Gaze of Stone/ });
      if (await usable.count()) {
        await usable.first().click();
        break;
      }
      await endTurn(attacker, defender);
      await expect(defender.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
      await endTurn(defender, attacker);
      await maneuver(attacker);
    }
    await attacker.getByRole('button', { name: `Target ${rivals[1].name}`, exact: true }).click();
    await attacker.getByRole('button', { name: 'Commit attack', exact: true }).click();
    await expect(defender.getByRole('button', { name: 'Take the hit', exact: true })).toBeVisible();
    for (const { page } of rivals) {
      await expect
        .poll(() => seenEvents(page), { timeout: 30_000 })
        .toEqual(expect.arrayContaining([expect.stringContaining('Attack incoming')]));
      await expect(page.getByRole('button', { name: /Last combat|Match summary/ })).toHaveCount(0);
    }
    const beforeDefense = await revision(defender);
    const defense = defender
      .locator(
        '.game-card[data-card="defense"]:not(:disabled),.game-card[data-card="versatile"]:not(:disabled)',
      )
      .filter({ hasText: /Snipe|Regroup|Feint/ });
    if (await defense.count()) {
      await defense.first().click();
      await defender.getByRole('button', { name: /^Defend with/ }).click();
    } else await defender.getByRole('button', { name: 'Take the hit', exact: true }).click();
    await changed(defender, beforeDefense);
    if ((await defender.locator('main').getAttribute('data-phase')) === 'ability-choice')
      await defender.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect
      .poll(() => seenEvents(attacker), { timeout: 30_000 })
      .toEqual(expect.arrayContaining([expect.stringMatching(/Clash!|Blocked!/)]));
    await attacker.screenshot({ path: test.info().outputPath('combat-effects.png') });
    for (const { page } of rivals) {
      await expect
        .poll(() => seenEvents(page))
        .toEqual(expect.arrayContaining([expect.stringMatching(/Clash!|Blocked!/)]));
    }
    await expect(attacker.locator('main')).toHaveAttribute('data-phase', 'taking-actions');
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
    for (const rival of rivals) expect(rival.errors).toEqual([]);
  }
});

test('login rules, fullscreen, and compact phone pages fit without page scrolling', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 667 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await fitsViewport(page);
    await page.getByRole('button', { name: 'How to play', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Each turn gives you two actions.');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.getByRole('button', { name: 'How to play', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Enter fullscreen' }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.getByRole('button', { name: 'Exit fullscreen' }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.setViewportSize({ width: 320, height: 568 });
    await fitsViewport(page);
    await page.setViewportSize({ width: 667, height: 375 });
    await fitsViewport(page);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('login-landscape.png') });
  } finally {
    await context.close();
  }
});

test('populated room lists paginate and four waiting seats fit a portrait phone', async ({
  browser,
}) => {
  const hosts: Rival[] = [];
  try {
    for (let index = 0; index < 4; index++) {
      const rival = await register(browser, index + 10, true);
      hosts.push(rival);
      await rival.page.getByRole('button', { name: '4 Free-for-all', exact: true }).click();
      await expect(rival.page.getByRole('heading', { name: 'Your table is open' })).toBeVisible();
      await fitsViewport(rival.page);
      if (index === 0)
        await rival.page.screenshot({ path: test.info().outputPath('waiting-phone.png') });
    }
    const visitor = await register(browser, 20, true);
    hosts.push(visitor);
    await expect(visitor.page.getByRole('navigation', { name: 'Room pages' })).toBeVisible();
    await fitsViewport(visitor.page);
    await visitor.page.getByRole('button', { name: 'Next', exact: true }).click();
    await fitsViewport(visitor.page);
    await visitor.page.screenshot({ path: test.info().outputPath('lobby-phone.png') });
    await visitor.page.setViewportSize({ width: 667, height: 375 });
    await visitor.page.screenshot({ path: test.info().outputPath('lobby-landscape.png') });
    await fitsViewport(visitor.page);
  } finally {
    await Promise.allSettled(hosts.map(({ context }) => context.close()));
  }
});

test('Medusa selects and attacks a distant rival through a multicolor space', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'medusa', true);
  try {
    const attacker = rivals[0].page;
    const defender = rivals[1].page;
    await expect(
      attacker.getByRole('group', { name: /29 connected spaces, 7 colored zones and 6 portals/ }),
    ).toBeVisible();
    await attacker.setViewportSize({ width: 667, height: 375 });
    await fitsViewport(attacker);
    // Blue/green passage below the chasm; rival moves to gray/green above it.
    await maneuver(attacker, '23');
    await endTurn(attacker, defender);
    await maneuver(defender, '21');
    await endTurn(defender, attacker);
    await attacker.screenshot({ path: test.info().outputPath('medusa-small-phone.png') });
    await attacker.setViewportSize({ width: 1440, height: 1000 });
    for (let i = 0; i < 12; i++) {
      const usable = attacker
        .locator(
          '.game-card[data-card="attack"]:not(:disabled),.game-card[data-card="versatile"]:not(:disabled)',
        )
        .filter({ hasText: /Snipe|Regroup|Feint|Gaze of Stone/ });
      if (await usable.count()) {
        await usable.first().click();
        break;
      }
      await endTurn(attacker, defender);
      await expect(defender.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
      await endTurn(defender, attacker);
      await maneuver(attacker);
    }
    await expect(
      attacker.getByRole('button', { name: `Target ${rivals[1].name}`, exact: true }),
    ).toHaveAttribute('aria-description', 'Zones: Gray, Green');
    await attacker.screenshot({ path: test.info().outputPath('medusa-range-desktop.png') });
    await attacker.getByRole('button', { name: `Target ${rivals[1].name}`, exact: true }).click();
    await attacker.getByRole('button', { name: 'Commit attack', exact: true }).click();
    await expect(defender.getByRole('button', { name: 'Take the hit', exact: true })).toBeVisible();
    await defender.getByRole('button', { name: 'Take the hit', exact: true }).click();
    await expect(attacker.locator('.action-notice')).toContainText(/Clash!|Blocked!/, {
      timeout: 30_000,
    });
    await attacker.waitForTimeout(500); // The arrow is in flight, before the impact at 850ms.
    await attacker.screenshot({ path: test.info().outputPath('medusa-projectile.png') });
    for (const { page } of rivals) {
      await expect
        .poll(() => seenEvents(page))
        .toEqual(expect.arrayContaining([expect.stringMatching(/Clash!|Blocked!/)]));
    }
    await attacker.reload();
    await expect(attacker.getByRole('group', { name: 'Your fighters' })).toContainText('Medusa');
    await attacker.setViewportSize({ width: 768, height: 900 });
    await fitsViewport(attacker);
    await attacker.screenshot({ path: test.info().outputPath('medusa-range-tablet.png') });
    await attacker.setViewportSize({ width: 844, height: 390 });
    await fitsViewport(attacker);
    await attacker.screenshot({ path: test.info().outputPath('medusa-range-phone.png') });
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
    for (const rival of rivals) expect(rival.errors).toEqual([]);
  }
});

test('explores the illustrated roster on login at desktop and phone sizes', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/');
    const roster = page.getByRole('region', { name: 'Character roster' });
    const fighters = await rosterEntries(page);
    expect(fighters).toEqual(
      expect.arrayContaining([
        ['Medusa', 11],
        ['The Genie', 12],
        ['King Arthur', 16],
        ['Achilles', 12],
        ['Sherlock Holmes', 13],
        ['Dracula', 13],
        ['Robin Hood', 11],
        ['Bigfoot', 11],
        ['Bruce Lee', 17],
      ]),
    );
    for (const [name, designs] of fighters) {
      await roster.getByRole('button', { name: `Inspect ${name}`, exact: true }).click();
      await expect(roster.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(roster.locator('.roster-detail img')).toBeVisible();
      await expect(roster.locator('.roster-detail img')).toHaveJSProperty('complete', true);
      await roster
        .getByRole('button', {
          name: `Explore ${name}’s deck · ${designs} designs`,
          exact: true,
        })
        .click();
      const deck = page.getByRole('dialog', { name: `${name}’s deck`, exact: true });
      await expect(deck.locator('.deck-gallery > button')).toHaveCount(designs);
      for (const card of await deck.locator('.deck-gallery > button').all()) {
        await card.click();
        const detail = page.getByRole('dialog').last();
        await expect(detail.locator('.printed-card')).toBeVisible();
        await expect(detail).not.toContainText('How to play');
        await expect(detail.locator('img')).toHaveJSProperty('complete', true);
        await page.keyboard.press('Escape');
        await expect(card).toBeFocused();
      }
      await deck.locator('.dialog-body').evaluate((body) => (body.scrollTop = 0));
      await page.screenshot({
        path: test.info().outputPath(`deck-${name}.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');

      await fitsViewport(page);
    }
    await roster.getByRole('button', { name: 'Inspect Medusa', exact: true }).click();
    await roster.getByRole('button', { name: 'Inspect Medusa', exact: true }).click();
    await expect(roster).toContainText('Petrifying gaze');
    await page.screenshot({
      path: test.info().outputPath('roster-desktop.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 768, height: 900 });
    await fitsViewport(page);
    await page.screenshot({
      path: test.info().outputPath('roster-tablet.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 667 });
    await fitsViewport(page);
    const explore = page.getByRole('button', {
      name: `Explore ${fighters.length} ${Number(fighters.length) === 1 ? 'character' : 'characters'}`,
      exact: true,
    });
    await explore.tap();
    const dialog = page.getByRole('dialog');
    for (const [name] of fighters) {
      await dialog.getByRole('button', { name: `Inspect ${name}`, exact: true }).tap();
      await expect(dialog.getByRole('heading', { name, exact: true })).toBeInViewport();
    }
    await dialog.getByRole('button', { name: 'Inspect Medusa', exact: true }).tap();
    await expect(dialog).toContainText('Petrifying gaze');
    await dialog
      .getByRole('button', { name: 'Explore Medusa’s deck · 11 designs', exact: true })
      .tap();
    const deck = page.getByRole('dialog', { name: 'Medusa’s deck', exact: true });
    await deck.getByRole('button', { name: 'About Dash, 3 copies', exact: true }).tap();
    await expect(page.getByRole('dialog').last()).toContainText('After combat');
    await page.screenshot({
      path: test.info().outputPath('card-inspector-portrait.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await page.screenshot({
      path: test.info().outputPath('roster-phone.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(explore).toBeFocused();
    await page.setViewportSize({ width: 320, height: 568 });
    await fitsViewport(page);
    await explore.tap();
    await expect(dialog.getByRole('button', { name: 'Inspect Medusa', exact: true })).toBeVisible();
    await fitsViewport(page);
    await page.screenshot({
      path: test.info().outputPath('roster-small-phone.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 667, height: 375 });
    await fitsViewport(page);
    await explore.tap();
    await dialog.getByRole('button', { name: 'Inspect Medusa', exact: true }).tap();
    await expect(dialog).toContainText('Petrifying gaze');
    await page.screenshot({
      path: test.info().outputPath('roster-landscape.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('selecting Medusa preserves readiness and syncs the remaining roster', async ({ browser }) => {
  const rivals = [await register(browser, 40, true), await register(browser, 41, true)];
  const host = rivals[0].page,
    guest = rivals[1].page;
  try {
    await host.getByRole('button', { name: '2 Head to head', exact: true }).tap();
    await expect(host.getByRole('heading', { name: 'Your table is open' })).toBeVisible();
    const id = await host.getByLabel('Room ID').inputValue();
    await guest.getByLabel('Room ID').fill(id);
    await guest.getByRole('button', { name: 'Join table', exact: true }).tap();
    await host.getByRole('button', { name: 'Ready up', exact: true }).tap();
    await host.getByRole('button', { name: 'Choose character', exact: true }).tap();
    await expect(host.getByRole('button', { name: /^Inspect / })).toHaveCount(
      (await rosterEntries(host)).length,
    );
    await host.getByRole('button', { name: 'Choose Medusa', exact: true }).tap();
    await expect(host.getByRole('button', { name: 'Not ready', exact: true })).toBeVisible();
    await expect(guest.locator('.seats')).toContainText('Medusa');
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('inspects compact waiting cards without playing them', async ({ browser }) => {
  const rivals = await createMatch(browser, 2, false, 'medusa');
  try {
    const page = rivals[1].page;
    const before = await revision(page);
    await expect(page.locator('.game-card:not(:disabled)')).toHaveCount(0);
    await expect(page.locator('.card-info')).toHaveCount(0);
    for (const [width, height] of [
      [1440, 1000],
      [768, 900],
      [390, 667],
      [844, 390],
      [667, 375],
    ]) {
      await page.setViewportSize({ width, height });
      await fitsViewport(page);
      await expect(page.locator('.compact-card')).toHaveCount(5);
      await page.locator('.compact-card').first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('.card-art')).toBeVisible();
      const effect = dialog.locator('.card-description');
      if (await effect.count())
        expect(await effect.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
      await page.keyboard.press('Escape');
      expect(await revision(page)).toBe(before);
      await expect(page.locator('.game-card[aria-pressed="true"]')).toHaveCount(0);
    }
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('crosses a portal, preserves its destination on reconnect and explores the larger map', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'medusa', true);
  const page = rivals[0].page;
  try {
    await expect(page.getByLabel('Map zones')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Zoom into map|Fit entire map/ })).toHaveCount(0);
    await expect(page.locator('.badge-movement')).toHaveText(['3Move', '3Move']);
    await page.locator('.player-badge').first().click();
    await expect(page.getByRole('dialog').locator('.player-stats')).toContainText('3Movement');
    await page.keyboard.press('Escape');
    await page.screenshot({ path: test.info().outputPath('map-desktop.png') });
    await maneuver(page, '11');
    await expect(page.locator('.action-notice')).toContainText('On the move', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
    const portal = page.getByRole('button', { name: 'Move to 18', exact: true });
    await expect(portal).toHaveAttribute('aria-description', /Portal: move to any other portal/);
    await portal.click();
    await finishManeuver(page);
    await expect(page.locator('.action-notice')).toContainText('Through the rift', {
      timeout: 30_000,
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: test.info().outputPath('portal-travel.png') });
    await page.reload();
    await skipGaze(rivals[1].page);
    await endTurn(rivals[1].page, page);
    await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Move to 20', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stay here', exact: true }).click();
    await finishManeuver(page);
    for (const [width, height, label] of [
      [768, 900, 'tablet'],
      [844, 390, 'phone'],
      [667, 375, 'small-phone'],
    ] as const) {
      await page.setViewportSize({ width, height });
      await fitsViewport(page);
      await expect(page.locator('.arena')).toHaveCSS('transform', 'none');
      for (const badge of await page.locator('.badge-movement').all())
        await expect(badge).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`map-${label}.png`) });
    }
    expect(rivals.flatMap((rival) => rival.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('boosts a Maneuver once for the hero and all allies, updates ranges and reconnects', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'medusa');
  const page = rivals[0].page;
  try {
    await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
    await expect(page.locator('.game-card:not(:disabled)')).toHaveCount(6);
    const picker = page.getByRole('group', { name: 'Your fighters' });
    await expect(picker.getByRole('button')).toHaveCount(4);
    const fighters = await picker.getByRole('button').allTextContents();
    expect(fighters).toHaveLength(4);
    const before: Record<string, string[]> = {};
    for (const fighter of fighters) {
      await picker.getByRole('button', { name: fighter, exact: true }).click();
      before[fighter] = await page
        .getByRole('button', { name: /^Move to / })
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')!));
    }
    const card = page.locator('.game-card').first();
    const amount = Number((await card.locator('.card-boost').innerText()).replace('BOOST ', ''));
    await card.click();
    await expect(
      page.getByRole('button', { name: `Boost movement +${amount}`, exact: true }),
    ).toBeVisible();
    for (const [width, height, label] of [
      [1440, 1000, 'desktop'],
      [768, 900, 'tablet'],
      [844, 390, 'phone'],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(
        page.getByRole('button', { name: `Boost movement +${amount}`, exact: true }),
      ).toBeInViewport();
      const value = await card.locator('.card-boost').boundingBox();
      const bounds = await card.boundingBox();
      const finish = await page
        .getByRole('button', { name: 'Finish Maneuver', exact: true })
        .boundingBox();
      expect(finish!.y + finish!.height).toBeLessThanOrEqual(bounds!.y);
      expect(value!.y + value!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
      await fitsViewport(page);
      await page.screenshot({
        path: test.info().outputPath(`boost-selection-${label}.png`),
        animations: 'disabled',
      });
    }
    await page.getByRole('button', { name: `Boost movement +${amount}`, exact: true }).click();
    await expect(page.locator('.game-card:not(:disabled)')).toHaveCount(0);
    await expect(page.locator('.compact-card')).toHaveCount(5);
    await expect(page.locator('.action-count')).toContainText('1 actions');
    const committed = await revision(page);
    await page.reload();
    await expect(page.locator('main')).toHaveAttribute('data-revision', String(committed));
    for (const fighter of fighters) {
      await picker.getByRole('button', { name: fighter, exact: true }).click();
      await expect(page.locator('.fighter-controls')).toContainText(`move up to ${3 + amount}`);
      const after = await page
        .getByRole('button', { name: /^Move to / })
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')!));
      expect(after.length).toBeGreaterThan(before[fighter].length);
    }
    for (const [width, height, label] of [
      [1440, 1000, 'desktop'],
      [768, 900, 'tablet'],
      [844, 390, 'phone'],
    ] as const) {
      await page.setViewportSize({ width, height });
      await fitsViewport(page);
      await page.screenshot({
        path: test.info().outputPath(`boost-maneuver-${label}.png`),
        animations: 'disabled',
      });
    }
    const fighter = fighters.at(-1)!;
    const expanded = await page
      .getByRole('button', { name: /^Move to / })
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')!));
    const newSpace = expanded.find((label) => !before[fighter].includes(label))!;
    expect(newSpace).toBeTruthy();
    await page.getByRole('button', { name: newSpace, exact: true }).click();
    await expect(page.locator('.fighter-controls')).toContainText('3 fighters left');
    await expect(page.locator('.fighter-controls')).toContainText(`move up to ${3 + amount}`);
    await page.getByRole('button', { name: 'Finish Maneuver', exact: true }).click();
    await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
    await expect(page.locator('.fighter-controls')).toContainText('move up to 3');
    await expect(page.locator('.game-card:not(:disabled)')).toHaveCount(6);
    await page.getByRole('button', { name: 'Stay here', exact: true }).click();
    await expect(page.locator('.game-card:not(:disabled)')).toHaveCount(0);
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects Medusa over real sockets, deploys three Harpies and reconnects shared movement', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'medusa', false, false);
  const page = rivals[0].page,
    opponent = rivals[1].page;
  try {
    const picker = page.getByRole('group', { name: 'Your fighters', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['Harpy 1', 'Harpy 2', 'Harpy 3']);
    await picker.getByRole('button', { name: 'Harpy 3', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page
      .getByRole('button', { name: /^Place ally at/ })
      .first()
      .click();
    await page.reload();
    await expect(picker.getByRole('button')).toHaveText(['Harpy 1', 'Harpy 2']);
    for (let i = 0; i < 2; i++)
      await page
        .getByRole('button', { name: /^Place ally at/ })
        .first()
        .click();
    for (let i = 0; i < 3; i++)
      await opponent
        .getByRole('button', { name: /^Place ally at/ })
        .first()
        .click();
    const choice = page.getByRole('region', { name: 'Ability choice' });
    await expect(choice).toContainText('Petrifying gaze');
    await expect(opponent.getByRole('region', { name: 'Ability choice' })).toHaveCount(0);
    await page.reload();
    await choice.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
    await picker.getByRole('button', { name: 'Harpy 3', exact: true }).click();
    await page.getByRole('button', { name: 'Stay here', exact: true }).click();
    await page.reload();
    await expect(page.locator('.fighter-controls')).toContainText('3 fighters left');
    await expect(picker.getByRole('button', { name: 'Harpy 3', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 844, height: 390 });
    await fitsViewport(page);
    await page.screenshot({
      path: test.info().outputPath('medusa-socket-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Finish Maneuver', exact: true }).click();
    await expect(picker.getByRole('button')).toHaveText([
      'Medusa',
      'Harpy 1',
      'Harpy 2',
      'Harpy 3',
    ]);
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects Arthur over sockets, deploys Merlin and reconnects on a landscape phone', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'king-arthur');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'Your fighters', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['King Arthur', 'Merlin 1']);
    await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
    await picker.getByRole('button', { name: 'Merlin 1', exact: true }).click();
    await page.getByRole('button', { name: 'Stay here', exact: true }).click();
    await page.reload();
    await expect(page.locator('.fighter-controls')).toContainText('1 fighter');
    await page.setViewportSize({ width: 844, height: 390 });
    await fitsViewport(page);
    await page.screenshot({
      path: test.info().outputPath('arthur-socket-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Finish Maneuver', exact: true }).click();
    await expect(picker.getByRole('button')).toHaveText(['King Arthur', 'Merlin 1']);
    await expect(
      rivals[1].page.getByRole('complementary', { name: 'Players', exact: true }),
    ).toContainText('Merlin 1');
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects Achilles over sockets, deploys Patroclus and restores his shared Maneuver on phone', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'achilles');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'Your fighters', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['Achilles', 'Patroclus 1']);
    await page.screenshot({
      path: test.info().outputPath('achilles-socket-desktop.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
    await picker.getByRole('button', { name: 'Patroclus 1', exact: true }).click();
    await page.getByRole('button', { name: 'Stay here', exact: true }).click();
    await page.reload();
    await expect(page.locator('.fighter-controls')).toContainText('1 fighter');
    await page.setViewportSize({ width: 844, height: 390 });
    await fitsViewport(page);
    await page.getByRole('button', { name: 'Finish Maneuver', exact: true }).click();
    await expect(picker.getByRole('button')).toHaveText(['Achilles', 'Patroclus 1']);
    await expect(
      rivals[1].page.getByRole('complementary', { name: 'Players', exact: true }),
    ).toContainText('Patroclus 1');
    await page.screenshot({
      path: test.info().outputPath('achilles-socket-phone.png'),
      animations: 'disabled',
    });
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects four Holmes over sockets, deploys numbered Watsons and restores a phone Maneuver', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'sherlock-holmes');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'Your fighters', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['Sherlock Holmes', 'Dr. Watson 1']);
    for (const rival of rivals) {
      await expect(
        rival.page.getByRole('complementary', { name: 'Players', exact: true }),
      ).toContainText('Dr. Watson 1');
      await fitsViewport(rival.page);
    }
    await page.getByRole('button', { name: 'Maneuver', exact: true }).tap();
    await picker.getByRole('button', { name: 'Dr. Watson 1', exact: true }).tap();
    await page.getByRole('button', { name: 'Stay here', exact: true }).tap();
    await page.reload();
    await expect(page.locator('.fighter-controls')).toContainText('1 fighter');
    await page.screenshot({
      path: test.info().outputPath('holmes-four-seats-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Finish Maneuver', exact: true }).tap();
    await expect(picker.getByRole('button')).toHaveText(['Sherlock Holmes', 'Dr. Watson 1']);
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects four Draculas over sockets, deploys numbered Sisters and restores a phone Maneuver', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'dracula');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'Your fighters', exact: true });
    await expect(picker.getByRole('button')).toHaveText([
      'Dracula',
      'Sister 1',
      'Sister 2',
      'Sister 3',
    ]);
    for (const rival of rivals) {
      await expect(
        rival.page.getByRole('complementary', { name: 'Players', exact: true }),
      ).toContainText('Sister 1');
      await fitsViewport(rival.page);
    }
    await page.getByRole('button', { name: 'Maneuver', exact: true }).tap();
    await picker.getByRole('button', { name: 'Sister 1', exact: true }).tap();
    await page.getByRole('button', { name: 'Stay here', exact: true }).tap();
    await page.reload();
    await expect(page.locator('.fighter-controls')).toContainText('3 fighters');
    await page.screenshot({
      path: test.info().outputPath('dracula-four-seats-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Finish Maneuver', exact: true }).tap();
    await expect(picker.getByRole('button')).toHaveText([
      'Dracula',
      'Sister 1',
      'Sister 2',
      'Sister 3',
    ]);
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects Bigfoot over sockets, deploys The Jackalope and restores his shared Maneuver on phone', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'bigfoot');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'Your fighters', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['Bigfoot', 'The Jackalope 1']);
    await page.screenshot({
      path: test.info().outputPath('bigfoot-socket-desktop.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Maneuver', exact: true }).click();
    await picker.getByRole('button', { name: 'The Jackalope 1', exact: true }).click();
    await page.getByRole('button', { name: 'Stay here', exact: true }).click();
    await page.reload();
    await expect(page.locator('.fighter-controls')).toContainText('1 fighter');
    await page.setViewportSize({ width: 844, height: 390 });
    await fitsViewport(page);
    await page.getByRole('button', { name: 'Finish Maneuver', exact: true }).click();
    await expect(picker.getByRole('button')).toHaveText(['Bigfoot', 'The Jackalope 1']);
    await expect(
      rivals[1].page.getByRole('complementary', { name: 'Players', exact: true }),
    ).toContainText('The Jackalope 1');
    await page.screenshot({
      path: test.info().outputPath('bigfoot-socket-phone.png'),
      animations: 'disabled',
    });
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects Robin Hood over sockets, deploys all sixteen Outlaws and reconnects on phone', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'robin-hood');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'Your fighters', exact: true });
    const labels = ['Robin Hood', 'Outlaw 1', 'Outlaw 2', 'Outlaw 3', 'Outlaw 4'];
    await expect(picker.getByRole('button')).toHaveText(labels);
    for (const rival of rivals) {
      await expect(
        rival.page.getByRole('complementary', { name: 'Players', exact: true }),
      ).toContainText('Outlaw 4');
      await fitsViewport(rival.page);
    }
    await page.getByRole('button', { name: 'Maneuver', exact: true }).tap();
    await picker.getByRole('button', { name: 'Outlaw 4', exact: true }).tap();
    await page.getByRole('button', { name: 'Stay here', exact: true }).tap();
    await page.reload();
    await expect(page.locator('.fighter-controls')).toContainText('4 fighters');
    await expect(page.locator('.pixi-surface canvas')).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: test.info().outputPath('robin-sixteen-outlaws-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Finish Maneuver', exact: true }).tap();
    await expect(picker.getByRole('button')).toHaveText(labels);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fitsViewport(page);
    await page.screenshot({
      path: test.info().outputPath('robin-socket-desktop.png'),
      animations: 'disabled',
    });
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('Bruce Lee starts a solo four-seat match and resumes Maneuver after socket reconnect', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'bruce-lee');
  try {
    const host = rivals[0].page;
    await host.getByRole('button', { name: /^Maneuver/ }).click();
    await expect(host.locator('main')).toHaveAttribute('data-phase', 'choosing-movement');
    await host.reload();
    await expect(host.locator('main')).toHaveAttribute('data-phase', 'choosing-movement');
    await finishManeuver(host);
    for (const { page } of rivals) {
      await expect(page.locator('main')).toHaveAttribute('data-phase', 'taking-actions');
      await fitsViewport(page);
    }
    await host.screenshot({
      path: test.info().outputPath('bruce-lee-four-seats-phone.png'),
      animations: 'disabled',
    });
    for (const { errors } of rivals) expect(errors).toEqual([]);
  } finally {
    for (const rival of rivals) await rival.context.close();
  }
});
