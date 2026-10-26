import { expect, test } from '@playwright/test';
import type { GameView } from '../../packages/protocol/src/index';
import { presentationHarness } from './fixtures/game';

const players: GameView['players'] = ['Arden', 'Briar'].map((name, i) => ({
  id: i ? 'b' : 'a',
  name,
  character: 'medusa',
  handCount: 5,
  deckCount: 15,
  eliminated: false,
  discard: [
    { id: `${i}-oldest`, definition: 'medusa-dash' },
    { id: `${i}-middle`, definition: 'medusa-gaze-of-stone' },
    { id: `${i}-duplicate`, definition: 'medusa-dash' },
    { id: `${i}-newest`, definition: 'medusa-winged-frenzy' },
  ],
}));

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 667 },
  { width: 844, height: 390 },
]) {
  test(`both discard piles are current, inspectable and keyboard accessible at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await presentationHarness(page, true, { players });
    await expect(page.locator('.player-summary button button')).toHaveCount(0);
    for (const [i, player] of players.entries()) {
      const trigger = page.getByRole('button', {
        name: `${player.name}: Discards · 4`,
        exact: true,
      });
      await expect(trigger).toBeInViewport({ ratio: 1 });
      const bounds = (await trigger.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await trigger.click();
      const pile = page.getByRole('dialog', { name: `${player.name}’s discards`, exact: true });
      await expect(pile).toContainText('4 cards · Most recent first');
      const rows = pile.getByRole('listitem');
      await expect(rows).toHaveCount(4);
      await expect(rows.nth(0)).toContainText('Winged Frenzy');
      await expect(rows.nth(0)).toContainText('action');
      await expect(rows.nth(0)).toContainText('Value 0');
      await expect(rows.nth(1)).toContainText('Dash');
      await expect(rows.nth(2)).toContainText('Gaze of Stone');
      await expect(rows.nth(3)).toContainText('Dash');
      await expect(rows.nth(1)).toContainText('versatile');
      await expect(rows.nth(1)).toContainText('Value 3');
      await expect(rows.nth(2)).toContainText('attack');
      await expect(rows.nth(2)).toContainText('Value 2');
      const card = rows.nth(1).getByRole('button');
      await card.click();
      const detail = page.getByRole('dialog', { name: 'Dash', exact: true });
      await expect(detail.locator('.card-art')).toBeVisible();
      await expect(detail).toContainText('After combat');
      await page.keyboard.press('Escape');
      await expect(detail).toHaveCount(0);
      await expect(pile).toBeVisible();
      await expect(card).toBeFocused();
      await page.screenshot({ path: test.info().outputPath(`discards-${i}.png`) });
      await page.keyboard.press('Escape');
      await expect(pile).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }

    // A snapshot can change while its pile is open; both the dialog and HUD follow it.
    const current = players.map((player) => ({ ...player, discard: [] }));
    for (const [i, player] of players.entries()) {
      const trigger = page.locator('.discard-trigger').nth(i);
      await trigger.click();
      await page.evaluate((players) => {
        (
          window as unknown as { updatePresentationGame: (game: Partial<GameView>) => void }
        ).updatePresentationGame({ players });
      }, current);
      const pile = page.getByRole('dialog', { name: `${player.name}’s discards`, exact: true });
      await expect(pile).toContainText('0 cards');
      await expect(pile).toContainText('No cards discarded yet.');
      await expect(pile.getByRole('listitem')).toHaveCount(0);
      await expect(trigger).toHaveText('Discards · 0');
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      // Player details opens the same empty pile, then returns focus to its own trigger.
      await page.locator('.player-badge').nth(i).click();
      const details = page.getByRole('dialog');
      const access = details.getByRole('button', { name: 'Discards · 0', exact: true });
      await access.click();
      await expect(pile).toContainText('No cards discarded yet.');
      await page.keyboard.press('Escape');
      await expect(access).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect(
      await page.evaluate(
        () => (window as unknown as { presentationCommands: unknown[] }).presentationCommands,
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual(viewport);
  });
}
