import { expect, it } from 'vitest';
import { commandSchema } from './index';

it('requires exact fighter IDs on physical commands without legacy command adapters', () => {
  const envelope = (command: unknown) => ({
    id: 'a63744b3-3a95-455a-93b2-d655955ec008',
    revision: 0,
    command,
  });
  for (const command of [
    { type: 'move', path: [] },
    { type: 'boost-maneuver' },
    { type: 'boost-maneuver', card: '' },
    { type: 'attack', card: 'card', target: 'enemy' },
    { type: 'play-action', card: 'card' },
    { type: 'place-ally', position: 'n1' },
  ])
    expect(commandSchema.safeParse(envelope(command)).success).toBe(false);
  for (const command of [
    { type: 'move', fighter: 'owner:ally-1', path: [] },
    { type: 'attack', fighter: 'owner:ally-1', card: 'card', target: 'enemy:main' },
    { type: 'play-action', fighter: 'owner:main', card: 'card' },
    { type: 'place-ally', fighter: 'owner:ally-1', position: 'n1' },
    { type: 'finish-maneuver' },
    { type: 'boost-maneuver', card: 'card' },
    { type: 'defend', card: null },
  ])
    expect(commandSchema.safeParse(envelope(command)).success).toBe(true);
});
