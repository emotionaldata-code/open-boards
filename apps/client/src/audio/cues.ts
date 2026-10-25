interface Voice {
  wave: OscillatorType | 'noise';
  frequency: number;
  to?: number;
  duration: number;
  at?: number;
  volume: number;
}

// Layered, short voices: no downloads or audio dependency, and no gameplay knowledge.
export const cues = {
  alert: [{ wave: 'triangle', frequency: 220, to: 330, duration: 0.3, volume: 0.3 }],
  arrow: [
    { wave: 'triangle', frequency: 420, to: 120, duration: 0.18, volume: 0.3 },
    { wave: 'noise', frequency: 3600, to: 650, duration: 0.45, volume: 0.35 },
  ],
  slash: [
    { wave: 'noise', frequency: 500, to: 4200, duration: 0.3, volume: 0.45 },
    { wave: 'triangle', frequency: 180, to: 60, duration: 0.25, volume: 0.35 },
  ],
  impact: [
    { wave: 'sine', frequency: 135, to: 38, duration: 0.35, volume: 0.8 },
    { wave: 'noise', frequency: 1800, to: 120, duration: 0.24, volume: 0.5 },
  ],
  shield: [
    { wave: 'triangle', frequency: 740, to: 690, duration: 0.6, volume: 0.25 },
    { wave: 'sine', frequency: 1175, duration: 0.45, volume: 0.2 },
    { wave: 'noise', frequency: 5400, to: 1400, duration: 0.12, volume: 0.35 },
  ],
  cards: [
    { wave: 'noise', frequency: 2200, to: 900, duration: 0.12, volume: 0.25 },
    { wave: 'triangle', frequency: 440, duration: 0.25, at: 0.08, volume: 0.2 },
    { wave: 'triangle', frequency: 660, duration: 0.35, at: 0.18, volume: 0.2 },
  ],
  move: [
    { wave: 'noise', frequency: 450, to: 130, duration: 0.2, volume: 0.3 },
    { wave: 'sine', frequency: 95, to: 55, duration: 0.18, volume: 0.35 },
  ],
  heal: [
    { wave: 'sine', frequency: 523, duration: 0.5, volume: 0.25 },
    { wave: 'sine', frequency: 659, duration: 0.5, at: 0.12, volume: 0.2 },
    { wave: 'sine', frequency: 784, duration: 0.6, at: 0.24, volume: 0.2 },
  ],
  ability: [
    { wave: 'triangle', frequency: 196, to: 784, duration: 0.5, volume: 0.3 },
    { wave: 'sine', frequency: 988, duration: 0.6, at: 0.22, volume: 0.2 },
  ],
  burn: [
    { wave: 'noise', frequency: 1200, to: 380, duration: 0.85, volume: 0.3 },
    { wave: 'noise', frequency: 4800, to: 1800, duration: 0.1, at: 0.07, volume: 0.4 },
    { wave: 'noise', frequency: 3900, to: 950, duration: 0.13, at: 0.3, volume: 0.35 },
    { wave: 'triangle', frequency: 110, to: 55, duration: 0.55, volume: 0.2 },
  ],
  portal: [
    { wave: 'sine', frequency: 160, to: 880, duration: 0.32, volume: 0.3 },
    { wave: 'noise', frequency: 600, to: 4000, duration: 0.4, volume: 0.2 },
    { wave: 'sine', frequency: 1320, to: 440, duration: 0.5, at: 0.25, volume: 0.2 },
  ],
  turn: [{ wave: 'sine', frequency: 392, to: 523, duration: 0.4, volume: 0.2 }],
  fallen: [
    { wave: 'triangle', frequency: 196, to: 49, duration: 0.9, volume: 0.3 },
    { wave: 'noise', frequency: 500, to: 80, duration: 0.7, volume: 0.2 },
  ],
  victory: [
    { wave: 'triangle', frequency: 523, duration: 0.6, volume: 0.2 },
    { wave: 'triangle', frequency: 659, duration: 0.6, at: 0.18, volume: 0.2 },
    { wave: 'triangle', frequency: 784, duration: 0.7, at: 0.36, volume: 0.2 },
    { wave: 'sine', frequency: 1047, duration: 1.1, at: 0.6, volume: 0.25 },
  ],
} satisfies Record<string, Voice[]>;

export type SoundName = keyof typeof cues;
export interface SoundEffect {
  name: SoundName;
  delay?: number;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
export function synthesize(context: BaseAudioContext, output: AudioNode, name: SoundName) {
  const sources: AudioScheduledSourceNode[] = [];
  for (const voice of cues[name] as Voice[]) {
    const start = context.currentTime + (voice.at ?? 0);
    const end = start + voice.duration;
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    let source: AudioBufferSourceNode | OscillatorNode;
    if (voice.wave === 'noise') {
      let buffer = noiseBuffers.get(context);
      if (!buffer) {
        buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        noiseBuffers.set(context, buffer);
      }
      source = context.createBufferSource();
      source.buffer = buffer;
      filter.frequency.setValueAtTime(voice.frequency, start);
      filter.frequency.exponentialRampToValueAtTime(voice.to ?? voice.frequency, end);
    } else {
      source = context.createOscillator();
      source.type = voice.wave;
      source.frequency.setValueAtTime(voice.frequency, start);
      source.frequency.exponentialRampToValueAtTime(voice.to ?? voice.frequency, end);
      filter.frequency.value = 4200;
    }
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(voice.volume, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, end);
    source.connect(filter).connect(envelope).connect(output);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    source.start(start);
    source.stop(end);
    sources.push(source);
  }
  return () => sources.forEach((source) => source.stop());
}
