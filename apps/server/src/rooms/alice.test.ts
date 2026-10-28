import { afterEach, expect, it } from 'vitest';
import { basic, deckDefinitions } from '@open-boards/content';
import { deploymentSpaces, type Command, type GameState } from '@open-boards/game';
import { Match, activeSeats } from './match';

afterEach(() => activeSeats.clear());
function setup(size: 2 | 4 = 2) {
  let deckId = 0;
  const m = new Match(`alice-room-${size}`, size, (character) => {
    const prefix = deckId++;
    return deckDefinitions(character).map((definition, i) => ({
      id: `deck-${prefix}-${i}`,
      definition,
    }));
  });
  for (let i = 0; i < size; i++) {
    const id = `p${i}`;
    m.join({ id, name: `Player ${i}` }, () => {});
    m.selectCharacter(id, i === 1 ? 'alice' : 'bruce-lee');
    m.ready(id);
  }
  m.start('p0');
  const send = (actor: string, command: Command) =>
    m.command(actor, { id: `step-${m.game!.revision}`, revision: m.game!.revision, command });
  const reconnect = () => {
    const choice = m.view('p1').game!.choice;
    const saved = JSON.stringify(m.game);
    m.disconnect('p1');
    expect(m.paused).toBe(true);
    m.game = JSON.parse(saved) as GameState;
    m.reconnect('p1');
    expect(m.paused).toBe(false);
    expect(m.view('p1').game!.choice).toEqual(choice);
    expect(m.view('p0').game!.choice).toBeNull();
    expect(JSON.stringify(m.view('p1'))).not.toContain('continuations');
  };
  const deploy = () => {
    while (m.game!.phase.type === 'placing-allies') {
      const f = m.game!.fighters.find((f) => f.position === null)!;
      expect(
        send(f.player, {
          type: 'place-ally',
          fighter: f.id,
          position: deploymentSpaces(m.game!, f.id, basic.map)[0],
        }).error,
      ).toBeUndefined();
    }
  };
  return { m, send, reconnect, deploy };
}
it.each([2, 4] as const)(
  'restores Alice’s second-seat setup choice without exposing opening cards (%s seats)',
  (size) => {
    const { m, reconnect, send, deploy } = setup(size);
    expect(m.game!.resolution.choice!.player).toBe('p1');
    for (let i = 0; i < size; i++) expect(m.view(`p${i}`).game!.hand).toEqual([]);
    reconnect();
    const choice = m.view('p1').game!.choice!;
    const envelope = {
      id: 'initial-size',
      revision: m.game!.revision,
      command: { type: 'choose' as const, choice: choice.id, options: ['small'] },
    };
    expect(m.command('p0', envelope).error?.code).toBe('ILLEGAL');
    expect(m.command('p1', envelope).error).toBeUndefined();
    expect(m.command('p1', envelope).error?.code).toBe('DUPLICATE');
    expect(m.command('p1', { ...envelope, id: 'stale' }).error?.code).toBe('STALE');
    expect(m.game!.fighters.find((f) => f.id === 'p1:main')!.statuses).toEqual([
      { id: 'small', stacks: 1 },
    ]);
    expect(m.game!.players.every((p) => p.hand.length === 5)).toBe(true);
    deploy();
    expect(m.game!.phase.type).toBe('taking-actions');
    expect(m.game!.fighters.filter((f) => f.player === 'p1')).toHaveLength(2);
    expect(m.game!.fighters.every((f) => f.position !== null)).toBe(true);
    expect(send('p1', { type: 'choose', choice: choice.id, options: ['big'] }).error?.code).toBe(
      'ILLEGAL',
    );
  },
);
it('restores a private two-effect Looking Glass choice and the remaining heal after placement', () => {
  const { m, reconnect, send, deploy } = setup();
  send('p1', { type: 'choose', choice: m.game!.resolution.choice!.id, options: ['small'] });
  deploy();
  for (const [i, f] of m.game!.fighters.filter((f) => f.role === 'ally').entries())
    f.position = `n${16 + i}`;
  const alice = m.game!.fighters.find((f) => f.id === 'p1:main')!;
  alice.position = 'n1';
  alice.hp = 7;
  m.game!.fighters.find((f) => f.id === 'p0:main')!.position = 'n0';
  m.game!.players[0].hand[0].definition = 'medusa-gaze-of-stone';
  m.game!.players[1].hand[0].definition = 'alice-looking-glass';
  expect(
    send('p0', {
      type: 'attack',
      fighter: 'p0:main',
      target: 'p1:main',
      card: m.game!.players[0].hand[0].id,
    }).error,
  ).toBeUndefined();
  expect(send('p1', { type: 'defend', card: m.game!.players[1].hand[0].id }).error).toBeUndefined();
  reconnect();
  let choice = m.view('p1').game!.choice!;
  expect(choice).toMatchObject({ min: 2, max: 2 });
  expect(
    send('p1', { type: 'choose', choice: choice.id, options: ['place', 'place'] }).error?.code,
  ).toBe('ILLEGAL');
  expect(
    send('p1', { type: 'choose', choice: choice.id, options: ['place', 'heal'] }).error,
  ).toBeUndefined();
  reconnect();
  choice = m.view('p1').game!.choice!;
  expect(choice.prompt).toContain('teleport');
  expect(m.game!.fighters.find((f) => f.id === 'p1:main')!.hp).toBe(7);
  expect(
    send('p1', { type: 'choose', choice: choice.id, options: [choice.options[0].id] }).error,
  ).toBeUndefined();
  expect(m.game!.fighters.find((f) => f.id === 'p1:main')!.hp).toBe(10);
  expect(m.game!.resolution.choice).toBeNull();
});
