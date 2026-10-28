import { expect, it, vi } from 'vitest';
import type { Application, Container } from 'pixi.js';
import { basic, deckDefinitions } from '@open-boards/content';
import { createGame, execute } from '@open-boards/game';
import { projectGame } from '../../../server/src/transport/projection';

const mocks = vi.hoisted(() => ({ figure: vi.fn() }));
vi.mock('./figures', () => ({
  createFigure: mocks.figure,
  playerColors: [0xdcc58d, 0x91d9c7, 0xef9c8f, 0xc1c9ec],
}));
vi.mock('../animation/playback', () => ({ playPresentation: vi.fn() }));
vi.mock('../audio/player', () => ({ sound: { play: vi.fn() } }));
vi.mock('pixi.js', () => {
  class Container {
    children: Container[] = [];
    destroyed = false;
    position = { set: vi.fn() };
    anchor = { set: vi.fn() };
    y = 0;
    addChild(...children: Container[]) {
      this.children.push(...children);
    }
    removeChildren() {
      const children = this.children;
      this.children = [];
      return children;
    }
    removeChild(child: Container) {
      this.children = this.children.filter((c) => c !== child);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Text extends Container {}
  return { Container, Text };
});
it('replaces an existing board figure when setup changes its identity, preserving owner color and sharing unchanged actors', async () => {
  const { Container: Node } = await import('pixi.js');
  const { ArenaScene } = await import('./scene');
  mocks.figure.mockImplementation(() => new Node());
  const app = { stage: new Node() } as Application;
  const scene = new ArenaScene(app, vi.fn());
  const state = createGame(
    ['yennefer-triss', 'bruce-lee'].map((character, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      character,
      deck: deckDefinitions(character).map((definition, j) => ({ id: `p${i}-${j}`, definition })),
    })),
    basic,
  );
  scene.update(projectGame(state, 'p0', false), [], 0);
  const original = mocks.figure.mock.results[0].value as Container;
  expect(mocks.figure.mock.calls[0].slice(0, 2)).toEqual(['yennefer-triss', 0xdcc58d]);
  const result = execute(
    state,
    'p0',
    {
      id: 'choose-hero',
      revision: state.revision,
      command: {
        type: 'choose',
        choice: state.resolution.choice!.id,
        options: ['yennefer-triss-triss'],
      },
    },
    basic,
  );
  if (!result.ok) throw new Error(result.message);
  scene.update(projectGame(result.state, 'p0', false), [], 0);
  expect(original.destroyed).toBe(true);
  expect(mocks.figure.mock.calls[2].slice(0, 2)).toEqual(['yennefer-triss-triss', 0xdcc58d]);
  scene.update(projectGame(result.state, 'p0', false), [], 0);
  expect(mocks.figure).toHaveBeenCalledTimes(3);
  scene.destroy();
});
