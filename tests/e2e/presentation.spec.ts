import { expect, test } from '@playwright/test';
import { presentationHarness } from './fixtures/game';

test('sound controls unlock recordings and every mixed cue is audible and unclipped', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const initiallyEnabled = page.getByRole('button', { name: 'Disattiva audio', exact: true });
  if (await initiallyEnabled.isVisible()) await initiallyEnabled.click();
  const enable = page.getByRole('button', { name: 'Attiva audio', exact: true });
  await expect(enable).toHaveAttribute('aria-pressed', 'false');
  await enable.click();
  const mute = page.getByRole('button', { name: 'Disattiva audio', exact: true });
  await expect(mute).toHaveAttribute('aria-pressed', 'true');

  const signals = await page.evaluate(async () => {
    const url = '/src/audio/cues.ts';
    const { cues, loadSamples, playCue } = (await import(
      url
    )) as typeof import('../../apps/client/src/audio/cues');
    const mixUrl = '/src/audio/mix.ts';
    const { createMix } = (await import(
      mixUrl
    )) as typeof import('../../apps/client/src/audio/mix');
    const playerUrl = '/src/audio/player.ts';
    const { sound } = (await import(
      playerUrl
    )) as typeof import('../../apps/client/src/audio/player');
    const stop = sound.play('shield');
    stop(); // Cancellation must also work with a real AudioContext.
    const signals = [];
    for (const name of Object.keys(cues) as (keyof typeof cues)[]) {
      const context = new OfflineAudioContext(2, 144000, 48000);
      const mix = createMix(context);
      mix.master.gain.value = 0.75;
      const bank = await loadSamples(context);
      playCue(context, mix.input, name, bank);
      const buffer = await context.startRendering();
      const samples = buffer.getChannelData(0);
      let peak = 0,
        energy = 0,
        tail = 0;
      samples.forEach((value, index) => {
        peak = Math.max(peak, Math.abs(value));
        energy += value * value;
        if (index > samples.length - 2400) tail = Math.max(tail, Math.abs(value));
      });
      signals.push({ name, peak, rms: Math.sqrt(energy / samples.length), tail });
    }
    const burst = new OfflineAudioContext(2, 144000, 48000);
    const mix = createMix(burst);
    mix.master.gain.value = 1;
    const bank = await loadSamples(burst);
    for (let i = 0; i < 16; i++) playCue(burst, mix.input, 'impact', bank);
    const combined = (await burst.startRendering()).getChannelData(0);
    let burstPeak = 0;
    for (const sample of combined) burstPeak = Math.max(burstPeak, Math.abs(sample));
    if (burstPeak >= 1) throw new Error(`Overlapping impacts clip: ${burstPeak}`);
    return signals;
  });
  for (const signal of signals) {
    expect(signal.rms, `${signal.name} is audible`).toBeGreaterThan(0.001);
    expect(signal.peak, `${signal.name} does not clip`).toBeLessThan(1);
    expect(signal.tail, `${signal.name} ends cleanly`).toBeLessThan(0.001);
  }
  await mute.click();
  await expect(enable).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

async function present(
  page: import('@playwright/test').Page,
  outcomes: import('../../packages/game/src/index').Outcome[],
  reconnect = false,
) {
  await page.evaluate(
    ({ outcomes, reconnect }) => {
      (
        window as unknown as {
          presentOutcomes: (
            outcomes: import('../../packages/game/src/index').Outcome[],
            reconnect: boolean,
          ) => void;
        }
      ).presentOutcomes(outcomes, reconnect);
    },
    { outcomes, reconnect },
  );
}

const combat: import('../../packages/game/src/index').Outcome = {
  type: 'combat',
  sequence: 1,
  revision: 1,
  audience: 'all',
  combat: {
    attacker: 'a:main',
    defender: 'b:main',
    attack: { id: 'attack', definition: 'medusa-second-shot-3' },
    defense: { id: 'defense', definition: 'medusa-hiss-and-slither' },
    boosts: [],
    damage: 2,
  },
};

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 768, height: 900 },
  { width: 390, height: 667 },
  { width: 667, height: 375 },
]) {
  test(`combat review shows both artworks, full rules and authoritative damage at ${viewport.width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: viewport.width === 390 ? 'reduce' : 'no-preference' });
    await presentationHarness(page);
    await present(page, [combat]);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Secondo colpo');
    await expect(dialog).toContainText('Sibilare e strisciare');
    await expect(dialog).toContainText('Medusa subisce 2 danni.');
    await expect(dialog.locator('.character-portrait img')).toHaveCount(2);
    await expect(dialog.locator('.card-art img')).toHaveCount(2);
    expect(
      await dialog
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0,
          ),
        ),
    ).toBe(true);
    const button = dialog.getByRole('button', { name: 'Conferma', exact: true });
    await expect(button).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(2400); // Reviews must outlive the animation, including reduced motion.
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    const actionBounds = await button.boundingBox();
    expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`combat-review-${viewport.width}.png`) });
    await button.click();
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('action and special effects append in order, block commands, and reset cleanly without WebGL', async ({
  page,
}) => {
  await presentationHarness(page, false);
  await present(page, [
    {
      type: 'played',
      player: 'a',
      fighter: 'a:main',
      card: { id: 'action', definition: 'medusa-winged-frenzy' },
      sequence: 1,
      revision: 1,
      audience: 'all',
    },
  ]);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Frenesia alata');
  await expect(dialog).toContainText('Muovi ogni tuo combattente');
  await expect(dialog.locator('.character-portrait img')).toHaveCount(1);
  await expect(dialog.locator('.card-art img')).toHaveCount(1);
  await present(page, [
    {
      type: 'ability',
      fighter: 'b:main',
      name: 'Petrifying gaze',
      sequence: 2,
      revision: 2,
      audience: 'all',
    },
    {
      type: 'status',
      fighter: 'a:main',
      status: 'burn',
      stacks: 1,
      sequence: 3,
      revision: 2,
      audience: 'all',
    },
  ]);
  await expect(dialog).toContainText('Frenesia alata');
  await expect(
    page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('action-review.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Sguardo pietrificante', exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText('All’inizio del turno, puoi infliggere 1 danno');
  await page.screenshot({
    path: test.info().outputPath('ability-review.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Bruciatura', exact: true })).toBeVisible();
  await expect(dialog).toContainText('subisci 1 danno');
  await present(page, [], true);
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { presentationCommands: unknown[] }).presentationCommands,
    ),
  ).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 768, height: 900 },
  { width: 390, height: 667 },
  { width: 844, height: 390 },
]) {
  test(`boosted combat displays the payment, BOOST values and confirmed result at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await presentationHarness(page);
    const boosted = structuredClone(combat);
    if (boosted.type !== 'combat') throw new Error('Expected combat fixture');
    boosted.combat.boosts = [
      { card: { id: 'boost', definition: 'medusa-a-momentary-glance' }, amount: 4 },
    ];
    await present(page, [boosted]);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('BOOST +4');
    await expect(dialog).toContainText('Uno sguardo fugace');
    await expect(dialog).toContainText('Medusa subisce 2 danni.');
    await expect(dialog.locator('.card-boost')).toHaveText(['3', '3', '4']);
    for (const [index, value] of [3, 3, 4].entries())
      await expect(dialog.locator('.card-boost').nth(index)).toHaveAttribute(
        'aria-label',
        `BOOST ${value}`,
      );
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    for (const card of await dialog.locator('.printed-card').all()) {
      expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await page.screenshot({
      path: test.info().outputPath(`boosted-combat-${viewport.width}.png`),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test('two attack BOOST payments remain readable on tablet and landscape phone', async ({
  page,
}) => {
  for (const viewport of [
    { width: 768, height: 900 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await presentationHarness(page);
    const boosted = structuredClone(combat);
    if (boosted.type !== 'combat') throw new Error('Expected combat fixture');
    boosted.combat.boosts = [
      { card: { id: 'first-boost', definition: 'medusa-a-momentary-glance' }, amount: 4 },
      { card: { id: 'second-boost', definition: boosted.combat.attack.definition }, amount: 3 },
    ];
    await present(page, [boosted]);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.event-participant')).toHaveCount(4);
    await expect(dialog).toContainText('BOOST +4');
    await expect(dialog).toContainText('BOOST +3');
    for (const card of await dialog.locator('.printed-card').all())
      expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`two-boosts-${viewport.width}.png`),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});
