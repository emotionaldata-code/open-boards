import { contentText } from '../../apps/client/src/localization/text';
import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../../packages/game/src';

test.use({ actionTimeout: 10_000, navigationTimeout: 15_000, hasTouch: true });

const characters = [
  ['medusa', 'Petrifying gaze'],
  ['the-genie', 'Infinite Power'],
  ['bigfoot', 'Loner by Nature'],
  ['dracula', 'Bloodthirsty'],
  ['philippa', 'Two Steps Ahead'],
  ['bruce-lee', 'Choose a destination'],
  ['darth-vader', 'Discard up to 1 card'],
] as const;

/** Real rules, projections and presentation updates; no reload during ability resolution. */
async function mount(page: Page, character: string) {
  await page.goto('/');
  await page.evaluate(
    async ({ rootPath, character }) => {
      const resource = (name: string) =>
        performance
          .getEntriesByType('resource')
          .find((e) => new URL(e.name).pathname.endsWith(`/deps/${name}.js`))!.name;
      const { createElement } = (await import(resource('react'))).default;
      const { createRoot } = (await import(resource('react-dom_client'))).default;
      const gameUrl = '/src/game/Game.tsx';
      const eventsUrl = '/src/animation/events.ts';
      const { presentationEvents } = (await import(
        eventsUrl
      )) as typeof import('../../apps/client/src/animation/events');
      const engineUrl = `/@fs${rootPath}/packages/game/src/index.ts`;
      const contentUrl = `/@fs${rootPath}/packages/content/src/index.ts`;
      const projectionUrl = `/@fs${rootPath}/apps/server/src/transport/projection.ts`;
      const { Game } = (await import(gameUrl)) as typeof import('../../apps/client/src/game/Game');
      const { createGame, execute, deploymentSpaces } = (await import(
        engineUrl
      )) as typeof import('../../packages/game/src');
      const { basic, deckDefinitions } = (await import(
        contentUrl
      )) as typeof import('../../packages/content/src');
      const { projectGame } = (await import(
        projectionUrl
      )) as typeof import('../../apps/server/src/transport/projection');
      const saved = sessionStorage.getItem('turn-ability-state');
      let state: GameState = saved
        ? JSON.parse(saved)
        : createGame(
            [character, 'king-arthur'].map((character, i) => ({
              id: `p${i}`,
              name: i ? 'Rival' : 'Owner',
              character,
              deck: deckDefinitions(character).map((definition, j) => ({
                id: `p${i}-${j}`,
                definition,
              })),
            })),
            basic,
          );
      const apply = (command: import('../../packages/game/src').Command, actor = 'p0') => {
        const result = execute(
          state,
          actor,
          { id: `turn-${state.revision}`, revision: state.revision, command },
          basic,
        );
        if (!result.ok) throw new Error(result.message);
        state = result.state;
      };
      if (!saved) {
        while (state.phase.type === 'placing-allies') {
          const fighter = state.fighters.find((f) => f.position === null)!;
          apply(
            {
              type: 'place-ally',
              fighter: fighter.id,
              position: deploymentSpaces(state, fighter.id, basic.map)[0],
            },
            fighter.player,
          );
        }
        for (const [i, fighter] of state.fighters.entries()) {
          fighter.position =
            fighter.role === 'ally'
              ? fighter.player === 'p0'
                ? `n${14 + i}`
                : 'n23'
              : fighter.player === 'p0'
                ? 'n0'
                : ['medusa', 'dracula', 'darth-vader'].includes(character)
                  ? 'n1'
                  : 'n22';
        }
        if (['bigfoot', 'philippa', 'bruce-lee'].includes(character)) {
          if (character === 'philippa') state.players[0].hand.splice(1);
          while (state.turn === 0 && state.phase.type === 'taking-actions') {
            apply({ type: 'maneuver' });
            apply({ type: 'finish-maneuver' });
          }
        }
      }
      document.getElementById('root')!.hidden = true;
      const host = document.createElement('div');
      host.className = 'shell in-match';
      document.body.append(host);
      const root = createRoot(host);
      let game = projectGame(state, 'p0', false);
      let events: import('../../apps/client/src/animation/events').PresentationEvent[] = [];
      const render = () => {
        sessionStorage.setItem('turn-ability-state', JSON.stringify(state));
        root.render(
          createElement(Game, {
            room: {
              id: 'turn-ability',
              host: 'p0',
              capacity: 2,
              seats: [],
              game,
            },
            user: { id: 'p0', name: 'Owner' },
            events,
            reset: 0,
            connected: true,
            onLeave: () => {},
            onCommand: (command: import('../../packages/game/src').Command) => {
              const previous = game;
              const result = execute(
                state,
                'p0',
                { id: `turn-${state.revision}`, revision: state.revision, command },
                basic,
              );
              if (!result.ok) throw new Error(result.message);
              state = result.state;
              game = projectGame(state, 'p0', false);
              events = [...events, ...presentationEvents(previous, game, result.outcomes)];
              render();
            },
          }),
        );
      };
      render();
    },
    { rootPath: process.cwd(), character },
  );
  await expect(page.locator('main.game-layout')).toHaveAttribute('data-phase', 'ability-choice');
}

