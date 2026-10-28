import { afterEach, expect, it } from 'vitest';
import { basic, deckDefinitions } from '@open-boards/content';
import { deploymentSpaces, type Command, type GameState } from '@open-boards/game';
import { Match, activeSeats } from './match';

afterEach(() => activeSeats.clear());
function setup(size: 2 | 4 = 2) {
  let next = 0;
  const match = new Match(`sorceresses-${size}`, size, (character) =>
    deckDefinitions(character).map((definition) => ({ id: `card-${next++}`, definition })),
  );
  for (let i = 0; i < size; i++) {
    const id = `p${i}`;
    match.join({ id, name: `Player ${i}` }, () => {});
    match.selectCharacter(id, i === 1 ? 'yennefer-triss' : 'bruce-lee');
    match.ready(id);
  }
  match.start('p0');
  const send = (actor: string, command: Command) =>
    match.command(actor, {
      id: `step-${match.game!.revision}`,
      revision: match.game!.revision,
      command,
    });
  const reconnect = (owner: string) => {
    const choice = match.view(owner).game!.choice;
    const saved = JSON.stringify(match.game);
    match.disconnect(owner);
    expect(match.paused).toBe(true);
    match.game = JSON.parse(saved) as GameState;
    match.reconnect(owner);
    expect(match.paused).toBe(false);
    expect(match.view(owner).game!.choice).toEqual(choice);
    expect(JSON.stringify(match.view(owner))).not.toContain('continuations');
  };
  const deploy = () => {
    while (match.game!.phase.type === 'placing-allies') {
      const f = match.game!.fighters.find((f) => f.position === null)!;
      expect(
        send(f.player, {
          type: 'place-ally',
          fighter: f.id,
          position: deploymentSpaces(match.game!, f.id, basic.map)[0],
        }).error,
      ).toBeUndefined();
    }
  };
  return { match, send, reconnect, deploy };
}
it.each([2, 4] as const)(
  'restores second-seat hero selection before any opening hands (%s seats)',
  (size) => {
    const { match, send, reconnect, deploy } = setup(size);
    expect(match.game!.resolution.choice?.player).toBe('p1');
    expect(match.game!.players.every((p) => p.hand.length === 0)).toBe(true);
    reconnect('p1');
    const c = match.view('p1').game!.choice!;
    expect(
      send('p0', { type: 'choose', choice: c.id, options: ['yennefer-triss-triss'] }).error?.code,
    ).toBe('ILLEGAL');
    expect(
      send('p1', { type: 'choose', choice: c.id, options: ['yennefer-triss-triss'] }).error,
    ).toBeUndefined();
    deploy();
    expect(match.game!.fighters.find((f) => f.id === 'p1:main')).toMatchObject({
      hp: 14,
      definition: 'yennefer-triss-triss',
    });
    expect(match.game!.fighters.find((f) => f.id === 'p1:ally-1')).toMatchObject({
      hp: 6,
      definition: 'yennefer-triss',
    });
    expect(match.game!.players.every((p) => p.hand.length === 5)).toBe(true);
  },
);
it('restores a sealed Lodge commitment without disclosing it to the next chooser or spectator', () => {
  const { match, send, reconnect, deploy } = setup();
  let c = match.game!.resolution.choice!;
  send('p1', { type: 'choose', choice: c.id, options: ['yennefer-triss'] });
  deploy();
  match.game!.turn = 1;
  match.game!.players[1].hand = [
    { id: 'scheme', definition: 'yennefer-triss-lodge-of-sorceresses' },
    { id: 'secret-yen', definition: 'yennefer-triss-incinerate' },
  ];
  match.game!.players[0].hand = [{ id: 'secret-lee', definition: 'bruce-lee-regroup' }];
  expect(
    send('p1', { type: 'play-action', fighter: 'p1:main', card: 'scheme' }).error,
  ).toBeUndefined();
  c = match.game!.resolution.choice!;
  expect(c.player).toBe('p0');
  send('p0', { type: 'choose', choice: c.id, options: ['secret-lee'] });
  reconnect('p1');
  expect(JSON.stringify(match.view('p1'))).not.toContain('secret-lee');
  expect(JSON.stringify(match.view('spectator'))).not.toContain('secret-lee');
  const pending = match.view('p1').game!.choice!;
  expect(
    send('p1', { type: 'choose', choice: pending.id, options: ['secret-yen'] }).error,
  ).toBeUndefined();
  expect(match.game!.resolution.choice).toBeNull();
  expect(match.game!.players[0].hand.some((c) => c.id === 'secret-lee')).toBe(true);
});
