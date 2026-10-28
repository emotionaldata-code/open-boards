import { afterEach, expect, it } from 'vitest';
import { basic, deckDefinitions } from '@open-boards/content';
import { deploymentSpaces, type Command, type GameState } from '@open-boards/game';
import { Match, activeSeats } from './match';

afterEach(() => activeSeats.clear());
function setup() {
  let deck = 0;
  const m = new Match('eredin-room', 2, (character) => {
    const n = deck++;
    return deckDefinitions(character).map((definition, i) => ({
      id: `deck-${n}-${i}`,
      definition,
    }));
  });
  for (let i = 0; i < 2; i++) {
    const id = `p${i}`;
    m.join({ id, name: `Player ${i}` }, () => {});
    m.selectCharacter(id, i ? 'bruce-lee' : 'eredin');
    m.ready(id);
  }
  m.start('p0');
  const send = (actor: string, command: Command) =>
    m.command(actor, { id: `step-${m.game!.revision}`, revision: m.game!.revision, command });
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
  const f = (id: string) => m.game!.fighters.find((f) => f.id === id)!;
  f('p0:main').position = 'n0';
  f('p1:main').position = 'n1';
  const reconnect = (owner = 'p0') => {
    const original = m.view(owner).game!.choice,
      saved = JSON.stringify(m.game);
    m.disconnect(owner);
    expect(m.paused).toBe(true);
    m.game = JSON.parse(saved) as GameState;
    m.reconnect(owner);
    expect(m.paused).toBe(false);
    expect(m.view(owner).game!.choice).toEqual(original);
    expect(m.view(owner === 'p0' ? 'p1' : 'p0').game!.choice).toBeNull();
    expect(JSON.stringify(m.view('spectator'))).not.toContain('continuations');
  };
  return { m, f, send, reconnect };
}
it('restores both private sacrifice choices and rejects duplicate, stale and forged selections', () => {
  const { m, send, reconnect, f } = setup();
  const card = m.game!.players[0].hand[0];
  card.definition = 'eredin-foul-purpose';
  send('p0', { type: 'attack', fighter: 'p0:main', target: 'p1:main', card: card.id });
  send('p1', { type: 'defend', card: null });
  reconnect();
  let c = m.view('p0').game!.choice!;
  send('p0', { type: 'choose', choice: c.id, options: ['use'] });
  reconnect();
  c = m.view('p0').game!.choice!;
  const before = JSON.stringify(m.game),
    envelope = {
      id: 'sacrifice',
      revision: m.game!.revision,
      command: { type: 'choose' as const, choice: c.id, options: ['p0:ally-2'] },
    };
  expect(m.command('p1', envelope).error?.code).toBe('ILLEGAL');
  expect(
    m.command('p0', { ...envelope, command: { ...envelope.command, options: ['p0:main'] } }).error
      ?.code,
  ).toBe('ILLEGAL');
  expect(JSON.stringify(m.game)).toBe(before);
  expect(m.command('p0', envelope).error).toBeUndefined();
  expect(m.command('p0', envelope).error?.code).toBe('DUPLICATE');
  expect(m.command('p0', { ...envelope, id: 'stale' }).error?.code).toBe('STALE');
  expect(f('p0:ally-2').defeated).toBe(true);
  expect(m.game!.players[0].hand.some((c) => c.id === card.id)).toBe(true);
});
it('keeps face-down commitments private and face-up commitments public after actual reconnect', () => {
  const { m, send, reconnect, f } = setup();
  for (const ally of m.game!.fighters.filter((f) => f.role === 'ally')) {
    ally.defeated = true;
    ally.hp = 0;
  }
  f('p1:main').position = 'n20';
  const card = m.game!.players[0].hand[0];
  card.definition = 'eredin-foul-purpose';
  const before = JSON.stringify(m.game);
  expect(
    send('p0', { type: 'attack', fighter: 'p0:main', target: 'p1:main', card: card.id }).error
      ?.code,
  ).toBe('ILLEGAL');
  expect(JSON.stringify(m.game)).toBe(before);
  expect(
    send('p0', {
      type: 'attack',
      fighter: 'p0:main',
      target: 'p1:main',
      card: card.id,
      faceUp: true,
    }).error,
  ).toBeUndefined();
  reconnect('p1');
  for (const viewer of ['p0', 'p1', 'spectator'])
    expect(m.view(viewer).game!.phase).toHaveProperty(
      'committedCard.definition',
      'eredin-foul-purpose',
    );
  expect(send('p1', { type: 'defend', card: null }).error).toBeUndefined();
  expect(m.game!.revealed?.damage).toBe(4);
});
it('restores a private any-space revival placement without changing Rider identity', () => {
  const { m, send, reconnect, f } = setup();
  f('p0:ally-1').position = 'n0';
  f('p0:main').position = 'n9';
  f('p0:ally-2').defeated = true;
  f('p0:ally-2').hp = 0;
  const card = m.game!.players[0].hand[0];
  card.definition = 'eredin-unyielding-hordes';
  send('p0', { type: 'attack', fighter: 'p0:ally-1', target: 'p1:main', card: card.id });
  send('p1', { type: 'defend', card: null });
  reconnect();
  send('p0', { type: 'choose', choice: m.view('p0').game!.choice!.id, options: ['p0:ally-2'] });
  reconnect();
  expect(
    send('p0', { type: 'choose', choice: m.view('p0').game!.choice!.id, options: ['n22'] }).error,
  ).toBeUndefined();
  expect(f('p0:ally-2')).toMatchObject({
    id: 'p0:ally-2',
    hp: 1,
    position: 'n22',
    defeated: false,
  });
});
