import { synthesize, type SoundName } from './cues';

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
  private master?: GainNode;
  private enabled = storedPreference();

  get isEnabled() {
    return this.enabled;
  }

  // Audio is created only in a user gesture, including after a browser suspension.
  async unlock(): Promise<void> {
    if (!this.enabled) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  // Called directly by the sound button, inside the browser's user gesture.
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    try {
      if (enabled) await this.unlock();
    } catch (error) {
      this.enabled = false;
      throw error;
    }
    try {
      localStorage.setItem(preferenceKey, enabled ? 'on' : 'off');
    } catch {
      /* Sound remains usable when browser storage is unavailable. */
    }
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(enabled ? 0.35 : 0, this.context.currentTime, 0.015);
  }

  play = (name: SoundName): (() => void) => {
    // Skip missed cues; never replay sounds accumulated while muted or suspended.
    if (!this.enabled || document.hidden || this.context?.state !== 'running' || !this.master)
      return () => {};
    return synthesize(this.context, this.master, name);
  };
}

export const sound = new SoundPlayer();
