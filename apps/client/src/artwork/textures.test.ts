import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('pixi.js', () => ({ Assets: { load: mocks.load } }));

beforeEach(() => mocks.load.mockReset());

it('shares a single pending load and resolved texture across owners and scenes', async () => {
  const { loadFigureTexture } = await import('./textures');
  const texture = { id: 'shared' };
  let resolve!: (texture: unknown) => void;
  mocks.load.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const first = loadFigureTexture('/shared.webp');
  const second = loadFigureTexture('/shared.webp');
  expect(first).toBe(second);
  expect(mocks.load).toHaveBeenCalledTimes(1);
  resolve(texture);
  expect(await first).toBe(texture);
  expect(await loadFigureTexture('/shared.webp')).toBe(texture);
  expect(mocks.load).toHaveBeenCalledTimes(1);
});

it('allows retry after failure without retaining a rejected promise', async () => {
  const { loadFigureTexture } = await import('./textures');
  mocks.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'retry' });
  await expect(loadFigureTexture('/retry.webp')).rejects.toThrow('offline');
  await expect(loadFigureTexture('/retry.webp')).resolves.toEqual({ id: 'retry' });
  expect(mocks.load).toHaveBeenCalledTimes(2);
});
