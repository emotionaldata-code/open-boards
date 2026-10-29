import { contentText } from '../../apps/client/src/localization/text';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
const characterSetup: Record<string, { name: string; allies: number }> = {
  eredin: { name: 'Eredin', allies: 4 },
  philippa: { name: 'Philippa', allies: 1 },
  'geralt-of-rivia': { name: 'Geralt of Rivia', allies: 1 },
  medusa: { name: 'Medusa', allies: 3 },
  'darth-vader': { name: 'Darth Vader', allies: 0 },
  'bruce-lee': { name: 'Bruce Lee', allies: 0 },
  'invisible-man': { name: 'Invisible Man', allies: 0 },
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
  if (await page.locator('.shell.in-match').count())
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
      if (acknowledgement?.textContent === 'Conferma') acknowledgement.click();
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
  await expect(page.getByRole('button', { name: 'Guida', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Prima partita? Crea un account' }).click();
  await page.getByLabel('Nome utente', { exact: true }).fill(name);
  await page.getByLabel('Password', { exact: true }).fill('a-secure-test-password');
  await page.getByRole('button', { name: 'Crea account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trova il tuo tavolo' })).toBeVisible();
  await fitsViewport(page);
  await expect(page.getByRole('button', { name: 'Guida', exact: true })).toBeVisible();
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
      name: count === 2 ? '2 Duello' : '4 Tutti contro tutti',
      exact: true,
    })
    .click();
  await expect(host.getByRole('heading', { name: 'Il tuo tavolo è aperto' })).toBeVisible();
  await fitsViewport(host);
  const id = await host.getByLabel('Codice stanza').inputValue();
  for (const rival of rivals.slice(1)) {
    await rival.page.getByLabel('Codice stanza').fill(id);
    await rival.page.getByRole('button', { name: 'Entra al tavolo', exact: true }).click();
    await expect(rival.page.getByRole('heading', { name: 'Il tuo tavolo è aperto' })).toBeVisible();
  }
  for (const rival of rivals) {
    if (character !== 'medusa') {
      await rival.page.getByRole('button', { name: 'Scegli personaggio', exact: true }).click();
      await rival.page
        .getByRole('button', {
          name: `Esamina ${contentText(characterSetup[character].name)}`,
          exact: true,
        })
        .click();
      await rival.page
        .getByRole('button', {
          name: `Scegli ${contentText(characterSetup[character].name)}`,
          exact: true,
        })
        .click();
    }
    const ready = rival.page.getByRole('button', { name: 'Sono pronto', exact: true });
    if (mobile) await ready.tap();
    else await ready.click();
  }
  await expect(host.getByRole('button', { name: 'Avvia partita', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: 'Avvia partita', exact: true }).click();
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
      rival.page.getByRole('heading', { name: 'Le miniere di re Salomone', exact: true }),
    ).toBeVisible();
    await fitsViewport(rival.page);
  }
  if (deploy) {
    for (const { page } of rivals) {
      for (let i = 0; i < characterSetup[character].allies; i++)
        await page
          .getByRole('button', { name: /^Colloca alleato in/ })
          .first()
          .click();
    }
    if (character === 'medusa' || character === 'dracula') {
      await expect(rivals[0].page.locator('.hand-panel:has(.ability-options)')).toBeVisible();
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
    .locator('.hand-panel:has(.ability-options)')
    .getByRole('button', { name: 'Salta', exact: true });
  if (await skip.isVisible()) {
    const before = await revision(page);
    await skip.click({ timeout: 30_000 });
    await changed(page, before);
  }
}
async function finishManovra(page: Page) {
  const finish = page.getByRole('button', { name: 'Termina manovra', exact: true });
  if (await finish.isVisible()) {
    const before = await revision(page);
    await finish.click();
    await changed(page, before);
  }
}
async function discardToLimit(page: Page) {
  if ((await page.locator('main').getAttribute('data-phase')) !== 'discarding') return;
  const before = await revision(page);
  const count = await page.locator('.game-card').count();
  for (let i = 0; i < count - 7; i++) await page.locator('.game-card').nth(i).click();
  if (count - 7 > 1) await page.getByRole('button', { name: /^Scarta \d+ \/ \d+$/ }).click();
  await changed(page, before);
}
async function endTurn(page: Page, next: Page) {
  const actor = await page.locator('main').getAttribute('data-turn');
  while ((await page.locator('main').getAttribute('data-turn')) === actor) {
    if ((await page.locator('main').getAttribute('data-phase')) === 'discarding')
      await discardToLimit(page);
    else await maneuver(page);
  }
  await expect(next.locator('.hand-panel:has(.ability-options)')).toBeVisible();
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
  await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
  await changed(page, before);
  if (await page.locator('button.fighter-hit[aria-pressed="true"]').isVisible()) {
    before = await revision(page);
    if (destination)
      await page.getByRole('button', { name: `Muovi in ${destination}`, exact: true }).click();
    else await page.locator('button.fighter-hit[aria-pressed="true"]').click();
    await changed(page, before);
    await finishManovra(page);
  }
}
async function finishByEsaurimento(rivals: Rival[]) {
  // Advance playback between automated decisions; explicit reader interaction is tested separately.
  await Promise.all(rivals.map(({ page }) => page.clock.install()));
  async function readEvents() {
    for (let i = 0; i < 8; i++)
      await Promise.all(rivals.map(({ page }) => page.clock.fastForward(5000)));
  }
  await readEvents();
  const observer = rivals[0].page;
  for (let step = 0; step < 400; step++) {
    if (await observer.getByRole('heading', { name: 'Partita conclusa', exact: true }).isVisible())
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
      if (count - 7 > 1) await page.getByRole('button', { name: /^Scarta \d+ \/ \d+$/ }).click();
    } else if (phase === 'taking-actions') {
      await expect(
        page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    } else if (phase === 'ability-choice') {
      await skipGaze(page);
    } else if (phase === 'choosing-movement') {
      await expect(page.locator('button.fighter-hit[aria-pressed="true"]')).toBeVisible();
      await page.getByRole('button', { name: 'Termina manovra', exact: true }).click();
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
    test.setTimeout(count === 4 ? 600_000 : 180_000);
    const rivals = await createMatch(browser, count, count === 4, 'medusa');
    try {
      for (const { page } of rivals) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(page.locator('.arena canvas')).toBeVisible();
        await expect(page.getByRole('button', { name: 'End turn', exact: true })).toHaveCount(0);
        await expect
          .poll(() =>
            page
              .locator('.arena canvas')
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
      const firstBadge = rivals[0].page.getByRole('button', { name: /Dettagli giocatore/ }).first();
      await firstBadge.click();
      await expect(rivals[0].page.getByRole('dialog')).toContainText('Scarti');
      await rivals[0].page.keyboard.press('Escape');
      await expect(firstBadge).toBeFocused();
      if (count === 2) {
        await rivals[0].page
          .getByRole('button', { name: 'Manovra · pesca una carta', exact: true })
          .click();
        await expect(rivals[0].page.locator('main')).toHaveAttribute(
          'data-phase',
          'choosing-movement',
        );
        await rivals[0].page.reload();
        await expect(
          rivals[0].page.getByRole('heading', { name: 'Le miniere di re Salomone', exact: true }),
        ).toBeVisible();
        await expect(rivals[0].page.locator('main')).toHaveAttribute(
          'data-phase',
          'choosing-movement',
        );
        await expect(rivals[0].page.locator('.action-notice')).not.toHaveAttribute(
          'data-event',
          /./,
        );
        await rivals[0].page.getByRole('button', { name: 'Muovi in 11', exact: true }).click();
        await finishManovra(rivals[0].page);
        await expect(rivals[0].page.locator('main')).toHaveAttribute('data-turn', rivals[0].name);
        await expect(rivals[0].page.locator('.action-count')).toHaveText('1 actions');
      }
      if (count === 4) {
        await maneuver(rivals[0].page, '11');
        for (const { page } of rivals) {
          await expect
            .poll(() => seenEvents(page))
            .toEqual(
              expect.arrayContaining([
                expect.stringContaining('Manovra'),
                expect.stringContaining('In movimento'),
              ]),
            );
        }
      }
      await finishByEsaurimento(rivals);
      for (const { page } of rivals) {
        await expect(
          page.getByRole('heading', { name: 'Partita conclusa', exact: true }),
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
        await expect(rivals[0].page.locator('.arena canvas')).toBeVisible();
        await rivals[0].page.setViewportSize({ width: 390, height: 667 });
        await fitsViewport(rivals[0].page);
        await expect(rivals[0].page.getByLabel('Landscape required')).toHaveCount(0);
        await expect(rivals[0].page.locator('.arena canvas')).toBeVisible();
      }
      await rivals[0].page.getByRole('button', { name: 'Torna alla lobby', exact: true }).click();
      await expect(
        rivals[0].page.getByRole('heading', { name: 'Trova il tuo tavolo' }),
      ).toBeVisible();
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
    await attacker.getByRole('button', { name: 'Attiva audio', exact: true }).click();
    await maneuver(attacker, '18');
    await endTurn(attacker, defender);
    await expect(
      defender.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }),
    ).toBeVisible();
    await endTurn(defender, attacker);
    await maneuver(attacker, '19');
    await expect(attacker.locator('main')).toHaveAttribute('data-phase', 'taking-actions');
    await expect(
      attacker.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }),
    ).toBeVisible();
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
      await expect(
        defender.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }),
      ).toBeVisible();
      await endTurn(defender, attacker);
      await maneuver(attacker);
    }
    await attacker
      .getByRole('button', {
        name: new RegExp(`^Bersaglio .*\\(${contentText(rivals[1].name)}\\)$`),
      })
      .first()
      .click();
    await expect(
      defender.getByRole('button', { name: 'Subisci il colpo', exact: true }),
    ).toBeVisible();
    for (const { page } of rivals) {
      await expect
        .poll(() => seenEvents(page), { timeout: 30_000 })
        .toEqual(expect.arrayContaining([expect.stringContaining('Attacco in arrivo')]));
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
    } else await defender.getByRole('button', { name: 'Subisci il colpo', exact: true }).click();
    await changed(defender, beforeDefense);
    if ((await defender.locator('main').getAttribute('data-phase')) === 'ability-choice')
      await skipGaze(defender);
    await expect
      .poll(() => seenEvents(attacker), { timeout: 30_000 })
      .toEqual(expect.arrayContaining([expect.stringMatching(/Scontro!|Parato!/)]));
    await attacker.screenshot({ path: test.info().outputPath('combat-effects.png') });
    for (const { page } of rivals) {
      await expect
        .poll(() => seenEvents(page))
        .toEqual(expect.arrayContaining([expect.stringMatching(/Scontro!|Parato!/)]));
    }
    await discardToLimit(attacker);
    await skipGaze(defender);
    await expect(defender.locator('main')).toHaveAttribute('data-turn', rivals[1].name);
    await expect(defender.locator('main')).toHaveAttribute('data-phase', 'taking-actions');
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
    for (const rival of rivals) expect(rival.errors).toEqual([]);
  }
});

