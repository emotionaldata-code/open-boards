import { expect, it, vi } from 'vitest';
import type { Texture } from 'pixi.js';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../artwork/textures', () => ({ loadFigureTexture: mocks.load }));
vi.mock('pixi.js', () => {
  class Container {
    children: Container[] = [];
    destroyed = false;
    scale = { set: vi.fn() };
    anchor = { set: vi.fn() };
    addChild(child: Container) {
      this.children.push(child);
    }
    addChildAt(child: Container, index: number) {
      this.children.splice(index, 0, child);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Graphics extends Container {
    ellipse() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
    svg() {
      return this;
    }
  }
  class Sprite extends Container {}
  return { Container, Graphics, Sprite };
});

async function pendingFigure(active = () => true) {
  const { createFigure } = await import('./figures');
  let resolve!: (texture: Texture) => void;
  let reject!: (error: Error) => void;
  mocks.load.mockReturnValue(
    new Promise<Texture>((done, fail) => {
      resolve = done;
      reject = fail;
    }),
  );
  const render = vi.fn();
  const figure = createFigure('medusa', 0xef9c8f, render, active);
  const fallback = figure.children[1];
  return { figure, fallback, render, resolve, reject };
}

it('replaces only figure pixels while retaining the separate owner base', async () => {
  const { figure, fallback, render, resolve } = await pendingFigure();
  const base = figure.children[0];
  resolve({} as Texture);
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  expect(fallback.destroyed).toBe(true);
  expect(base.destroyed).toBe(false);
  expect(figure.children[0]).toBe(base);
});

it('keeps SVG fallback on load failure', async () => {
  const { figure, fallback, render, reject } = await pendingFigure();
  reject(new Error('offline'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fallback.destroyed).toBe(false);
  expect(figure.children).toHaveLength(2);
  expect(render).not.toHaveBeenCalled();
});

it.each(['scene', 'actor'])('ignores a completed load after %s destruction', async (target) => {
  let active = true;
  const { figure, fallback, render, resolve } = await pendingFigure(() => active);
  if (target === 'scene') active = false;
  else figure.destroy();
  resolve({} as Texture);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fallback.destroyed).toBe(false);
  expect(figure.children).toHaveLength(2);
  expect(render).not.toHaveBeenCalled();
});

it('does not request raster textures for an unmigrated fighter', async () => {
  const { createFigure } = await import('./figures');
  mocks.load.mockClear();
  createFigure('king-arthur', 0xdcc58d);
  expect(mocks.load).not.toHaveBeenCalled();
});
