import { expect, test, type Page } from '@playwright/test';
import { presentationHarness } from './fixtures/game';

async function expectPainted(page: Page) {
  await expect
    .poll(() => page.locator('.game-control:visible:not([data-chrome-ready])').count())
    .toBe(0);
  expect(
    await page.locator('.game-control:visible .control-plate').evaluateAll((canvases) =>
      canvases.every((node) => {
        const canvas = node as HTMLCanvasElement;
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels.some((value, index) => index % 4 === 3 && value > 0);
      }),
    ),
  ).toBe(true);
}

for (const width of [1440, 768, 390]) {
  test(`Pixi controls cover entry, lobby, waiting and dialogs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }));
    await page.route('**/api/rooms', (route) => route.fulfill({ json: [] }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Accedi per giocare' })).toBeVisible();
    await expectPainted(page);
    await page.screenshot({ path: test.info().outputPath('entry.png'), fullPage: true });
    await page.getByRole('button', { name: 'Guida', exact: true }).click();
    await expectPainted(page);
    await page.getByRole('slider', { name: 'Volume degli effetti' }).fill('42');
    await expect(page.getByRole('slider', { name: 'Volume degli effetti' })).toHaveValue('42');
    await page.screenshot({ path: test.info().outputPath('guide.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Guida', exact: true })).toBeFocused();
    await page.reload();
    await page.getByRole('button', { name: 'Guida', exact: true }).click();
    await expect(page.getByRole('slider', { name: 'Volume degli effetti' })).toHaveValue('42');
    await page.keyboard.press('Escape');
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ json: { id: 'a', name: 'Arden' } }),
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Trova il tuo tavolo' })).toBeVisible();
    await expectPainted(page);
    await page.screenshot({ path: test.info().outputPath('lobby.png'), fullPage: true });
    await page.evaluate(async () => {
      const resourceUrl = (file: string) =>
        performance
          .getEntriesByType('resource')
          .find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${file}.js`))!.name;
      const { createElement } = (await import(resourceUrl('react'))).default;
      const { createRoot } = (await import(resourceUrl('react-dom_client'))).default;
      const url = '/src/lobby/WaitingRoom.tsx';
      const { WaitingRoom } = await import(url);
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell';
      document.body.append(host);
      createRoot(host).render(
        createElement(WaitingRoom, {
          room: {
            id: 'duello',
            host: 'a',
            capacity: 2,
            game: null,
            viewerRole: 'player',
            spectators: 0,
            seats: [
              {
                id: 'a',
                name: 'Arden',
                character: 'medusa',
                ready: false,
                controller: { type: 'human' },
              },
            ],
          },
          user: { id: 'a', name: 'Arden' },
          onReady: () => {},
          onCharacter: () => {},
          onStart: () => {},
          onLeave: () => {},
          onAddBot: () => {},
          onRemoveBot: () => {},
        }),
      );
    });
    await expect(page.getByRole('heading', { name: 'Il tuo tavolo è aperto' })).toBeVisible();
    await expectPainted(page);
    await expect(page.getByRole('button', { name: 'Avvia partita' })).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath('waiting.png'), fullPage: true });
    await page.getByRole('button', { name: 'Scegli personaggio', exact: true }).click();
    await expectPainted(page);
    await page.screenshot({ path: test.info().outputPath('characters.png') });
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(errors).toEqual([]);
  });
}

test('Pixi controls keep a usable fallback when WebGL is unavailable', async ({ page }) => {
  await presentationHarness(page, false, { hand: [{ id: 'dash', definition: 'medusa-dash' }] });
  const deck = page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true });
  await deck.click();
  expect(
    await page.evaluate(
      () => (window as unknown as { presentationCommands: unknown[] }).presentationCommands,
    ),
  ).toEqual([{ type: 'maneuver' }]);
  await page.getByRole('button', { name: 'Lascia partita' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const width of [1440, 390, 320]) {
  test(`match toolbar leaves the exit control clear at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await presentationHarness(page);
    await page.evaluate(() => {
      // The presentation harness hides the app shell; reproduce its in-match toolbar.
      const header = document.querySelector('#root .topbar')!.cloneNode(true) as HTMLElement;
      [...header.querySelectorAll('button')]
        .find((button) => button.getAttribute('aria-label')?.toLowerCase().includes('schermo'))
        ?.closest('.display-control')
        ?.remove();
      document.querySelector('body > .shell.in-match')!.prepend(header);
    });
    const toolbar = (await page.locator('body > .shell.in-match > .topbar').boundingBox())!;
    const exit = (await page
      .getByRole('button', { name: 'Lascia partita', exact: true })
      .boundingBox())!;
    expect(exit.x + exit.width).toBeLessThan(toolbar.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
