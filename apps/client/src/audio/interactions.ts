import { sound } from './player';
import type { SoundName } from './cues';

/** UI feedback only. Confirmed gameplay audio stays on the presentation timeline. */
export function interactionCue(control: Element): SoundName | null {
  if (control.matches(':disabled, [aria-disabled="true"], [data-sound="none"]')) return null;
  if (
    control.matches(
      '.game-card, .compact-card, .fighter-hit, .fighter-picker button, [aria-pressed]',
    )
  )
    return 'select';
  if (control.matches('.primary, .node-hit, .draw-pile, .token-choice')) return 'confirm';
  return 'click';
}

export function installInteractionSounds(): () => void {
  const unlock = () => {
    void sound.unlock().catch(() => {});
  };
  const click = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest('button, a[href], summary');
    if (!control) return;
    const cue = interactionCue(control);
    if (cue) sound.play(cue);
  };
  const visibility = () => {
    if (document.hidden) sound.stopAll();
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  document.addEventListener('click', click, true);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('visibilitychange', visibility);
  };
}
