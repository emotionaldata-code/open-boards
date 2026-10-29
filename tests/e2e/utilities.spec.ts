import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 667 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(`Italian interface and accessible guide throughout a match (${viewport.width})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', 'it');
      await expect(page.getByRole('heading', { name: 'Accedi per giocare' })).toBeVisible();
      const guide = page.getByRole('button', { name: 'Guida', exact: true });
      const openGuide = async (stage: string) => {
        await guide.click();
        const dialog = page.getByRole('dialog', { name: 'Come si gioca' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('Hai due azioni da usare');
        await expect(dialog).toContainText('Subisci il colpo');
        const rules = dialog.getByRole('link', { name: /regolamento ufficiale/ });
        await expect(rules).toHaveAttribute('href', /^https:\/\/iellogames\.com\/.*\.pdf$/);
        await expect(rules).toHaveAttribute('target', '_blank');
        await page.screenshot({
          animations: 'disabled',
          path: test.info().outputPath(`${stage}-guide.png`),
        });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(guide).toBeFocused();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        expect(overflow).toBe(false);
      };
      await openGuide('login');
      const response = await context.request.post('/api/auth/register', {
        headers: { Origin: 'http://localhost:5173' },
        data: { username: `util_${Date.now().toString(36)}`, password: 'utilities-test-password' },
      });
      expect(response.ok(), await response.text()).toBe(true);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Trova il tuo tavolo' })).toBeVisible();
      await openGuide('lobby');
      await page.getByRole('button', { name: '2 Duello', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Il tuo tavolo è aperto' })).toBeVisible();
      await openGuide('waiting');

      // A second account joins over the real transport; both choose heroes without setup choices.
      const rival = await browser.newContext();
      try {
        await rival.request.post('/api/auth/register', {
          headers: { Origin: 'http://localhost:5173' },
          data: {
            username: `rival_${Date.now().toString(36)}`,
            password: 'utilities-test-password',
          },
        });
        const other = await rival.newPage();
        await other.goto(page.url());
        await other.getByRole('button', { name: 'Entra al tavolo', exact: true }).click();
        for (const player of [page, other]) {
          await player.getByRole('button', { name: 'Scegli personaggio', exact: true }).click();
          await player.getByRole('button', { name: 'Esamina Bruce Lee', exact: true }).click();
          await player.getByRole('button', { name: 'Scegli Bruce Lee', exact: true }).click();
          await player.getByRole('button', { name: 'Sono pronto', exact: true }).click();
        }
        await page.getByRole('button', { name: 'Avvia partita', exact: true }).click();
        await expect(page.locator('main.game-layout')).toBeVisible();
        await expect(page.getByRole('region', { name: 'La tua mano', exact: true })).toBeVisible();
        await openGuide('match');
        const header = await page.locator('.topbar').boundingBox();
        const leave = await page
          .getByRole('button', { name: 'Lascia partita', exact: true })
          .boundingBox();
        expect(header!.x).toBeGreaterThanOrEqual(leave!.x + leave!.width);
        await page.screenshot({
          animations: 'disabled',
          path: test.info().outputPath('match.png'),
        });
        expect(errors).toEqual([]);
      } finally {
        await rival.close();
      }
    } finally {
      await context.close();
    }
  });
}
