import { afterEach, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';
import type { PresentationEvent } from './events';
import { createEffect } from './effects';
import { playPresentation } from './playback';

vi.mock('./effects', () => ({
  effectColors: { gold: 0 },
  createEffect: vi.fn(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function timeline(reduced = false) {
  let nextFrame: FrameRequestCallback = () => {};
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    nextFrame = frame;
  });
  const view = { update: vi.fn(), destroy: vi.fn() };
  vi.mocked(createEffect).mockReturnValue(view);
  const stop = vi.fn(),
    sound = vi.fn(() => stop);
  const event: PresentationEvent = {
    id: 'test',
    revision: 1,
    title: 'Clash',
    detail: '',
    tone: 'gold',
    duration: 2200,
    effects: [{ type: 'ring', node: 'n0', delay: 850, duration: 400 }],
    sounds: [{ name: 'slash' }, { name: 'shield', delay: 850 }],
  };
  let active = true;
  const done = playPresentation(
    event,
    {} as Container,
    new Map(),
    () => active,
    () => {},
    sound,
  );
  return {
    done,
    view,
    sound,
    stop,
    step: (time: number) => nextFrame(time),
    cancel: () => {
      active = false;
    },
  };
}

it.each([false, true])(
  'keeps notices readable and synchronizes cues with reduced motion %s',
  async (reduced) => {
    const t = timeline(reduced);
    let complete = false;
    void t.done.then(() => {
      complete = true;
    });
    expect(t.sound.mock.calls).toEqual([['slash']]);
    t.step(800);
    expect(t.view.update).not.toHaveBeenCalled();
    t.step(850);
    t.step(1050);
    expect(t.sound.mock.calls).toEqual([['slash'], ['shield']]);
    expect(t.view.update).toHaveBeenLastCalledWith(0.5);
    t.step(1500);
    await Promise.resolve();
    expect(complete).toBe(false);
    t.step(2200);
    await t.done;
    expect(t.view.destroy).toHaveBeenCalledOnce();
  },
);

it('stops active audio and removes effects on reset without playing pending cues', async () => {
  const t = timeline();
  t.step(850);
  t.cancel();
  t.step(900);
  await t.done;
  expect(t.stop).toHaveBeenCalledTimes(2);
  expect(t.view.destroy).toHaveBeenCalledOnce();
});

it('does not sound a delayed impact after cancellation', async () => {
  const t = timeline();
  t.cancel();
  t.step(900);
  await t.done;
  expect(t.sound.mock.calls).toEqual([['slash']]);
});
