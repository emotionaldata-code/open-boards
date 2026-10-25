import { expect, it } from 'vitest';
import { AnimationQueue } from './queue';
it('appends rapid batches in order and executes each confirmed ID once', async () => {
  const queue = new AnimationQueue<{ id: string }>();
  const played: string[] = [];
  const play = async (event: { id: string }) => {
    played.push(event.id);
  };
  queue.consume([{ id: '1' }, { id: '2' }], play);
  queue.consume([{ id: '2' }, { id: '3' }], play);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(played).toEqual(['1', '2', '3']);
});
it('cancels pending work on reconnect and makes the active generation obsolete', async () => {
  const queue = new AnimationQueue<{ id: string }>();
  const played: string[] = [];
  let isActive = () => false;
  let release = () => {};
  queue.consume([{ id: 'old' }, { id: 'obsolete' }], async (event, active) => {
    played.push(event.id);
    isActive = active;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await Promise.resolve();
  expect(isActive()).toBe(true);
  queue.reset();
  expect(isActive()).toBe(false);
  queue.consume([{ id: 'fresh' }], async (event) => {
    played.push(event.id);
  });
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(played).toEqual(['old', 'fresh']);
});