const state = (page: Page): Promise<GameState> =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem('turn-ability-state')!));

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 844, height: 390 },
]) {
  for (const [character, prompt] of characters) {
    for (const targetInput of [
      'panel',
      ...(['medusa', 'dracula', 'darth-vader'].includes(character) ? ['map'] : []),
    ]) {
      test(`${character} resolves its turn ability through continuous pointer input (${viewport.width}, ${targetInput})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await mount(page, character);
        const panel = page.locator('.hand-panel');
        await page.addLocatorHandler(
          page.locator('.event-acknowledgement button:not(:disabled)'),
          async (button) => {
            await button.click();
          },
        );
        await expect(panel).toBeVisible();
        expect((await state(page)).resolution.choice?.prompt).toBe(prompt);
        const optional = !['bruce-lee', 'darth-vader'].includes(character);
        if (optional) {
          const original = await state(page);
          await expect(
            panel.getByRole('button', { name: new RegExp(`^(Use|Usa) ${contentText(prompt)}$`) }),
          ).toBeVisible();
          await expect(panel.getByRole('button', { name: /^(Skip|Salta)$/ })).toBeVisible();
          await panel.getByRole('button', { name: /^(Skip|Salta)$/ }).click();
          const skipped = await state(page);
          expect(skipped.players.map((p) => p.hand)).toEqual(original.players.map((p) => p.hand));
          expect(skipped.fighters).toEqual(original.fighters);
          expect(skipped.turn).toBe(['bigfoot', 'philippa'].includes(character) ? 1 : 0);
          expect(skipped.phase.type).toBe('taking-actions');
          // Exercise persisted choices from before the fix, whose Use action carried a fighter object.
          if (viewport.width === 844)
            original.resolution.choice!.options[0].object = { type: 'fighter', id: 'p0:main' };
          await page.evaluate(
            (saved) => sessionStorage.setItem('turn-ability-state', JSON.stringify(saved)),
            original,
          );
        }
        await mount(page, character);
        const before = await state(page);
        if (optional) {
          const use = panel.getByRole('button', {
            name: new RegExp(`^(Use|Usa) ${contentText(prompt)}$`),
          });
          await expect(use).toBeVisible();
          await page.screenshot({
            path: test.info().outputPath(`${character}-activation.png`),
            animations: 'disabled',
            timeout: 10_000,
          });
          await use.click();
        }
        if (character === 'medusa' || character === 'dracula') {
          expect((await state(page)).resolution.choice?.prompt).toBe('Choose a fighter');
          const target = panel.getByRole('button', { name: 'Scegli Re Artù · Rival', exact: true });
          await expect(target).toBeVisible();
          await expect(page.locator('button[data-fighter="p1:main"]')).toHaveClass(/is-target/);
          if (targetInput === 'panel') await target.click();
          else if (viewport.width === 844)
            await page.locator('button[data-fighter="p1:main"]').tap();
          else await page.locator('button[data-fighter="p1:main"]').click();
          const after = await state(page);
          expect(after.fighters.find((f) => f.id === 'p1:main')!.hp).toBe(
            before.fighters.find((f) => f.id === 'p1:main')!.hp - 1,
          );
          expect(after.players[0].hand.length).toBe(
            before.players[0].hand.length + (character === 'dracula' ? 1 : 0),
          );
          expect(after.actions).toBe(2);
        } else if (character === 'the-genie') {
          expect((await state(page)).resolution.choice?.prompt).toBe('Discard 1 card');
          expect((await state(page)).actions).toBe(2);
          await panel.locator('button.game-card').first().click();
          const after = await state(page);
          expect(after.actions).toBe(3);
          expect(after.players[0].hand.length).toBe(before.players[0].hand.length - 1);
          expect(after.players[0].discard).toHaveLength(1);
        } else if (character === 'bigfoot') {
          await expect(page.locator('main.game-layout')).toHaveAttribute(
            'data-phase',
            'discarding',
          );
          expect((await state(page)).turn).toBe(0);
          await panel.locator('button.game-card').first().click();
          expect((await state(page)).players[0].hand).toHaveLength(7);
          expect((await state(page)).turn).toBe(1);
        } else if (character === 'philippa') {
          expect((await state(page)).players[0].hand).toHaveLength(4);
          expect((await state(page)).turn).toBe(1);
        } else if (character === 'bruce-lee') {
          await page.getByRole('button', { name: /^(Choose space|Scegli casella) 02$/ }).click();
          expect((await state(page)).fighters[0].position).toBe('n1');
          expect((await state(page)).turn).toBe(1);
        } else {
          await panel.locator('button.game-card').first().click();
          await panel
            .getByRole('button', { name: /^(Confirm choice|Conferma scelta) · 1 \/ 1$/ })
            .click();
          expect((await state(page)).resolution.choice?.prompt).toBe('Choose a fighter');
          const target = panel.getByRole('button', { name: 'Scegli Re Artù · Rival', exact: true });
          await expect(target).toBeVisible();
          await expect(page.locator('button[data-fighter="p1:main"]')).toHaveClass(/is-target/);
          if (targetInput === 'panel') await target.click();
          else if (viewport.width === 844)
            await page.locator('button[data-fighter="p1:main"]').tap();
          else await page.locator('button[data-fighter="p1:main"]').click();
          const after = await state(page);
          expect(after.players[0].discard).toHaveLength(1);
          expect(after.fighters.find((f) => f.id === 'p1:main')!.hp).toBeLessThan(
            before.fighters.find((f) => f.id === 'p1:main')!.hp,
          );
        }
        const after = await state(page);
        expect(after.phase.type).toBe('taking-actions');
        expect(after.resolution.choice).toBeNull();
        expect(after.resolution.queue).toEqual([]);
        expect(after.resolution.frames).toEqual({});
        expect(errors).toEqual([]);
      });
    }
  }
}
