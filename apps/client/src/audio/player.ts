import { synthesize, type SoundName } from './cues';

class SoundPlayer {
  private context?: AudioContext;
  private master?: GainNode;
  private enabled = false;

  // Called directly by the sound button, inside the browser's user gesture.
  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.context.destination);
      }
      await this.context.resume();
    }
    this.enabled = enabled;
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(enabled ? 0.35 : 0, this.context.currentTime, 0.015);
  }

  play = (name: SoundName): (() => void) => {
    // Skip missed cues; never replay sounds accumulated while muted or suspended.
    if (!this.enabled || this.context?.state !== 'running' || !this.master) return () => {};
    return synthesize(this.context, this.master, name);
  };
}

export const sound = new SoundPlayer();
