import { expect, test, type Page } from '@playwright/test';
import type { Card, Command, Fighter } from '../../packages/game/src';
import type { ChoiceView, GameView } from '../../packages/protocol/src';
import { presentationHarness } from './fixtures/game';

type Harness = Window & {
  presentationCommands: Command[];
  updatePresentationGame: (view: Partial<GameView>) => void;
  releasePresentationCommand: () => void;
  setPresentationConnected: (connected: boolean) => void;
};
const commands = (page: Page) =>
  page.evaluate(() => (window as unknown as Harness).presentationCommands);
const update = async (page: Page, view: Partial<GameView>) => {
  const revision = Number(await page.locator('main.game-layout').getAttribute('data-revision'));
  await page.evaluate((view) => (window as unknown as Harness).updatePresentationGame(view), view);
  await expect(page.locator('main.game-layout')).toHaveAttribute(
    'data-revision',
    String(revision + 1),
  );
};
const fighters: Fighter[] = [
  {
    id: 'a:main',
    player: 'a',
    role: 'main',
    character: 'medusa',
    definition: 'medusa',
    hp: 15,
    position: 'n0',
    defeated: false,
    counters: {},
    statuses: [],
  },
  {
    id: 'a:ally-1',
    player: 'a',
    role: 'ally',
    character: 'medusa',
    definition: 'medusa-harpy',
    hp: 1,
    position: 'n5',
    defeated: false,
    counters: {},
    statuses: [],
  },
  {
    id: 'b:main',
    player: 'b',
    role: 'main',
    character: 'medusa',
    definition: 'medusa',
    hp: 15,
    position: 'n1',
    defeated: false,
    counters: {},
    statuses: [],
  },
];
const hand: Card[] = [
  { id: 'strike', definition: 'medusa-gaze-of-stone' },
  { id: 'guard', definition: 'medusa-hiss-and-slither' },
  { id: 'scheme', definition: 'medusa-winged-frenzy' },
];
const choice = (options: ChoiceView['options'], min = 1, max = 1): ChoiceView => ({
  id: 'unrelated-choice-id',
  player: 'a',
  prompt: 'Resolve the effect',
  options,
  min,
  max,
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`attack preparation, cancellation and one direct command at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await presentationHarness(page, true, { hand, fighters });
    const attack = page.getByRole('button', {
      name: 'Prepara attacco · Sguardo di pietra',
      exact: true,
    });
    await attack.click();
    await expect(page.getByRole('button', { name: /^Bersaglio / })).toHaveCount(1);
    await attack.click();
    await expect(page.getByRole('button', { name: /^Bersaglio / })).toHaveCount(0);
    await attack.click();
    await page.keyboard.press('Escape');
    await expect(attack).toHaveAttribute('aria-pressed', 'false');
    await attack.click();
    const target = page.getByRole('button', { name: /^Bersaglio / });
    await target.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    expect(await commands(page)).toEqual([
      { type: 'attack', fighter: 'a:main', card: 'strike', target: 'b:main' },
    ]);
    await expect(page.getByRole('button', { name: 'Commit attack' })).toHaveCount(0);
    await update(page, {});
    await expect(attack).toHaveAttribute('aria-pressed', 'false');
    await page.screenshot({ path: test.info().outputPath('direct-game.png') });
  });
}

test('action and defense cards send immediately, errors and disconnects release the command lock', async ({
  page,
}) => {
  await presentationHarness(page, true, { hand, fighters });
  const action = page.getByRole('button', { name: 'Gioca Frenesia alata', exact: true });
  await action.dblclick();
  expect(await commands(page)).toEqual([
    { type: 'play-action', fighter: 'a:main', card: 'scheme' },
  ]);
  await expect(action).toBeDisabled();
  await page.evaluate(() => (window as unknown as Harness).releasePresentationCommand());
  await expect(action).toBeEnabled();
  await action.click();
  await page.evaluate(() => (window as unknown as Harness).setPresentationConnected(false));
  await page.evaluate(() => (window as unknown as Harness).setPresentationConnected(true));
  await expect(action).toBeEnabled();
  await update(page, {
    phase: { type: 'awaiting-defense', attacker: 'b:main', defender: 'a:main' },
  });
  await page
    .getByRole('button', { name: 'Difendi con Sibilare e strisciare', exact: true })
    .click();
  expect((await commands(page)).at(-1)).toEqual({ type: 'defend', card: 'guard' });
  await update(page, { hand: [] });
  await page.getByRole('button', { name: 'Subisci il colpo', exact: true }).click();
  expect((await commands(page)).at(-1)).toEqual({ type: 'defend', card: null });
});

test('deck starts maneuver, a miniature selects the fighter and its current space stays', async ({
  page,
}) => {
  await presentationHarness(page, true, { hand, fighters });
  await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
  expect(await commands(page)).toEqual([{ type: 'maneuver' }]);
  await update(page, {
    phase: { type: 'choosing-movement', player: 'a' },
    maneuver: {
      player: 'a',
      remaining: ['a:main', 'a:ally-1'],
      finishing: false,
      boost: 0,
      boostable: true,
    },
  });
  await page.locator('.fighter-hit[data-fighter="a:ally-1"]').click();
  await page.locator('button.fighter-hit[aria-pressed="true"]').click();
  expect((await commands(page)).at(-1)).toEqual({ type: 'move', fighter: 'a:ally-1', path: [] });
  await update(page, {
    maneuver: { player: 'a', remaining: ['a:main'], finishing: false, boost: 0, boostable: true },
  });
  await page.getByRole('button', { name: /^Potenzia movimento \+3 ·/ }).click();
  expect((await commands(page)).at(-1)).toEqual({ type: 'boost-maneuver', card: 'guard' });
});

for (const [min, max] of [
  [1, 1],
  [2, 2],
  [0, 2],
]) {
  test(`real hand discard ${min}–${max} has one contextual submission`, async ({ page }) => {
    const options = hand.map((card, i) => ({
      id: `unrelated-${i}`,
      label: `Discard ${card.id}`,
      card,
    }));
    await presentationHarness(page, true, {
      hand,
      fighters,
      phase: { type: 'ability-choice', player: 'a' },
      choice: choice(options, min, max),
    });
    await expect(page.locator('.game-card')).toHaveCount(hand.length);
    await page.getByRole('button', { name: 'Discard strike', exact: true }).click();
    if (max > 1) {
      expect(await commands(page)).toEqual([]);
      await page.getByRole('button', { name: 'Discard guard', exact: true }).click();
      await page.getByRole('button', { name: 'Discard strike', exact: true }).click();
      if (min === 2)
        await page.getByRole('button', { name: 'Discard scheme', exact: true }).click();
      await page.getByRole('button', { name: /^Conferma scelta ·/ }).click();
    }
    expect((await commands(page)).at(-1)).toEqual({
      type: 'choose',
      choice: 'unrelated-choice-id',
      options:
        max === 1 ? ['unrelated-0'] : min === 2 ? ['unrelated-1', 'unrelated-2'] : ['unrelated-1'],
    });
  });
}

test('typed references target players, spaces, defeated miniatures and piles independently of ids', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await presentationHarness(page, false, {
    hand,
    fighters,
    phase: { type: 'ability-choice', player: 'a' },
    choice: choice([
      { id: 'opaque-player', label: 'Choose Briar', object: { type: 'fighter', id: 'b:main' } },
    ]),
  });
  await expect(page.locator('.board-error')).toBeVisible();
  await expect(page.locator('.hand .compact-card')).toHaveCount(hand.length);
  await page.getByRole('button', { name: 'Choose Briar', exact: true }).click();
  expect((await commands(page)).at(-1)).toMatchObject({ options: ['opaque-player'] });
  await update(page, {
    choice: choice([
      { id: 'opaque-space', label: 'Destination', object: { type: 'space', id: 'n2' } },
    ]),
  });
  await page.getByRole('button', { name: 'Scegli casella 03', exact: true }).click();
  expect((await commands(page)).at(-1)).toMatchObject({ options: ['opaque-space'] });
  await update(page, {
    fighters: fighters.map((f) =>
      f.role === 'ally' ? { ...f, position: null, defeated: true } : f,
    ),
    choice: choice([
      { id: 'opaque-revive', label: 'Return Harpy', object: { type: 'fighter', id: 'a:ally-1' } },
    ]),
  });
  await page.getByRole('button', { name: 'Return Harpy', exact: true }).click();
  expect((await commands(page)).at(-1)).toMatchObject({ options: ['opaque-revive'] });
  await update(page, {
    choice: choice([
      {
        id: 'opaque-pile',
        label: 'Search discard first',
        object: { type: 'pile', player: 'a', zone: 'discard' },
      },
    ]),
  });
  await page.getByRole('button', { name: 'Cerca prima negli scarti', exact: true }).click();
  expect((await commands(page)).at(-1)).toMatchObject({ options: ['opaque-pile'] });
});

test('overlapping tokens and a fighter have separate touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await presentationHarness(page, false, {
    hand,
    fighters,
    boardTokens: [
      { id: 'first', owner: 'a:main', kind: 'fog', name: 'Fog 1', position: 'n0' },
      { id: 'second', owner: 'a:main', kind: 'fog', name: 'Fog 2', position: 'n0' },
    ],
    phase: { type: 'ability-choice', player: 'a' },
    choice: choice([
      { id: 'one', label: 'First fog', object: { type: 'token', id: 'first' } },
      { id: 'two', label: 'Second fog', object: { type: 'token', id: 'second' } },
    ]),
  });
  const tokens = page.locator('button.token-choice');
  await expect(tokens).toHaveCount(2);
  const boxes = await tokens.evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect().toJSON()),
  );
  expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].x + 44);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await tokens.nth(1).click();
  expect((await commands(page)).at(-1)).toMatchObject({ options: ['two'] });
});

test('numeric values keep all 101 values and illustrated external cards retain server order', async ({
  page,
}) => {
  await presentationHarness(page, true, {
    hand,
    fighters,
    phase: { type: 'ability-choice', player: 'a' },
    choice: choice(
      Array.from({ length: 101 }, (_, value) => ({
        id: `opaque-${value}`,
        label: String(value),
        value,
      })),
    ),
  });
  await expect(page.getByRole('combobox', { name: 'Valore' }).locator('option')).toHaveCount(101);
  await page.getByRole('combobox', { name: 'Valore' }).selectOption('opaque-100');
  expect(await commands(page)).toEqual([]);
  await page.getByRole('button', { name: 'Conferma valore' }).click();
  expect((await commands(page)).at(-1)).toMatchObject({ options: ['opaque-100'] });
  await update(page, {
    choice: choice([
      {
        id: 'next',
        label: 'Successiva top card',
        card: { id: 'external', definition: 'king-arthur-excalibur' },
      },
    ]),
  });
  await page.getByRole('button', { name: 'Successiva top card', exact: true }).click();
  expect((await commands(page)).at(-1)).toMatchObject({ options: ['next'] });
});

test('the deck remains clickable after scrolling cards on a landscape phone', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await presentationHarness(page, true, {
    hand: Array.from({ length: 8 }, (_, i) => ({ id: `card-${i}`, definition: 'medusa-dash' })),
    fighters,
  });
  await page.locator('.game-card').last().scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Manovra · pesca una carta', exact: true }).click();
  expect(await commands(page)).toEqual([{ type: 'maneuver' }]);
});

test('one required hand-limit discard plays on click, optional discard can pass empty', async ({
  page,
}) => {
  const cards = Array.from({ length: 8 }, (_, i) => ({
    id: `limit-${i}`,
    definition: 'medusa-dash',
  }));
  await presentationHarness(page, true, {
    hand: cards,
    fighters,
    phase: { type: 'discarding', player: 'a' },
  });
  await page.locator('.game-card').first().click();
  expect(await commands(page)).toEqual([{ type: 'discard', cards: ['limit-0'] }]);
  await update(page, {
    phase: { type: 'ability-choice', player: 'a' },
    choice: choice(
      cards.map((card) => ({ id: card.id, label: 'Discard Dash', card })),
      0,
      2,
    ),
  });
  await page.getByRole('button', { name: 'Passa', exact: true }).click();
  expect((await commands(page)).at(-1)).toMatchObject({ type: 'choose', options: [] });
});
