import { expect, it, vi } from 'vitest';
import type { Sprite, Texture } from 'pixi.js';

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
  return { figure, render, resolve, reject };
}

it('shows only the owner base while pending and adds the raster at its registered anchor', async () => {
  const { figure, render, resolve } = await pendingFigure();
  expect(figure.children).toHaveLength(1);
  const base = figure.children[0];
  resolve({} as Texture);
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  expect(figure.children).toHaveLength(2);
  expect((figure.children[1] as Sprite).anchor.set).toHaveBeenCalledWith(0.5, 0.96875);
  expect(base.destroyed).toBe(false);
  expect(figure.children[0]).toBe(base);
});

it('keeps only the owner base on load failure', async () => {
  const { figure, render, reject } = await pendingFigure();
  reject(new Error('offline'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(figure.children).toHaveLength(1);
  expect(render).not.toHaveBeenCalled();
});

it.each(['scene', 'actor'])('ignores a completed load after %s destruction', async (target) => {
  let active = true;
  const { figure, render, resolve } = await pendingFigure(() => active);
  if (target === 'scene') active = false;
  else figure.destroy();
  resolve({} as Texture);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(figure.children).toHaveLength(1);
  expect(render).not.toHaveBeenCalled();
});

it('does not request raster textures for an unmigrated fighter', async () => {
  const { createFigure } = await import('./figures');
  mocks.load.mockClear();
  createFigure('unmigrated-test-fighter', 0xdcc58d);
  expect(mocks.load).not.toHaveBeenCalled();
});
