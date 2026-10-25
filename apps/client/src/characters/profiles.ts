/** Client-only flavor and visual identity. Rules and stats live in @open-boards/content. */
export interface CharacterProfile {
  role: string;
  summary: string;
  tactic: string;
  accent: string;
  ground: string;
}
export const profiles: Record<string, CharacterProfile> = {
  'the-genie': {
    role: 'Unbound wishmaker',
    summary: 'Limitless power. Every wish has a price.',
    tactic:
      'Trade cards for extra actions. Choose your wishes carefully and strike before your power runs dry.',
    accent: '#d8b77d',
    ground: '#293b46',
  },
  'king-arthur': {
    role: 'King of Camelot',
    summary: 'Excalibur raised. Merlin at his side.',
    tactic:
      'Commit powerful BOOSTs with Arthur. Use Merlin’s foresight and magic to shape the next clash.',
    accent: '#d6b775',
    ground: '#283746',
  },
  medusa: {
    role: 'Gorgon archer',
    summary: 'A deadly gaze. A sky full of wings.',
    tactic:
      'Threaten with Gaze of Stone. Send Harpies ahead, then use Winged Frenzy to reposition and bring one back.',
    accent: '#d7bb75',
    ground: '#253d39',
  },
};
