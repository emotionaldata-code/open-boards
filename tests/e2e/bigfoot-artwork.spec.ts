import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src/index';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Bigfoot and numbered Jackalope share textures across four owner colors (${reducedMotion})`, async ({
    page,
  }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors: string[] = [];
    const textures: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/artwork/bigfoot/'))
        errors.push(`${response.status()} ${response.url()}`);
    });
    page.on('request', (request) => {
      if (/\/bigfoot-(jackalope-)?token-/.test(request.url())) textures.push(request.url());
    });
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Owner ${i + 1}`,
      character: 'bigfoot',
      handCount: 0,
      deckCount: 10,
      discard: [],
      eliminated: false,
    }));
    let fighters: GameView['fighters'] = players.flatMap((player, i) => [
      {
        id: `${player.id}:main`,
        player: player.id,
        character: 'bigfoot',
        definition: 'bigfoot',
        role: 'main' as const,
        hp: 16,
        position: ['n0', 'n7', 'n13', 'n20'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
      {
        id: `${player.id}:ally-1`,
        player: player.id,
        character: 'bigfoot',
        definition: 'bigfoot-jackalope',
        role: 'ally' as const,
        hp: 6,
        position: ['n1', 'n8', 'n14', 'n21'][i],
        defeated: false,
        counters: {},
        statuses: [],
      },
    ]);
    await presentationHarness(page, true, { players, fighters });
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
        ['bigfoot-token', 'bigfoot-jackalope-token'].map((id) =>
          loadFigureTexture(rasterAssets[id].url),
        ),
      );
    });
    const jackalope = page.getByRole('button', { name: 'The Jackalope 1', exact: true });
    await jackalope.click();
    await page.mouse.move(0, 0);
    await expect(jackalope).toHaveAttribute('aria-pressed', 'true');
    await expect(jackalope).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('bigfoot-four-colors-desktop.png'),
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('bigfoot-four-colors-phone.png'),
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
          path: test.info().outputPath('jackalope-revival-portrait.png'),
        });
        await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
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
      path: test.info().outputPath('jackalope-moved.png'),
    });
    await transition(
      { defeated: true, hp: 0, position: null },
      { type: 'defeated', fighter: 'a:ally-1', sequence: 2, revision: 2, audience: 'all' },
    );
    await expect(jackalope).toHaveCount(0);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('jackalope-defeated.png'),
    });
    await transition(
      { defeated: false, hp: 6, position: 'n2' },
      {
        type: 'revived',
        fighter: 'a:ally-1',
        position: 'n2',
        sequence: 3,
        revision: 3,
        audience: 'all',
      },
    );
    await expect(jackalope).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('jackalope-returned.png'),
    });
    // Exercise mixed SVG/raster rendering without altering any game rules.
    await page.evaluate((players) => {
      const harness = window as unknown as {
        updatePresentationGame: (game: Partial<GameView>) => void;
      };
      harness.updatePresentationGame({
        players: players.slice(0, 2).map((player, i) => ({
          ...player,
          character: i ? 'darth-vader' : 'bigfoot',
        })),
        fighters: [
          {
            id: 'a:main',
            player: 'a',
            character: 'bigfoot',
            definition: 'bigfoot',
            role: 'main',
            hp: 16,
            position: 'n0',
            defeated: false,
            counters: {},
            statuses: [],
          },
          {
            id: 'b:main',
            player: 'b',
            character: 'darth-vader',
            definition: 'darth-vader',
            role: 'main',
            hp: 15,
            position: 'n13',
            defeated: false,
            counters: {},
            statuses: [],
          },
        ],
      });
    }, players);
    await expect(
      page
        .getByRole('region', { name: 'Arena', exact: true })
        .getByText('Darth Vader', { exact: true }),
    ).toBeAttached();
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('bigfoot-mixed-phone.png'),
    });
    expect(new Set(textures).size).toBe(2);
    expect(textures).toHaveLength(2);
    expect(errors).toEqual([]);
    await test.info().attach('bigfoot-token-requests', {
      body: JSON.stringify(textures, null, 2),
      contentType: 'application/json',
    });
  });
}
