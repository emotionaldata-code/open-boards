import { contentText } from '../../apps/client/src/localization/text';
import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 667 },
  { width: 844, height: 390 },
];

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
}

for (const viewport of viewports) {
  test(`access and fighter exploration stay available at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const roster = page.getByRole('region', { name: 'Personaggi disponibili' });
    const portrait = roster.locator('.roster-detail img');
    await expect(roster.getByRole('heading', { name: 'Medusa', exact: true })).toBeVisible();
    await expect(portrait).toHaveAttribute('loading', 'eager');
    await expect
      .poll(() =>
        portrait.evaluate(
          (image: HTMLImageElement) =>
            image.complete && image.naturalWidth > 0 && /-(512|1024)-/.test(image.currentSrc),
        ),
      )
      .toBe(true);
    await page.getByLabel('Nome utente', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
    if (viewport.width === 390) {
      await expect(page.getByRole('button', { name: 'Accedi', exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(
        viewport.height,
      );
    }
    await page.screenshot({ path: test.info().outputPath('access.png'), fullPage: true });
    await roster.getByRole('button', { name: 'Esamina Re Artù', exact: true }).click();
    await expect(roster.getByRole('heading', { name: 'Re Artù', exact: true })).toBeInViewport();
    await roster.locator('summary').click();
    await expect(roster.locator('.roster-rules')).toBeVisible();
    await expect(roster).toContainText('Merlino');
    await roster
      .getByRole('button', { name: 'Mazzo di Re Artù · 16 carte diverse', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Mazzo di Re Artù', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      roster.getByRole('button', { name: 'Mazzo di Re Artù · 16 carte diverse', exact: true }),
    ).toBeFocused();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: test.info().outputPath('arthur.png'), fullPage: true });
  });

  test(`lobby loading, long names, errors and recovery at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ json: { id: 'viewer', name: 'A_very_long_table_name_24' } }),
    );
    let state: 'loading' | 'populated' | 'error' | 'empty' = 'loading';
    let release: (() => void) | undefined;
    const loaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/rooms', async (route) => {
      if (state === 'loading') await loaded;
      if (state === 'error')
        await route.fulfill({
          status: 503,
          json: { message: 'Tables are temporarily unavailable.' },
        });
      else
        await route.fulfill({
          json:
            state === 'empty'
              ? []
              : [
                  { id: 'room-a', host: 'A_very_long_table_name_24', capacity: 4, seats: 3 },
                  { id: 'room-b', host: 'Briar', capacity: 2, seats: 1 },
                ],
        });
    });
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Ricerca dei tavoli aperti…');
    await expect(page.getByRole('button', { name: '2 Duello', exact: true })).toBeEnabled();
    state = 'populated';
    release!();
    await expect(page.locator('.room-list')).toContainText('A_very_long_table_name_24');
    await expect(page.locator('.room-list')).toContainText('3 / 4 seated');
    const firstJoin = page
      .locator('.room-list')
      .getByRole('button', { name: 'Entra', exact: true })
      .first();
    await firstJoin.scrollIntoViewIfNeeded();
    const bounds = (await firstJoin.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await page.getByLabel('Codice stanza').fill('invite-room');
    await expect(page.getByRole('button', { name: 'Entra al tavolo', exact: true })).toBeEnabled();
    await page.evaluate(() => scrollTo(0, 0));
    await noHorizontalOverflow(page);
    await page.screenshot({ path: test.info().outputPath('lobby.png'), fullPage: true });
    state = 'error';
    await expect(page.locator('.room-list').getByRole('alert')).toHaveText(
      'Tables are temporarily unavailable.',
      { timeout: 6000 },
    );
    state = 'empty';
    await expect(page.locator('.room-list')).toContainText('Nessun tavolo aperto.', {
      timeout: 6000,
    });
    await expect(page.getByRole('button', { name: 'Entra al tavolo', exact: true })).toBeEnabled();
    await noHorizontalOverflow(page);
  });
}