test('login prioritizes access, supports fullscreen and scrolls outside matches', async ({
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
    await page.getByRole('button', { name: 'Guida', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Hai due azioni da usare');
    await page.getByRole('button', { name: 'Chiudi finestra' }).click();
    await expect(page.getByRole('button', { name: 'Guida', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Schermo intero' }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.getByRole('button', { name: 'Esci da schermo intero' }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.setViewportSize({ width: 320, height: 568 });
    await fitsViewport(page);
    await page.setViewportSize({ width: 667, height: 375 });
    await fitsViewport(page);
    await page.getByRole('button', { name: 'Accedi', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Accedi', exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('login-landscape.png') });
  } finally {
    await context.close();
  }
});

test('populated room lists paginate and four waiting seats remain accessible on phone', async ({
  browser,
}) => {
  const hosts: Rival[] = [];
  try {
    for (let index = 0; index < 4; index++) {
      const rival = await register(browser, index + 10, true);
      hosts.push(rival);
      await rival.page.getByRole('button', { name: '4 Tutti contro tutti', exact: true }).click();
      await expect(
        rival.page.getByRole('heading', { name: 'Il tuo tavolo è aperto' }),
      ).toBeVisible();
      await fitsViewport(rival.page);
      if (index === 0)
        await rival.page.screenshot({ path: test.info().outputPath('waiting-phone.png') });
    }
    const visitor = await register(browser, 20, true);
    hosts.push(visitor);
    await expect(
      visitor.page.getByRole('navigation', { name: 'Pagine delle stanze' }),
    ).toBeVisible();
    await fitsViewport(visitor.page);
    await visitor.page.getByRole('button', { name: 'Successiva', exact: true }).click();
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
      attacker.getByRole('group', { name: /29 caselle collegate, 7 zone colorate e 6 portali/ }),
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
      await expect(
        defender.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }),
      ).toBeVisible();
      await endTurn(defender, attacker);
      await maneuver(attacker);
    }
    await expect(
      attacker
        .getByRole('button', {
          name: new RegExp(`^Bersaglio .*\\(${contentText(rivals[1].name)}\\)$`),
        })
        .first(),
    ).toHaveAttribute('aria-description', 'Zone: Gray, Green');
    await attacker.screenshot({ path: test.info().outputPath('medusa-range-desktop.png') });
    await attacker
      .getByRole('button', {
        name: new RegExp(`^Bersaglio .*\\(${contentText(rivals[1].name)}\\)$`),
      })
      .first()
      .click();
    await expect(
      defender.getByRole('button', { name: 'Subisci il colpo', exact: true }),
    ).toBeVisible();
    await defender.getByRole('button', { name: 'Subisci il colpo', exact: true }).click();
    await expect(attacker.locator('.action-notice')).toContainText(/Scontro!|Parato!/, {
      timeout: 30_000,
    });
    await attacker.waitForTimeout(500); // The arrow is in flight, before the impact at 850ms.
    await attacker.screenshot({ path: test.info().outputPath('medusa-projectile.png') });
    for (const { page } of rivals) {
      await expect
        .poll(() => seenEvents(page))
        .toEqual(expect.arrayContaining([expect.stringMatching(/Scontro!|Parato!/)]));
    }
    await attacker.reload();
    await expect(attacker.getByRole('group', { name: 'I tuoi combattenti' })).toContainText(
      'Medusa',
    );
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
    const roster = page.getByRole('region', { name: 'Personaggi disponibili' });
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
        ['Invisible Man', 14],
        ['Geralt of Rivia', 15],
        ['Darth Vader', 12],
        ['Alice', 15],
        ['Philippa', 13],
      ]),
    );
    for (const [name, designs] of fighters) {
      await roster
        .getByRole('button', { name: `Esamina ${contentText(name)}`, exact: true })
        .click();
      await expect(
        roster.getByRole('heading', { name: contentText(name), exact: true }),
      ).toBeVisible();
      await expect(roster.locator('.roster-detail img')).toBeVisible();
      await expect(roster.locator('.roster-detail img')).toHaveJSProperty('complete', true);
      await roster
        .getByRole('button', {
          name: `Mazzo di ${contentText(name)} · ${designs} carte diverse`,
          exact: true,
        })
        .click();
      const deck = page.getByRole('dialog', { name: `Mazzo di ${contentText(name)}`, exact: true });
      await expect(deck.locator('.deck-gallery > button')).toHaveCount(designs);
      for (const card of await deck.locator('.deck-gallery > button').all()) {
        await card.click();
        const detail = page.getByRole('dialog').last();
        await expect(detail.locator('.printed-card')).toBeVisible();
        await expect(detail).not.toContainText('Guida');
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
    await roster.getByRole('button', { name: 'Esamina Medusa', exact: true }).click();
    await roster.getByRole('button', { name: 'Esamina Medusa', exact: true }).click();
    await expect(roster).toContainText('Sguardo pietrificante');
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
    for (const viewport of [
      { width: 390, height: 667 },
      { width: 320, height: 568 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => scrollTo(0, 0));
      if (viewport.height > 600)
        await expect(page.getByRole('button', { name: 'Accedi', exact: true })).toBeInViewport();
      for (const [name] of fighters) {
        await roster
          .getByRole('button', { name: `Esamina ${contentText(name)}`, exact: true })
          .tap();
        await expect(
          roster.getByRole('heading', { name: contentText(name), exact: true }),
        ).toBeInViewport();
      }
      await roster.getByRole('button', { name: 'Esamina Medusa', exact: true }).tap();
      await roster.locator('summary').click();
      await expect(roster).toContainText('Sguardo pietrificante');
      await roster
        .getByRole('button', { name: 'Mazzo di Medusa · 11 carte diverse', exact: true })
        .tap();
      const deck = page.getByRole('dialog', { name: 'Mazzo di Medusa', exact: true });
      await deck.getByRole('button', { name: 'Dettagli di Scatto, 3 copie', exact: true }).tap();
      await expect(page.getByRole('dialog').last()).toContainText('Dopo il combattimento');
      await page.screenshot({
        path: test.info().outputPath(`card-inspector-${viewport.width}.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await fitsViewport(page);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: test.info().outputPath(`roster-${viewport.width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
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
    await host.getByRole('button', { name: '2 Duello', exact: true }).tap();
    await expect(host.getByRole('heading', { name: 'Il tuo tavolo è aperto' })).toBeVisible();
    const id = await host.getByLabel('Codice stanza').inputValue();
    await guest.getByLabel('Codice stanza').fill(id);
    await guest.getByRole('button', { name: 'Entra al tavolo', exact: true }).tap();
    await host.getByRole('button', { name: 'Sono pronto', exact: true }).tap();
    await host.getByRole('button', { name: 'Scegli personaggio', exact: true }).tap();
    await expect(host.getByRole('button', { name: /^Esamina / })).toHaveCount(
      (await rosterEntries(host)).length,
    );
    await host.getByRole('button', { name: 'Scegli Medusa', exact: true }).tap();
    await expect(host.getByRole('button', { name: 'Non pronto', exact: true })).toBeVisible();
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
    await expect(page.locator('.badge-movement')).toHaveText(['3Movimento', '3Movimento']);
    await page.locator('.player-badge').first().click();
    await expect(page.getByRole('dialog').locator('.player-stats')).toContainText('3Movimento');
    await page.keyboard.press('Escape');
    await page.screenshot({ path: test.info().outputPath('map-desktop.png') });
    await maneuver(page, '11');
    await expect(page.locator('.action-notice')).toContainText('In movimento', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    const portal = page.getByRole('button', { name: 'Muovi in 18', exact: true });
    await expect(portal).toHaveAttribute('aria-description', /Portal: move to any other portal/);
    await portal.click();
    await finishManovra(page);
    await expect(page.locator('.action-notice')).toContainText('Attraverso il portale', {
      timeout: 30_000,
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: test.info().outputPath('portal-travel.png') });
    await page.reload();
    await skipGaze(rivals[1].page);
    await endTurn(rivals[1].page, page);
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Muovi in 20', exact: true })).toBeVisible();
    await page.locator('button.fighter-hit[aria-pressed="true"]').click();
    await finishManovra(page);
    for (const [width, height, label] of [
      [768, 900, 'tablet'],
      [844, 390, 'phone'],
      [667, 375, 'small-phone'],
    ] as const) {
      await page.setViewportSize({ width, height });
      await fitsViewport(page);
      await expect(page.locator('.arena')).toHaveCSS('transform', 'none');
      for (const badge of await page.locator('.player-badge').all()) {
        await expect(badge).toBeInViewport();
        await expect(badge).toHaveAccessibleName(/3 movement/);
      }
      await page.screenshot({ path: test.info().outputPath(`map-${label}.png`) });
    }
    expect(rivals.flatMap((rival) => rival.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('boosts a Manovra once for the hero and all allies, updates ranges and reconnects', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'medusa');
  const page = rivals[0].page;
  try {
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    await expect(page.locator('.game-card:not(:disabled)')).toHaveCount(6);
    const picker = page.getByRole('group', { name: 'I tuoi combattenti' });
    await expect(picker.getByRole('button')).toHaveCount(4);
    const fighters = await picker.getByRole('button').allTextContents();
    expect(fighters).toHaveLength(4);
    const before: Record<string, string[]> = {};
    for (const fighter of fighters) {
      if (
        (await picker
          .getByRole('button', { name: fighter, exact: true })
          .getAttribute('aria-pressed')) !== 'true'
      )
        await picker.getByRole('button', { name: fighter, exact: true }).click();
      before[fighter] = await page
        .getByRole('button', { name: /^Muovi in / })
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')!));
    }
    const card = page.locator('.game-card').first();
    const amount = Number((await card.locator('.card-boost').innerText()).replace('BOOST ', ''));
    await expect(
      page.getByRole('button', { name: new RegExp(`^Potenzia movimento \\+${amount} ·`) }).first(),
    ).toBeVisible();
    for (const [width, height, label] of [
      [1440, 1000, 'desktop'],
      [768, 900, 'tablet'],
      [844, 390, 'phone'],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(
        page
          .getByRole('button', { name: new RegExp(`^Potenzia movimento \\+${amount} ·`) })
          .first(),
      ).toBeInViewport();
      const value = await card.locator('.card-boost').boundingBox();
      const bounds = await card.boundingBox();
      const finish = await page
        .getByRole('button', { name: 'Termina manovra', exact: true })
        .boundingBox();
      expect(finish!.y + finish!.height).toBeLessThanOrEqual(bounds!.y);
      expect(value!.y + value!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
      await fitsViewport(page);
      await page.screenshot({
        path: test.info().outputPath(`boost-selection-${label}.png`),
        animations: 'disabled',
      });
    }
    await card.click();
    await expect(page.locator('.game-card:not(:disabled)')).toHaveCount(0);
    await expect(page.locator('.compact-card')).toHaveCount(5);
    await expect(page.locator('.action-count')).toContainText('1 actions');
    const committed = await revision(page);
    await page.reload();
    await expect(page.locator('main')).toHaveAttribute('data-revision', String(committed));
    for (const fighter of fighters) {
      if (
        (await picker
          .getByRole('button', { name: fighter, exact: true })
          .getAttribute('aria-pressed')) !== 'true'
      )
        await picker.getByRole('button', { name: fighter, exact: true }).click();
      await expect(page.locator('.hand-panel .prompt').first()).toContainText(
        `Movimento ${3 + amount}`,
      );
      const after = await page
        .getByRole('button', { name: /^Muovi in / })
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
      .getByRole('button', { name: /^Muovi in / })
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')!));
    const newSpace = expanded.find((label) => !before[fighter].includes(label))!;
    expect(newSpace).toBeTruthy();
    await page.getByRole('button', { name: newSpace, exact: true }).click();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('3 left');
    await expect(page.locator('.hand-panel .prompt').first()).toContainText(
      `Movimento ${3 + amount}`,
    );
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).click();
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('Movimento 3');
    await expect(page.locator('.game-card:not(:disabled)')).toHaveCount(6);
    await page.locator('button.fighter-hit[aria-pressed="true"]').click();
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
    const picker = page.getByRole('group', { name: 'I tuoi combattenti', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['Arpia 1', 'Arpia 2', 'Arpia 3']);
    await picker.getByRole('button', { name: 'Arpia 3', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page
      .getByRole('button', { name: /^Colloca alleato in/ })
      .first()
      .click();
    await page.reload();
    await expect(picker.getByRole('button')).toHaveText(['Arpia 1', 'Arpia 2']);
    for (let i = 0; i < 2; i++)
      await page
        .getByRole('button', { name: /^Colloca alleato in/ })
        .first()
        .click();
    for (let i = 0; i < 3; i++)
      await opponent
        .getByRole('button', { name: /^Colloca alleato in/ })
        .first()
        .click();
    const choice = page.locator('.hand-panel:has(.ability-options)');
    await expect(choice).toContainText('Sguardo pietrificante');
    await expect(opponent.locator('.hand-panel:has(.ability-options)')).toHaveCount(0);
    await page.reload();
    await choice.getByRole('button', { name: 'Salta', exact: true }).click();
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    await picker.getByRole('button', { name: 'Arpia 3', exact: true }).click();
    await page.locator('button.fighter-hit[aria-pressed="true"]').click();
    await page.reload();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('3 left');
    await expect(picker.getByRole('button', { name: 'Arpia 3', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 844, height: 390 });
    await fitsViewport(page);
    await page.screenshot({
      path: test.info().outputPath('medusa-socket-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).click();
    await expect(picker.getByRole('button')).toHaveText([
      'Medusa',
      'Arpia 1',
      'Arpia 2',
      'Arpia 3',
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
    const picker = page.getByRole('group', { name: 'I tuoi combattenti', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['Re Artù', 'Merlino 1']);
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    await picker.getByRole('button', { name: 'Merlino 1', exact: true }).click();
    await page.locator('button.fighter-hit[aria-pressed="true"]').click();
    await page.reload();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('1 left');
    await page.setViewportSize({ width: 844, height: 390 });
    await fitsViewport(page);
    await page.screenshot({
      path: test.info().outputPath('arthur-socket-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).click();
    await expect(picker.getByRole('button')).toHaveText(['Re Artù', 'Merlino 1']);
    await expect(
      rivals[1].page.getByRole('complementary', { name: 'Giocatori', exact: true }),
    ).toContainText('Merlino 1');
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects Achilles over sockets, deploys Patroclus and restores his shared Manovra on phone', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'achilles');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'I tuoi combattenti', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['Achille', 'Patroclo 1']);
    await page.screenshot({
      path: test.info().outputPath('achilles-socket-desktop.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    await picker.getByRole('button', { name: 'Patroclo 1', exact: true }).click();
    await page.locator('button.fighter-hit[aria-pressed="true"]').click();
    await page.reload();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('1 left');
    await page.setViewportSize({ width: 844, height: 390 });
    await fitsViewport(page);
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).click();
    await expect(picker.getByRole('button')).toHaveText(['Achille', 'Patroclo 1']);
    await expect(
      rivals[1].page.getByRole('complementary', { name: 'Giocatori', exact: true }),
    ).toContainText('Patroclo 1');
    await page.screenshot({
      path: test.info().outputPath('achilles-socket-phone.png'),
      animations: 'disabled',
    });
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects four Holmes over sockets, deploys numbered Watsons and restores a phone Manovra', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'sherlock-holmes');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'I tuoi combattenti', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['Sherlock Holmes', 'Dott. Watson 1']);
    for (const rival of rivals) {
      await expect(
        rival.page.getByRole('complementary', { name: 'Giocatori', exact: true }),
      ).toContainText('Dott. Watson 1');
      await fitsViewport(rival.page);
    }
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).tap();
    await picker.getByRole('button', { name: 'Dott. Watson 1', exact: true }).tap();
    await page.locator('button.fighter-hit[aria-pressed="true"]').tap();
    await page.reload();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('1 left');
    await page.screenshot({
      path: test.info().outputPath('holmes-four-seats-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).tap();
    await expect(picker.getByRole('button')).toHaveText(['Sherlock Holmes', 'Dott. Watson 1']);
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects four Draculas over sockets, deploys numbered Sisters and restores a phone Manovra', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'dracula');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'I tuoi combattenti', exact: true });
    await expect(picker.getByRole('button')).toHaveText([
      'Dracula',
      'Sorella 1',
      'Sorella 2',
      'Sorella 3',
    ]);
    for (const rival of rivals) {
      await expect(
        rival.page.getByRole('complementary', { name: 'Giocatori', exact: true }),
      ).toContainText('Sorella 1');
      await fitsViewport(rival.page);
    }
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).tap();
    await picker.getByRole('button', { name: 'Sorella 1', exact: true }).tap();
    await page.locator('button.fighter-hit[aria-pressed="true"]').tap();
    await page.reload();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('3 left');
    await page.screenshot({
      path: test.info().outputPath('dracula-four-seats-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).tap();
    await expect(picker.getByRole('button')).toHaveText([
      'Dracula',
      'Sorella 1',
      'Sorella 2',
      'Sorella 3',
    ]);
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});

test('selects Bigfoot over sockets, deploys The Jackalope and restores his shared Manovra on phone', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, false, 'bigfoot');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'I tuoi combattenti', exact: true });
    await expect(picker.getByRole('button')).toHaveText(['Bigfoot', 'Il Jackalope 1']);
    await page.screenshot({
      path: test.info().outputPath('bigfoot-socket-desktop.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    await picker.getByRole('button', { name: 'Il Jackalope 1', exact: true }).click();
    await page.locator('button.fighter-hit[aria-pressed="true"]').click();
    await page.reload();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('1 left');
    await page.setViewportSize({ width: 844, height: 390 });
    await fitsViewport(page);
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).click();
    await expect(picker.getByRole('button')).toHaveText(['Bigfoot', 'Il Jackalope 1']);
    await expect(
      rivals[1].page.getByRole('complementary', { name: 'Giocatori', exact: true }),
    ).toContainText('Il Jackalope 1');
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
    const picker = page.getByRole('group', { name: 'I tuoi combattenti', exact: true });
    const labels = ['Robin Hood', 'Outlaw 1', 'Outlaw 2', 'Outlaw 3', 'Outlaw 4'];
    await expect(picker.getByRole('button')).toHaveText(labels);
    for (const rival of rivals) {
      await expect(
        rival.page.getByRole('complementary', { name: 'Giocatori', exact: true }),
      ).toContainText('Fuorilegge 4');
      await fitsViewport(rival.page);
    }
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).tap();
    await picker.getByRole('button', { name: 'Fuorilegge 4', exact: true }).tap();
    await page.locator('button.fighter-hit[aria-pressed="true"]').tap();
    await page.reload();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('4 left');
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
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).tap();
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

test('Bruce Lee starts a solo four-seat match and resumes Manovra after socket reconnect', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'bruce-lee');
  try {
    const host = rivals[0].page;
    await host.getByRole('button', { name: /^Manovra/ }).click();
    await expect(host.locator('main')).toHaveAttribute('data-phase', 'choosing-movement');
    await host.reload();
    await expect(host.locator('main')).toHaveAttribute('data-phase', 'choosing-movement');
    await finishManovra(host);
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

test('Invisible Man deploys twelve fog tokens over real sockets and reconnects movement on phone', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'invisible-man', false, false);
  try {
    for (const [seat, { page }] of rivals.entries()) {
      const choice = page.locator('.hand-panel:has(.ability-options)');
      for (let i = 1; i <= 3; i++) {
        await expect(choice).toContainText(`Place Nebbia ${i}`);
        if (i === 2) await page.reload();
        await page
          .getByRole('button', { name: /^Scegli casella/ })
          .first()
          .tap();
      }
      if (seat < 3)
        await expect(
          rivals[seat + 1].page.locator('.hand-panel:has(.ability-options)'),
        ).toBeVisible();
    }
    for (const { page } of rivals) {
      await expect(page.locator('main.game-layout')).toHaveAttribute(
        'data-phase',
        'taking-actions',
      );
      await expect(page.locator('.board-token')).toHaveCount(12);
    }
    const host = rivals[0].page;
    await host.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).tap();
    await expect(host.getByRole('button', { name: 'Termina manovra', exact: true })).toBeVisible();
    await host.reload();
    await expect(host.getByRole('button', { name: 'Termina manovra', exact: true })).toBeVisible();
    await expect(host.locator('.board-token')).toHaveCount(12);
    await expect(host.locator('.arena canvas')).toBeVisible();
    await host.screenshot({
      path: test.info().outputPath('invisible-four-seats-phone.png'),
      animations: 'disabled',
    });
    await host.getByRole('button', { name: 'Termina manovra', exact: true }).tap();
    for (const rival of rivals) expect(rival.errors).toEqual([]);
  } finally {
    for (const rival of rivals) await rival.context.close();
  }
});

test('Darth Vader selects without allies and reconnects during Manovra', async ({ browser }) => {
  const rivals = await createMatch(browser, 2, true, 'darth-vader', false, false);
  try {
    const page = rivals[0].page;
    await page.setViewportSize({ width: 844, height: 390 });
    const choice = page.locator('.hand-panel:has(.ability-options)');
    if (await choice.isVisible()) await choice.getByRole('button', { name: /Conferma/ }).click();
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Termina manovra', exact: true })).toBeVisible();
    await expect(page.locator('.arena canvas')).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('darth-vader-socket-phone.png'),
      animations: 'disabled',
    });
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    for (const rival of rivals) await rival.context.close();
  }
});

test('Geralt selects gear before Dandelion deployment and resumes a four-seat Manovra over real sockets', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'geralt-of-rivia', false, false);
  try {
    for (const [i, { page }] of rivals.entries()) {
      const choice = page.locator('.hand-panel:has(.ability-options)');
      await expect(choice).toContainText('Scegli una spada');
      await choice
        .getByRole('button', { name: 'Equipaggiamento: spada d’argento', exact: true })
        .tap();
      await expect(choice).toContainText('Scegli un’armatura');
      await page.reload();
      await expect(choice).toContainText('Scegli un’armatura');
      for (const rival of rivals.filter((_, j) => j !== i))
        await expect(rival.page.locator('.hand-panel:has(.ability-options)')).toHaveCount(0);
      await choice
        .getByRole('button', { name: 'EQUIPAGGIAMENTO: medaglione del Lupo', exact: true })
        .tap();
      await choice.getByRole('button', { name: 'EQUIPAGGIAMENTO: Allocchi', exact: true }).tap();
    }
    for (const { page } of rivals) {
      await page
        .getByRole('button', { name: /^Colloca alleato in/ })
        .first()
        .tap();
      await expect(page.locator('.badge-ally').filter({ hasText: 'Ranuncolo' })).toHaveCount(4);
    }
    const host = rivals[0].page;
    await host.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).tap();
    await expect(host.locator('main')).toHaveAttribute('data-phase', 'choosing-movement');
    await host.reload();
    await expect(host.locator('main')).toHaveAttribute('data-phase', 'choosing-movement');
    await finishManovra(host);
    for (const { page, errors } of rivals) {
      await expect(page.locator('main')).toHaveAttribute('data-phase', 'taking-actions');
      await fitsViewport(page);
      expect(errors).toEqual([]);
    }
    await host.screenshot({
      path: test.info().outputPath('geralt-four-seats-phone.png'),
      animations: 'disabled',
    });
  } finally {
    await Promise.allSettled(rivals.map((r) => r.context.close()));
  }
});

test('Philippa and Dijkstra deploy over real sockets and reconnect during shared Manovra', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 2, true, 'philippa');
  try {
    const host = rivals[0].page;
    await expect(host.locator('.badge-ally').filter({ hasText: 'Dijkstra' })).toHaveCount(2);
    await host.getByRole('button', { name: /^Manovra/ }).click();
    await expect(host.locator('main')).toHaveAttribute('data-phase', 'choosing-movement');
    await host.reload();
    await expect(host.locator('main')).toHaveAttribute('data-phase', 'choosing-movement');
    await finishManovra(host);
    for (const { page, errors } of rivals) {
      await expect(page.locator('main')).toHaveAttribute('data-phase', 'taking-actions');
      await fitsViewport(page);
      expect(errors).toEqual([]);
    }
    await host.screenshot({
      path: test.info().outputPath('philippa-socket-phone.png'),
      animations: 'disabled',
    });
  } finally {
    await Promise.allSettled(rivals.map((r) => r.context.close()));
  }
});

test('selects Eredin over sockets, deploys all sixteen Red Riders and reconnects on phone', async ({
  browser,
}) => {
  const rivals = await createMatch(browser, 4, true, 'eredin');
  const page = rivals[0].page;
  try {
    const picker = page.getByRole('group', { name: 'I tuoi combattenti', exact: true });
    const labels = ['Eredin', 'Red Rider 1', 'Red Rider 2', 'Red Rider 3', 'Red Rider 4'];
    await expect(picker.getByRole('button')).toHaveText(labels);
    for (const rival of rivals) {
      await expect(
        rival.page.getByRole('complementary', { name: 'Giocatori', exact: true }),
      ).toContainText('Cavaliere Rosso 4');
      await fitsViewport(rival.page);
    }
    await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).tap();
    await picker.getByRole('button', { name: 'Cavaliere Rosso 4', exact: true }).tap();
    await page.locator('button.fighter-hit[aria-pressed="true"]').tap();
    await page.reload();
    await expect(page.locator('.hand-panel .prompt').first()).toContainText('4 left');
    await expect(page.locator('.pixi-surface canvas')).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: test.info().outputPath('eredin-sixteen-riders-phone.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Termina manovra', exact: true }).tap();
    await expect(picker.getByRole('button')).toHaveText(labels);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fitsViewport(page);
    await page.screenshot({
      path: test.info().outputPath('eredin-socket-desktop.png'),
      animations: 'disabled',
    });
    expect(rivals.flatMap((r) => r.errors)).toEqual([]);
  } finally {
    await Promise.allSettled(rivals.map(({ context }) => context.close()));
  }
});
