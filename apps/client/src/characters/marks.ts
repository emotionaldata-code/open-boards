/** Reusable presentation symbols; character definitions never execute rendering code. */
export const marks = {
  shield: 'M-24-24 0-33 24-24 20 8 0 28 -20 8Z M0-18V14 M-12-3H12',
  blade: 'M-24 24 16-24 25-29 24-18 -16 28Z M-23 10 -8 23',
  flame: 'M0 30C-40 12-24-12-6-30 -5-8 15-10 11-31 43 0 24 28 0 30Z M0 21Q-15 7 0-8Q17 9 0 21Z',
  wave: 'M-35 12Q-10-12 7 2T35-6 M-35-5Q-10-29 7-15T35-23 M-35 29Q-10 5 7 19T35 11',
  bolt: 'M5-35 -24 6 -3 6 -11 35 24-10 3-10Z',
  compass: 'M0-32 8-8 32 0 8 8 0 32 -8 8 -32 0 -8-8Z',
} as const;
export type AbilityMark = keyof typeof marks;
export function markSvg(mark: AbilityMark): string {
  return `<svg xmlns="http://www.w3.org/2000/svg"><path d="${marks[mark]}" fill="none" stroke="#fff1cd" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
export const abilityVisuals: Record<
  string,
  { mark: AbilityMark; tone: 'gold' | 'mint' | 'ember' }
> = {
  achilles: { mark: 'flame', tone: 'ember' },
  'achilles-patroclus': { mark: 'shield', tone: 'gold' },
  'the-genie': { mark: 'flame', tone: 'gold' },
  'king-arthur': { mark: 'blade', tone: 'gold' },
  'king-arthur-merlin': { mark: 'compass', tone: 'mint' },
  'sherlock-holmes': { mark: 'compass', tone: 'gold' },
  'sherlock-holmes-dr-watson': { mark: 'shield', tone: 'mint' },
  medusa: { mark: 'wave', tone: 'mint' },
  'medusa-harpy': { mark: 'blade', tone: 'gold' },
};

export const statusVisuals: Record<string, { mark: AbilityMark; tone: 'gold' | 'mint' | 'ember' }> =
  {
    'fixed-four': { mark: 'bolt', tone: 'gold' },
    burn: { mark: 'flame', tone: 'ember' },
  };
