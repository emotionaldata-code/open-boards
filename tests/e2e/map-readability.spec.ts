import { expect, test } from '@playwright/test';
import { kingSolomonsMine as map } from '../../packages/content/src/map';
import { zoneStyles } from '../../packages/content/src/layout';
import { presentationHarness } from './fixtures/game';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 667 },
  { width: 844, height: 390 },
]) {
  for (const webgl of [true, false]) {
    test(`zones and occupied portals remain distinct at ${viewport.width}px with WebGL ${webgl}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await presentationHarness(page, webgl, {
        phase: { type: 'choosing-movement', player: 'a' },
        maneuver: {
          player: 'a',
          remaining: ['a:main'],
          finishing: false,
          boost: 0,
          boostable: false,
        },
        fighters: ['a', 'b'].map((id, i) => ({
          id: `${id}:main`,
          player: id,
          role: 'main',
          character: 'medusa',
          definition: 'medusa',
          hp: 15,
          position: i ? 'n16' : 'n6',
          defeated: false,
          counters: {},
          statuses: [],
        })),
      });
      await expect(page.locator(webgl ? 'canvas' : '.board-error')).toBeVisible();
      if (!webgl) {
        const alert = (await page.locator('.board-error').boundingBox())!;
        const arena = (await page.locator('.arena').boundingBox())!;
        expect(alert.y).toBeGreaterThanOrEqual(arena.y + arena.height);
        const controls = (await page.locator('.board-controls').boundingBox())!;
        expect(
          controls.y >= alert.y + alert.height || controls.y + controls.height <= alert.y,
        ).toBe(true);
      }
      const terrain = page.locator('.map-terrain');
      await expect(terrain.locator('.portal-mark')).toHaveCount(map.portals!.length);
      const symbolPaths = await terrain
        .locator('.portal-mark path')
        .evaluateAll((paths) => paths.map((path) => path.getAttribute('d')));
      expect(new Set(symbolPaths).size).toBe(1);
      for (const id of ['n6', 'n16']) {
        const portal = terrain.locator(`[data-space="${id}"] .portal-mark`);
        await expect(portal).toBeVisible();
        const badge = (await portal.boundingBox())!;
        const zone = (await terrain.locator(`[data-space="${id}"] .zone-ring`).boundingBox())!;
        // A fighter stands over the center of the zone; the badge sits below its entire circle.
        expect(badge.y).toBeGreaterThan(zone.y + zone.height);
      }
      // Every membership is kept, including three-way spaces and a highlighted space.
      for (const id of ['n4', 'n12', 'center']) {
        const node = terrain.locator(`[data-space="${id}"]`);
        await expect(node.locator('.zone-ring')).toHaveCount(map.zones[id].length);
        const segments = await node.locator('.zone-ring').evaluateAll((rings) =>
          rings.map((ring) => ({
            color: ring.getAttribute('stroke'),
            dash: ring.getAttribute('stroke-dasharray'),
          })),
        );
        expect(segments.map(({ color }) => color)).toEqual(
          map.zones[id].map((zone) => `#${zoneStyles[zone].color.toString(16).padStart(6, '0')}`),
        );
        expect(new Set(segments.map(({ dash }) => dash)).size).toBe(1);
        expect(segments[0].dash).toBeTruthy();
      }
      await expect(terrain.locator('[data-space="n4"] .movement-ring')).toBeVisible();
      await expect(terrain.locator('[data-space="n6"] .selection-ring')).toBeVisible();
      const rings = await terrain.locator('.movement-ring, .selection-ring').evaluateAll((rings) =>
        rings.map((ring) => {
          const zone = ring.parentElement!.querySelector('.zone-ring')!;
          return {
            inner: Number(ring.getAttribute('r')) - Number(ring.getAttribute('stroke-width')) / 2,
            zoneOuter:
              Number(zone.getAttribute('r')) + Number(zone.getAttribute('stroke-width')) / 2,
            fill: ring.getAttribute('fill'),
          };
        }),
      );
      expect(rings.length).toBeGreaterThan(1);
      expect(
        rings.every(({ inner, zoneOuter, fill }) => inner > zoneOuter && fill === 'none'),
      ).toBe(true);
      const portalTarget = page.getByRole('button', { name: 'Move to 08', exact: true });
      await expect(portalTarget).toHaveAttribute(
        'aria-description',
        /passage arrows.*one movement point/,
      );
      await expect(portalTarget).toHaveAttribute('title', /One movement point/);
      for (const mark of await terrain.locator('[data-space]').all()) {
        await expect(mark).toBeInViewport({ ratio: 1 });
      }
      await page.screenshot({ path: test.info().outputPath('map.png') });
      await portalTarget.click();
      expect(
        await page.evaluate(() =>
          (
            window as unknown as { presentationCommands: { type: string; path: string[] }[] }
          ).presentationCommands.at(-1),
        ),
      ).toMatchObject({ type: 'move', path: ['n7'] });
      expect(
        await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        })),
      ).toEqual(viewport);
    });
  }
}
