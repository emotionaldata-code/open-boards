import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Prima partita? Crea un account' }).click();
  await page.getByLabel('Nome utente', { exact: true }).fill(`bot_${Date.now().toString(36)}`);
  await page.getByLabel('Password', { exact: true }).fill('a-secure-test-password');
  await page.getByRole('button', { name: 'Crea account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trova il tuo tavolo' })).toBeVisible();
}

test('host plays against a bot using an ordinary human seat', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  await page.getByRole('button', { name: '2 Duello', exact: true }).click();
  await page.getByRole('button', { name: 'Scegli personaggio del bot', exact: true }).click();
  await page.getByRole('button', { name: 'Esamina Bruce Lee', exact: true }).click();
  await page.getByRole('button', { name: 'Scegli Bruce Lee', exact: true }).click();
  await page.getByRole('button', { name: 'Aggiungi bot', exact: true }).click();
  await expect(page.locator('.seats')).toContainText('Bot');
  await page.getByRole('button', { name: 'Sono pronto', exact: true }).click();
  await page.getByRole('button', { name: 'Avvia partita', exact: true }).click();
  await expect(page.locator('main.game-layout')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stai osservando la partita' })).toHaveCount(0);
  await expect(page.locator('.hand-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Lascia partita', exact: true }).click();
  await page.getByRole('button', { name: 'Arrenditi ed esci', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trova il tuo tavolo' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('spectator creates and watches bots; another viewer can join after start', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  await page.getByRole('button', { name: 'Organizza una partita tra bot' }).click();
  await expect(page.getByRole('button', { name: 'Sono pronto', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Scegli personaggio del bot', exact: true }).click();
  await page.getByRole('button', { name: 'Esamina Bruce Lee', exact: true }).click();
  await page.getByRole('button', { name: 'Scegli Bruce Lee', exact: true }).click();
  await page.getByRole('button', { name: 'Aggiungi bot', exact: true }).click();
  await expect(page.locator('.seats')).toContainText('Bot');
  await page.getByRole('button', { name: 'Aggiungi bot', exact: true }).click();
  const room = await page.getByLabel('Codice stanza').inputValue();
  await page.getByRole('button', { name: 'Avvia partita', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stai osservando la partita' })).toBeVisible();
  const game = page.locator('main.game-layout');
  const revision = Number(await game.getAttribute('data-revision'));
  await expect
    .poll(async () => Number(await game.getAttribute('data-revision')))
    .toBeGreaterThan(revision);
  const viewer = await context.newPage();
  await viewer.goto(`/?room=${room}&watch=1`);
  await viewer.getByRole('button', { name: 'Osserva', exact: true }).first().click();
  await expect(viewer.getByRole('heading', { name: 'Stai osservando la partita' })).toBeVisible();
  await expect(viewer.locator('.game-card')).toHaveCount(0);
  await viewer.getByRole('button', { name: 'Torna alla lobby', exact: true }).click();
  await expect(viewer.getByRole('heading', { name: 'Trova il tuo tavolo' })).toBeVisible();
  await viewer.close();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `test-results/bots-spectator-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  const afterLeave = Number(await game.getAttribute('data-revision'));
  await expect
    .poll(async () => Number(await game.getAttribute('data-revision')))
    .toBeGreaterThan(afterLeave);
  await page.getByRole('button', { name: 'Torna alla lobby', exact: true }).click();
  expect(errors).toEqual([]);
});
