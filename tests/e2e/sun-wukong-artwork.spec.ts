import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';
import type { GameView } from '../../packages/protocol/src';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Sun Wukong and three numbered Clones share two textures across four owner colors (${reducedMotion})`, async ({
    page,
  }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: null }));
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors: string[] = [],
      textures: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/artwork/sun-wukong/'))
        errors.push(`${r.status()} ${r.url()}`);
    });
    page.on('request', (r) => {
      if (/\/sun-wukong-(clone-)?token-/.test(r.url())) textures.push(r.url());
    });
    const players: GameView['players'] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: `Owner ${i + 1}`,
      character: 'sun-wukong',
      handCount: 0,
      deckCount: 20,
      discard: [],
      eliminated: false,
    }));
    const positions = [
      'n0',
      'n1',
      'n2',
      'n3',
      'n4',
      'n5',
      'n6',
      'n7',
      'n8',
      'n9',
      'n10',
      'n11',
      'n12',
      'center',
      'n13',
      'n14',
      'n15',
      'n16',
      'n17',
      'n18',
    ];
    const fighters: GameView['fighters'] = players.flatMap((p, i) =>
      Array.from({ length: 4 }, (_, j) => ({
        id: `${p.id}:${j ? 'ally-' + j : 'main'}`,
        player: p.id,
        character: 'sun-wukong',
        definition: j ? 'sun-wukong-clone' : 'sun-wukong',
        role: j ? ('ally' as const) : ('main' as const),
        hp: j ? 1 : 17,
        position: positions[i * 4 + j],
        defeated: false,
        counters: {},
        statuses: [],
      })),
    );
    await presentationHarness(page, true, { players, fighters });
    await expect.poll(() => new Set(textures).size).toBe(2);
    const rider = page.getByRole('button', { name: 'Clone 2', exact: true }).first();
    await rider.click();
    await expect(rider).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: test.info().outputPath('four-colors-desktop.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({
      path: test.info().outputPath('four-colors-phone.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
    expect(new Set(textures).size).toBe(2);
  });
}
