/** Client-only flavor and visual identity. Rules and stats live in @open-boards/content. */
export interface CharacterProfile {
  role: string;
  summary: string;
  tactic: string;
  accent: string;
  ground: string;
}
export const profiles: Record<string, CharacterProfile> = {
  'darth-vader': {
    role: 'Dark Lord of the Sith',
    summary: 'An iron will. A galaxy held in his grip.',
    tactic:
      'Trade a card for Force Grip damage. Corner your rival, turn their strength aside, and spend an extra action on a decisive strike.',
    accent: '#c47c73',
    ground: '#302c35',
  },
  'geralt-of-rivia': {
    role: 'Witcher of the Wolf School',
    summary: 'Two swords. A sign in the dark.',
    tactic:
      'Choose your gear before the hunt. Control the fight with signs and potions while Dandelion disrupts your rival’s hand.',
    accent: '#bba469',
    ground: '#303b3b',
  },
  'invisible-man': {
    role: 'Terror in the fog',
    summary: 'An empty coat. A street full of secrets.',
    tactic:
      'Slip between fog tokens and defend from their cover. Move the mist, strike unexpectedly, then vanish until your next turn.',
    accent: '#b8a47c',
    ground: '#293b41',
  },
  'bruce-lee': {
    role: 'The Little Dragon',
    summary: 'Flow like water. Strike without pause.',
    tactic:
      'Chain Jeet Kune Do attacks into extra actions, recover your techniques, and take one final step at turn end.',
    accent: '#d8af55',
    ground: '#39372c',
  },
  'robin-hood': {
    role: 'Outlaw of Sherwood',
    summary: 'An arrow from the trees. A band at your side.',
    tactic:
      'Strike and retreat with Robin and his four Outlaws. Steal cards, deny defenses, and bring fallen friends back to Sherwood.',
    accent: '#d6ad68',
    ground: '#293c30',
  },
  bigfoot: {
    role: 'Elusive forest giant',
    summary: 'Heavy footsteps. A flicker of antlers.',
    tactic:
      'Hit hard, then disappear through the trees. Keep enemies outside Bigfoot’s zone to draw an extra card.',
    accent: '#c59e66',
    ground: '#2c3c32',
  },
  dracula: {
    role: 'Lord of the night',
    summary: 'A patient hunger. Three faithful shadows.',
    tactic:
      'Surround your prey with Sisters. Feed to sustain Dracula, then spend your hand on a devastating Beastform.',
    accent: '#ba716f',
    ground: '#302535',
  },
  achilles: {
    role: 'Hero of the Trojan War',
    summary: 'Brothers in battle. Fury in loss.',
    tactic:
      'Fight beside Patroclus for extra actions. His fall costs cards, but fuels Achilles’ attacks and rewards each victory.',
    accent: '#c98958',
    ground: '#44332f',
  },
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
  'sherlock-holmes': {
    role: 'Consulting detective',
    summary: 'Read the hand. Solve the fight.',
    tactic:
      'Predict attacks and dismantle your rival’s hand. Keep Watson close for healing and ranged support.',
    accent: '#b79c67',
    ground: '#283a3b',
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
