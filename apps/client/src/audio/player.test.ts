import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playCue: vi.fn(() => vi.fn()),
  loadSamples: vi.fn(async () => new Map()),
}));
vi.mock('./cues', () => mocks);
vi.mock('./mix', () => ({
  createMix: (context: AudioContext) => ({
    input: context.createGain(),
    master: context.createGain(),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

function browser(preference: string | null = null) {
  const storage = {
    getItem: vi.fn((key: string) => (key.endsWith(':volume') ? null : preference)),
    setItem: vi.fn(),
  };
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
  expect(mocks.playCue).toHaveBeenCalledTimes(1);
  browserState.context.state = 'suspended';
  sound.play('impact');
  browserState.context.state = 'running';
  browserState.document.hidden = true;
  sound.play('notification');
  browserState.document.hidden = false;
  await sound.setEnabled(false);
  sound.play('confirm');
  expect(mocks.playCue).toHaveBeenCalledTimes(1);
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
  expect(mocks.playCue).toHaveBeenCalledTimes(1);
});

it('cancels active recordings when muted and persists a bounded volume', async () => {
  const browserState = browser();
  const { sound } = await import('./player');
  await sound.unlock();
  sound.play('impact');
  const stop = mocks.playCue.mock.results[0].value;
  await sound.setEnabled(false);
  expect(stop).toHaveBeenCalledTimes(1);
  sound.setVolume(3);
  expect(sound.level).toBe(1);
  expect(browserState.storage.setItem).toHaveBeenCalledWith('open-boards:sound:volume', '1');
  sound.setVolume(-2);
  expect(sound.level).toBe(0);
  sound.setVolume(NaN);
  expect(sound.level).toBe(0);
});

it('does not replay clicks that happened before recordings were decoded', async () => {
  browser();
  let finish!: (bank: Map<string, AudioBuffer>) => void;
  mocks.loadSamples.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { sound } = await import('./player');
  const loading = sound.unlock();
  sound.play('click');
  expect(mocks.playCue).not.toHaveBeenCalled();
  finish(new Map());
  await loading;
  expect(mocks.playCue).not.toHaveBeenCalled();
  sound.play('click')();
  expect(mocks.playCue).toHaveBeenCalledTimes(1);
});
