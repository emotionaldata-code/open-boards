import { expect, test } from '@playwright/test';

test('sound controls unlock audio and every synthesized cue renders an audible, unclipped signal', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const enable = page.getByRole('button', { name: 'Enable sound', exact: true });
  await expect(enable).toHaveAttribute('aria-pressed', 'false');
  await enable.click();
  const mute = page.getByRole('button', { name: 'Mute sound', exact: true });
  await expect(mute).toHaveAttribute('aria-pressed', 'true');

  const signals = await page.evaluate(async () => {
    const url = '/src/audio/cues.ts';
    const { cues, synthesize } = (await import(
      url
    )) as typeof import('../../apps/client/src/audio/cues');
    const playerUrl = '/src/audio/player.ts';
    const { sound } = (await import(
      playerUrl
    )) as typeof import('../../apps/client/src/audio/player');
    const stop = sound.play('shield');
    stop(); // Cancellation must also work with a real AudioContext.
    const signals = [];
    for (const name of Object.keys(cues) as (keyof typeof cues)[]) {
      const context = new OfflineAudioContext(1, 96000, 48000);
      const master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      synthesize(context, master, name);
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

// Render the real client with deterministic, viewer-safe snapshots; no engine or server hooks.
async function presentationHarness(page: import('@playwright/test').Page, webgl = true) {
  if (!webgl)
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = (() =>
        null) as typeof HTMLCanvasElement.prototype.getContext;
    });
  await page.goto('/');
  await page.evaluate(async () => {
    const resourceUrl = (file: string) =>
      performance
        .getEntriesByType('resource')
        .find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${file}.js`))!.name;
    const reactUrl = resourceUrl('react');
    const domUrl = resourceUrl('react-dom_client');
    const gameUrl = '/src/game/Game.tsx';
    const eventsUrl = '/src/animation/events.ts';
    const { createElement } = (await import(reactUrl)).default;
    const { createRoot } = (await import(domUrl)).default;
    const { Game } = (await import(gameUrl)) as typeof import('../../apps/client/src/game/Game');
    const { presentationEvents } = (await import(
      eventsUrl
    )) as typeof import('../../apps/client/src/animation/events');
    document.getElementById('root')!.hidden = true;
    const host = document.createElement('div');
    host.className = 'shell in-match';
    document.body.append(host);
    const root = createRoot(host);
    let game: import('../../packages/protocol/src/index').GameView = {
      revision: 0,
      sequence: 0,
      turn: 0,
      actions: 2,
      phase: { type: 'taking-actions' },
      revealed: null,
      hand: [],
      paused: false,
      choice: null,
      maneuver: null,
      players: ['Arden', 'Briar'].map((name, i) => ({
        id: i ? 'b' : 'a',
        name,
        character: 'medusa',
        handCount: 5,
        deckCount: 15,
        discard: [],
        eliminated: false,
      })),
      fighters: ['a', 'b'].map((id, i) => ({
        id: `${id}:main`,
        player: id,
        role: 'main',
        character: 'medusa',
        definition: 'medusa',
        hp: 15,
        position: i ? 'n13' : 'n0',
        defeated: false,
        counters: {},
        statuses: [],
      })),
    };
    let events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
    let reset = 0;
    const commands: import('../../packages/game/src/index').Command[] = [];
    const render = () =>
      root.render(
        createElement(Game, {
          room: { id: 'test', host: 'a', capacity: 2, seats: [], game },
          user: { id: 'a', name: 'Arden' },
          events,
          reset,
          connected: true,
          onCommand: (command: import('../../packages/game/src/index').Command) =>
            commands.push(command),
          onLeave: () => {},
        }),
      );
    Object.assign(window, {
      presentOutcomes: (
        outcomes: import('../../packages/game/src/index').Outcome[],
        reconnect = false,
      ) => {
        const next = { ...game, revision: game.revision + 1 };
        events = reconnect ? [] : [...events, ...presentationEvents(game, next, outcomes)];
        if (reconnect) reset++;
        game = next;
        render();
      },
      presentationCommands: commands,
    });
    render();
  });
  await expect(page.locator('main.game-layout')).toHaveAttribute('data-revision', '0');
}

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
    await expect(dialog).toContainText('Second Shot');
    await expect(dialog).toContainText('Hiss and Slither');
    await expect(dialog).toContainText('Medusa takes 2 damage.');
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
    const button = dialog.getByRole('button', { name: 'Acknowledge', exact: true });
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
  await expect(dialog).toContainText('Winged Frenzy');
  await expect(dialog).toContainText('Move each of your fighters');
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
  await expect(dialog).toContainText('Winged Frenzy');
  await expect(page.getByRole('button', { name: 'Maneuver', exact: true })).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('action-review.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Petrifying gaze', exact: true })).toBeVisible();
  await expect(dialog).toContainText('At turn start, may deal 1 damage');
  await page.screenshot({
    path: test.info().outputPath('ability-review.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Burn', exact: true })).toBeVisible();
  await expect(dialog).toContainText('take 1 damage');
  await present(page, [], true);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Maneuver', exact: true })).toBeVisible();
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
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('BOOST +4');
    await expect(dialog).toContainText('A Momentary Glance');
    await expect(dialog).toContainText('Medusa takes 2 damage.');
    await expect(dialog.locator('.card-boost')).toHaveText(['BOOST 3', 'BOOST 3', 'BOOST 4']);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    for (const card of await dialog.locator('.printed-card').all()) {
      expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await page.screenshot({
      path: test.info().outputPath(`boosted-combat-${viewport.width}.png`),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}
