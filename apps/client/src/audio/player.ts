import { loadSamples, playCue, type SampleBank, type SoundName } from './cues';
import { createMix } from './mix';

const preferenceKey = 'open-boards:sound';
function storedPreference(): boolean {
  try {
    return localStorage.getItem(preferenceKey) !== 'off';
  } catch {
    return true;
  }
}

class SoundPlayer {
  private context?: AudioContext;
  private input?: GainNode;
  private master?: GainNode;
  private bank?: SampleBank;
  private stops = new Set<() => void>();
  private enabled = storedPreference();
  private volume = (() => {
    try {
      const value = localStorage.getItem(`${preferenceKey}:volume`);
      return value === null || !Number.isFinite(Number(value))
        ? 0.75
        : Math.min(1, Math.max(0, Number(value)));
    } catch {
      return 0.75;
    }
  })();

  get isEnabled() {
    return this.enabled;
  }
  get level() {
    return this.volume;
  }

  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.min(1, Math.max(0, volume));
    this.updateGain();
    try {
      localStorage.setItem(`${preferenceKey}:volume`, String(this.volume));
    } catch {
      /* Optional storage. */
    }
  }

  private updateGain() {
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        this.enabled ? this.volume : 0,
        this.context.currentTime,
        0.015,
      );
  }

  // Audio is created only in a user gesture, including after a browser suspension.
  async unlock(): Promise<void> {
    if (!this.enabled) return;
    if (!this.context) {
      this.context = new AudioContext();
      const mix = createMix(this.context);
      this.master = mix.master;
      this.input = mix.input;
      this.master.gain.value = this.volume;
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.bank = await loadSamples(this.context);
  }

  // Called directly by the sound button, inside the browser's user gesture.
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    if (!enabled) this.stopAll();
    this.updateGain();
    try {
      if (enabled) await this.unlock();
    } catch (error) {
      this.enabled = false;
      this.updateGain();
      throw error;
    }
    try {
      localStorage.setItem(preferenceKey, enabled ? 'on' : 'off');
    } catch {
      /* Sound remains usable when browser storage is unavailable. */
    }
    this.updateGain();
  }

  stopAll = () => {
    this.stops.forEach((stop) => stop());
    this.stops.clear();
  };

  play = (name: SoundName): (() => void) => {
    // Skip missed cues; never replay sounds accumulated while muted or suspended.
    if (
      !this.enabled ||
      document.hidden ||
      this.context?.state !== 'running' ||
      !this.input ||
      !this.bank
    )
      return () => {};
    // Bound overlapping effects during bursts; do not retain completed voices forever.
    if (this.stops.size >= 16) this.stops.values().next().value?.();
    const cancel = playCue(this.context, this.input, name, this.bank);
    const timer = setTimeout(() => this.stops.delete(stop), 3500);
    const stop = () => {
      clearTimeout(timer);
      cancel();
      this.stops.delete(stop);
    };
    this.stops.add(stop);
    return stop;
  };
}

export const sound = new SoundPlayer();
