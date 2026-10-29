interface SampleLayer {
  samples: readonly string[];
  gain: number;
  at?: number;
  rate?: number;
  duration?: number;
  pan?: number;
}

// Recorded paper, wood, leather and metal. Gameplay still owns the event timing.
export const cues = {
  click: [{ samples: ['chip-lay-1', 'chip-lay-2'], gain: 0.28 }],
  select: [{ samples: ['card-slide-1', 'card-slide-3'], gain: 0.48 }],
  confirm: [
    { samples: ['impactWood_medium_000', 'impactWood_medium_001'], gain: 0.5 },
    { samples: ['metalLatch'], gain: 0.2, at: 0.025 },
  ],
  notification: [{ samples: ['impactBell_heavy_000'], gain: 0.28, rate: 1.5 }],
  alert: [
    { samples: ['bookClose'], gain: 0.5, rate: 0.8 },
    { samples: ['impactWood_medium_001'], gain: 0.3, at: 0.13 },
  ],
  arrow: [
    { samples: ['cloth1', 'cloth2'], gain: 0.48, rate: 1.15 },
    { samples: ['knifeSlice2'], gain: 0.28, at: 0.06, rate: 1.3 },
  ],
  slash: [
    { samples: ['knifeSlice', 'knifeSlice2'], gain: 0.62 },
    { samples: ['drawKnife1'], gain: 0.25, at: 0.05 },
  ],
  impact: [
    { samples: ['impactPunch_heavy_000', 'impactPunch_heavy_001'], gain: 0.75, rate: 0.9 },
    { samples: ['impactWood_medium_000'], gain: 0.32, at: 0.015, rate: 0.8 },
  ],
  shield: [
    { samples: ['impactMetal_medium_000', 'impactMetal_medium_001'], gain: 0.62, rate: 0.85 },
    { samples: ['impactWood_medium_001'], gain: 0.3, at: 0.02 },
  ],
  cards: [
    { samples: ['card-fan-1'], gain: 0.62 },
    { samples: ['card-place-1', 'card-place-3'], gain: 0.3, at: 0.18 },
  ],
  move: [
    { samples: ['impactWood_medium_000', 'impactWood_medium_001'], gain: 0.48 },
    { samples: ['footstep00', 'footstep01'], gain: 0.25, at: 0.12 },
  ],
  heal: [
    { samples: ['impactGlass_light_000'], gain: 0.22, rate: 1.2 },
    { samples: ['impactBell_heavy_000'], gain: 0.25, rate: 1.5, at: 0.1 },
  ],
  ability: [
    { samples: ['bookOpen'], gain: 0.45 },
    { samples: ['impactBell_heavy_000'], gain: 0.27, rate: 0.9, at: 0.08 },
  ],
  burn: [
    { samples: ['fire-crackle'], gain: 0.58 },
    { samples: ['cloth2'], gain: 0.24, rate: 1.15 },
  ],
  portal: [
    { samples: ['cloth1'], gain: 0.45, rate: 0.7 },
    { samples: ['impactBell_heavy_000'], gain: 0.24, rate: 1.25, at: 0.16 },
  ],
  turn: [
    { samples: ['chips-stack-1'], gain: 0.4 },
    { samples: ['impactBell_heavy_000'], gain: 0.16, rate: 1.5, at: 0.08 },
  ],
  fallen: [
    { samples: ['impactPunch_heavy_000'], gain: 0.55, rate: 0.7 },
    { samples: ['bookClose'], gain: 0.45, rate: 0.7, at: 0.13 },
  ],
  victory: [
    { samples: ['impactBell_heavy_000'], gain: 0.32, rate: 1 },
    { samples: ['impactBell_heavy_000'], gain: 0.27, rate: 1.25, at: 0.22 },
    { samples: ['impactBell_heavy_000'], gain: 0.25, rate: 1.5, at: 0.44 },
    { samples: ['chips-stack-1'], gain: 0.3, at: 0.65 },
  ],
} satisfies Record<string, SampleLayer[]>;

export type SoundName = keyof typeof cues;
export interface SoundEffect {
  name: SoundName;
  delay?: number;
}
export type SampleBank = ReadonlyMap<string, AudioBuffer>;
const recordings = new Map<string, Promise<ArrayBuffer>>();
const banks = new WeakMap<BaseAudioContext, Promise<SampleBank>>();

// Fetch once, decode per context. Starting playback never waits for a download.
export function loadSamples(context: BaseAudioContext): Promise<SampleBank> {
  let bank = banks.get(context);
  if (!bank) {
    const names = [
      ...new Set(Object.values(cues).flatMap((layers) => layers.flatMap((layer) => layer.samples))),
    ];
    bank = Promise.all(
      names.map(async (name) => {
        let recording = recordings.get(name);
        if (!recording) {
          recording = fetch(`/audio/${name}.ogg`).then(async (response) => {
            if (!response.ok) throw new Error(`Audio ${name}: ${response.status}`);
            return response.arrayBuffer();
          });
          recordings.set(name, recording);
          void recording.catch(() => recordings.delete(name));
        }
        const bytes = await recording;
        return [name, await context.decodeAudioData(bytes.slice(0))] as const;
      }),
    ).then((entries) => new Map(entries));
    banks.set(context, bank);
    void bank.catch(() => banks.delete(context));
  }
  return bank;
}

export function playCue(
  context: BaseAudioContext,
  output: AudioNode,
  name: SoundName,
  bank: SampleBank,
) {
  const sources: AudioBufferSourceNode[] = [];
  let cancelled = false;
  for (const layer of cues[name] as readonly SampleLayer[]) {
    const sample = layer.samples[Math.floor(Math.random() * layer.samples.length)];
    const buffer = bank.get(sample);
    if (!buffer) continue;
    const start = context.currentTime + (layer.at ?? 0);
    const rate = (layer.rate ?? 1) * (0.98 + Math.random() * 0.04);
    const duration = Math.min(layer.duration ?? Infinity, buffer.duration / rate);
    const source = context.createBufferSource();
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    panner.pan.value = layer.pan ?? (Math.random() - 0.5) * 0.12;
    // A short fade avoids clicks when an event is interrupted or a sample is trimmed.
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(layer.gain, start + 0.004);
    envelope.gain.setValueAtTime(layer.gain, start + Math.max(0.004, duration - 0.025));
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(envelope).connect(panner).connect(output);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
      panner.disconnect();
    };
    source.start(start);
    source.stop(start + duration);
    sources.push(source);
  }
  return () => {
    if (cancelled) return;
    cancelled = true;
    sources.forEach((source) => source.stop());
  };
}
