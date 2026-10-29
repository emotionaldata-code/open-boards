import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ synthesize: vi.fn(() => vi.fn()) }));
vi.mock('./cues', () => ({ synthesize: mocks.synthesize }));

beforeEach(() => {
  vi.resetModules();
  mocks.synthesize.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

function browser(preference: string | null = null) {
  const storage = { getItem: vi.fn(() => preference), setItem: vi.fn() };
  const master = { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn() };
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createGain: () => master,
    resume: vi.fn(async () => {}),
  };
  const Context = vi.fn(function () {
    return context;
  });
  const document = { hidden: false };
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('document', document);
  return { storage, context, Context, document };
}

it('creates audio only on interaction and never queues muted, hidden or suspended cues', async () => {
  const browserState = browser();
  const { sound } = await import('./player');
  sound.play('click');
  expect(browserState.Context).not.toHaveBeenCalled();
  await sound.unlock();
  sound.play('select');
  expect(mocks.synthesize).toHaveBeenCalledTimes(1);
  browserState.context.state = 'suspended';
  sound.play('impact');
  browserState.context.state = 'running';
  browserState.document.hidden = true;
  sound.play('notification');
  browserState.document.hidden = false;
  await sound.setEnabled(false);
  sound.play('confirm');
  expect(mocks.synthesize).toHaveBeenCalledTimes(1);
  expect(browserState.storage.setItem).toHaveBeenCalledWith('open-boards:sound', 'off');
});

it('honors a saved mute before the first interaction', async () => {
  const browserState = browser('off');
  const { sound } = await import('./player');
  expect(sound.isEnabled).toBe(false);
  await sound.unlock();
  expect(browserState.Context).not.toHaveBeenCalled();
  await sound.setEnabled(true);
  sound.play('click');
  expect(mocks.synthesize).toHaveBeenCalledTimes(1);
});
