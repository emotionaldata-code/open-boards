import { beforeEach, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../artwork/textures', () => ({ loadFigureTexture: mocks.load }));
beforeEach(() => {
  vi.resetModules();
  mocks.load.mockReset();
});

function atlas() {
  return new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
}

it('shares atlas frames while disposing only the effect sprite', async () => {
  const texture = atlas();
  mocks.load.mockResolvedValue(texture);
  const { createSpriteEffect, preloadEffects } = await import('./sprites');
  const layer = new Container();
  const frames = await preloadEffects();
  const effect = createSpriteEffect('impact', 'n0', layer);
  await vi.waitFor(() => expect(layer.children).toHaveLength(1));
  const sprite = layer.children[0] as Sprite;
  effect.update(0.6);
  expect(sprite.texture).toBe(frames.impact[2]);
  expect(frames.parry[3].frame).toMatchObject({ x: 768, y: 768, width: 256, height: 256 });
  effect.update(1);
  expect(sprite.alpha).toBe(0);
  effect.destroy();
  expect(layer.children).toHaveLength(0);
  expect(texture.destroyed).toBe(false);
  expect(frames.impact[2].destroyed).toBe(false);
  expect(await preloadEffects()).toBe(frames);
  expect(mocks.load).toHaveBeenCalledOnce();
});

it('does not resurrect cancelled effects when the atlas finishes loading', async () => {
  let resolve!: (texture: Texture) => void;
  mocks.load.mockReturnValue(
    new Promise<Texture>((done) => {
      resolve = done;
    }),
  );
  const { createSpriteEffect, preloadEffects } = await import('./sprites');
  const layer = new Container();
  const effect = createSpriteEffect('heal', 'n0', layer);
  effect.destroy();
  resolve(atlas());
  await preloadEffects();
  await Promise.resolve();
  expect(layer.children).toHaveLength(0);
});

it('can retry a failed atlas without leaving a rejected shared promise', async () => {
  mocks.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(atlas());
  const { preloadEffects } = await import('./sprites');
  await expect(preloadEffects()).rejects.toThrow('offline');
  expect((await preloadEffects()).heal).toHaveLength(4);
});
