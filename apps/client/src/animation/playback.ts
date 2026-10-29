import type { Container } from 'pixi.js';
import type { SoundName } from '../audio/cues';
import type { PresentationEvent, VisualEffect } from './events';
import { createEffect, effectColors, type EffectFrame } from './effects';

export function playPresentation(
  event: PresentationEvent,
  layer: Container,
  actors: Map<string, Container>,
  active: () => boolean,
  render: () => void,
  playSound: (name: SoundName) => () => void,
): Promise<void> {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const effects: { effect: VisualEffect; view?: EffectFrame }[] = event.effects.map((effect) => ({
    effect,
  }));
  const started = performance.now();
  const duration = event.duration;
  const sounds = event.sounds.map((sound) => ({ ...sound, played: false }));
  const stops: (() => void)[] = [];
  return new Promise((resolve) => {
    function frame(now: number) {
      if (!active()) {
        effects.forEach((e) => e.view?.destroy());
        stops.forEach((stop) => stop());
        resolve();
        return;
      }
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / duration);
      for (const cue of sounds) {
        if (!cue.played && elapsed >= (cue.delay ?? 0)) {
          cue.played = true;
          stops.push(playSound(cue.name));
        }
      }
      for (const entry of effects) {
        const delay = entry.effect.delay ?? 0;
        if (elapsed < delay) continue;
        entry.view ??= createEffect(
          entry.effect,
          layer,
          actors,
          effectColors[event.tone],
          reduced,
          entry.effect.duration ?? duration - delay,
        );
        entry.view.update(
          Math.min(1, (elapsed - delay) / Math.max(1, entry.effect.duration ?? duration - delay)),
        );
      }
      render();
      if (progress === 1) {
        effects.forEach((e) => e.view?.destroy());
        render();
        resolve();
      } else requestAnimationFrame(frame);
    }
    frame(started);
  });
}