test('failed scenery keeps the map preview and fighter fallback available', async ({ page }) => {
  await page.route('**/artwork/**/*.webp', (route) => route.abort());
  await page.goto('/');
  const roster = page.getByRole('region', { name: 'Personaggi disponibili' });
  await expect(roster.locator('.roster-detail img')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  );
  await roster.getByRole('button', { name: 'Esamina Il Genio', exact: true }).click();
  await expect(roster.locator('.roster-detail img')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { id: 'viewer', name: 'Arden' } }),
  );
  await page.route('**/api/rooms', (route) => route.fulfill({ json: [] }));
  await page.reload();
  await expect(page.locator('.map-preview svg')).toBeVisible();
  await expect(page.locator('.map-preview img')).toHaveCount(0);
  await expect(page.locator('.map-preview')).toContainText('Le miniere di re Salomone');
});

test('sign in, invite, choose a fighter, ready up and start a match', async ({ browser }) => {
  const hostContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const name = `cin_${Date.now().toString(36)}`;
  const password = 'cinematic-test-password';
  const errors: string[] = [];
  for (const page of [host, guest]) page.on('pageerror', (error) => errors.push(error.message));
  async function register(page: Page, username: string) {
    await page.getByRole('button', { name: 'Prima partita? Crea un account' }).click();
    await page.getByLabel('Nome utente', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Crea account', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Trova il tuo tavolo', exact: true }),
    ).toBeVisible();
  }
  try {
    await host.goto('/');
    await register(host, name);
    await host.getByRole('button', { name: 'Esci', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Accedi', exact: true })).toBeVisible();
    await host.getByLabel('Nome utente', { exact: true }).fill(name);
    await host.getByLabel('Password', { exact: true }).fill('incorrect-password');
    await host.getByRole('button', { name: 'Accedi', exact: true }).click();
    await expect(host.locator('form').getByRole('alert')).toBeVisible();
    await host.getByLabel('Password', { exact: true }).fill(password);
    await host.getByRole('button', { name: 'Accedi', exact: true }).click();
    await expect(
      host.getByRole('heading', { name: 'Trova il tuo tavolo', exact: true }),
    ).toBeVisible();
    await host.getByRole('button', { name: '2 Duello', exact: true }).click();
    await host.getByRole('button', { name: 'Scegli personaggio', exact: true }).click();
    await host.getByRole('button', { name: 'Esamina Re Artù', exact: true }).click();
    await host.getByRole('button', { name: 'Scegli Re Artù', exact: true }).click();
    await host.getByRole('button', { name: 'Copia link di invito', exact: true }).click();
    await expect(host.getByRole('status')).toContainText('Link di invito copiato');
    const invite = await host.evaluate(() => navigator.clipboard.readText());
    const room = await host.getByLabel('Codice stanza').inputValue();
    expect(invite).toBe(`http://localhost:5173/?room=${room}`);
    await host.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
    await host.getByRole('button', { name: 'Link copiato', exact: true }).click();
    await expect(host.getByRole('status')).toHaveText(
      'Copia non riuscita. Condividi il codice stanza qui sopra.',
    );
    await expect(host.getByLabel('Codice stanza')).toHaveValue(room);
    await guest.goto(invite);
    await register(guest, `${name}_g`);
    await expect(guest.getByLabel('Codice stanza')).toHaveValue(room);
    await guest.getByRole('button', { name: 'Entra al tavolo', exact: true }).click();
    await expect(host.locator('.seats')).toContainText(`${contentText(name)}_g`);
    await expect(host.getByRole('button', { name: 'Avvia partita', exact: true })).toBeDisabled();
    for (const viewport of viewports) {
      await host.setViewportSize(viewport);
      await noHorizontalOverflow(host);
      await host.screenshot({
        path: test.info().outputPath(`waiting-${viewport.width}.png`),
        fullPage: true,
      });
    }
    await guest.getByRole('button', { name: 'Sono pronto', exact: true }).click();
    await host.getByRole('button', { name: 'Sono pronto', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Avvia partita', exact: true })).toBeEnabled();
    await host.getByRole('button', { name: 'Avvia partita', exact: true }).click();
    await expect(host.locator('.game-layout')).toBeVisible();
    await expect(host.locator('.arena canvas')).toBeVisible();
    for (const viewport of viewports) {
      await host.setViewportSize(viewport);
      await expect
        .poll(() => host.evaluate(() => document.documentElement.scrollHeight))
        .toBe(viewport.height);
      await noHorizontalOverflow(host);
      await host.screenshot({ path: test.info().outputPath(`match-${viewport.width}.png`) });
    }
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
