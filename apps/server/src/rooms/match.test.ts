import { afterEach, describe, it, expect, vi } from 'vitest';
import { Match, activeSeats } from './match';
import { projectOutcomes } from '../transport/projection';
import { basic, deckDefinitions } from '@open-boards/content';
import { deploymentSpaces, execute, type Command } from '@open-boards/game';
// Keep lifecycle coverage independent of the playable roster.
vi.mock('@open-boards/content', async (importOriginal) => {
  const content = await importOriginal<typeof import('@open-boards/content')>();
  const { basic: rules } = await import('../../../../tests/rules-fixture');
  const { basic: fighters } = await import('../../../../tests/fighters-fixture');
  const basic = {
    ...content.basic,
    characters: {
      ...content.characters,
      ...structuredClone(rules.characters),
      ...fighters.characters,
    },
    cards: { ...content.cards, ...rules.cards, ...fighters.cards },
  };
  basic.characters.ranger.abilities = [
    {
      id: 'reposition',
      name: 'Reposition',
      description: 'May move after attack damage.',
      trigger: 'after-attack',
      optional: true,
      limit: { scope: 'turn', count: 1 },
      when: { type: 'compare', left: { event: 'amount' }, op: 'gt', right: 0 },
      effects: [{ type: 'move', distance: 2 }],
    },
  ];
  for (const character of ['ranger', 'vanguard'])
    basic.characters[character].deck = [
      { card: 'strike', count: 5 },
      { card: 'guard', count: 5 },
      { card: 'adapt', count: 5 },
      { card: 'advance', count: 5 },
    ];
  return {
    ...content,
    basic,
    defaultCharacter: 'ranger',
    deckDefinitions: (character = 'ranger') =>
      basic.characters[character].deck.flatMap(({ card, count }) =>
        Array<string>(count).fill(card),
      ),
  };
});
let deckId = 0;
const deck = (character = 'ranger') => {
  const prefix = deckId++;
  return deckDefinitions(character).map((definition, i) => ({
    id: `card-${prefix}-${i}`,
    definition,
  }));
};
let counter = 0;
function setup(count: 2 | 4 = 2) {
  const m = new Match(`room-${counter++}`, count, deck);
  for (let i = 0; i < count; i++) {
    m.join({ id: `p${i}`, name: `Rival ${i}` }, () => {});
    m.ready(`p${i}`);
  }
  m.start('p0');
  return m;
}
afterEach(() => activeSeats.clear());
describe('room lifecycle', () => {
  it('validates character choices, resets readiness and fixes the choice at match start', () => {
    const m = new Match('characters', 2, deck);
    m.join({ id: 'a', name: 'A' }, () => {});
    m.join({ id: 'b', name: 'B' }, () => {});
    m.ready('a');
    m.selectCharacter('a', 'vanguard');
    expect(m.view('b').seats[0]).toMatchObject({ character: 'vanguard', ready: false });
    const before = structuredClone(m.seats);
    for (const character of ['missing', '__proto__', 'constructor'])
      expect(() => m.selectCharacter('a', character)).toThrow('supported character');
    expect(() => m.selectCharacter('intruder', 'vanguard')).toThrow();
    expect(m.seats).toEqual(before);
    m.ready('a');
    m.ready('b');
    m.start('a');
    expect(m.game!.players.map((p) => p.character)).toEqual(['vanguard', 'ranger']);
    expect(m.view('b').game!.players[0].character).toBe('vanguard');
    expect(() => m.selectCharacter('a', 'ranger')).toThrow('before the match');
    m.disconnect('a');
    m.reconnect('a');
    expect(m.view('a').game!.players[0].character).toBe('vanguard');
  });
  it('enforces 2/4 capacity, readiness, host start and duplicate seats across rooms', () => {
    const m = new Match('room', 2, deck);
    m.join({ id: 'a', name: 'A' }, () => {});
    expect(() => m.start('a')).toThrow();
    const other = new Match('other', 2);
    expect(() => other.join({ id: 'a', name: 'A' }, () => {})).toThrow(/active seat/);
    m.join({ id: 'b', name: 'B' }, () => {});
    expect(() => m.join({ id: 'c', name: 'C' }, () => {})).toThrow();
    m.ready('a');
    expect(() => m.start('a')).toThrow();
    m.ready('b');
    expect(() => m.start('b')).toThrow();
    m.start('a');
    expect(m.game).not.toBeNull();
    expect(() => m.join({ id: 'c', name: 'C' }, () => {})).toThrow();
  });
  it('transfers the lobby host to the earliest remaining player', () => {
    const m = new Match('room', 4);
    for (const id of ['a', 'b', 'c']) m.join({ id, name: id }, () => {});
    m.leave('a');
    expect(m.host).toBe('b');
    m.leave('b');
    expect(m.host).toBe('c');
  });
  it('restores pending movement unchanged on reconnect', () => {
    const m = setup();
    m.command('p0', { id: 'move', revision: 0, command: { type: 'maneuver' } });
    const game = structuredClone(m.game);
    m.disconnect('p0', 1000);
    expect(m.paused).toBe(true);
    expect(m.seats[0].expiresAt).toBe(121000);
    expect(
      m.command('p1', { id: 'blocked', revision: 1, command: { type: 'end-turn' } }).error?.code,
    ).toBe('PAUSED');
    m.reconnect('p0');
    expect(m.game).toEqual(game);
    expect(m.view('p0').game?.phase.type).toBe('choosing-movement');
    expect(m.paused).toBe(false);
    expect(() => m.reconnect('p0')).toThrow();
  });
  it('restores pending defense on reconnect and hides attack identities from other players', () => {
    const m = setup(4);
    m.game!.fighters[1].position = 'n1';
    m.command('p0', {
      id: 'attack',
      revision: 0,
      command: {
        type: 'attack',
        fighter: 'p0:main',
        card: m.game!.players[0].hand[0].id,
        target: 'p1:main',
      },
    });
    m.disconnect('p1');
    const before = structuredClone(m.game);
    for (const id of ['p1', 'p2', 'p3']) {
      expect(m.view(id).game?.phase).toEqual({
        type: 'awaiting-defense',
        attacker: 'p0:main',
        defender: 'p1:main',
      });
      expect(JSON.stringify(m.view(id))).not.toContain(
        m.game!.phase.type === 'awaiting-defense' ? m.game!.phase.card.id : 'unreachable',
      );
    }
    expect(m.view('p0').game?.phase).toHaveProperty('committedCard');
    m.reconnect('p1');
    expect(m.game).toEqual(before);
    expect(
      m.command('p1', { id: 'defend', revision: 1, command: { type: 'defend', card: null } }).error,
    ).toBeUndefined();
  });
  it.each(['p0', 'p1'])('cancels pending combat on %s forfeit and continues free-for-all', (id) => {
    const m = setup(4);
    m.game!.fighters[1].position = 'n1';
    m.command('p0', {
      id: 'attack',
      revision: 0,
      command: {
        type: 'attack',
        fighter: 'p0:main',
        card: m.game!.players[0].hand[0].id,
        target: 'p1:main',
      },
    });
    m.disconnect(id);
    m.leave(id);
    expect(m.game!.phase.type).toBe('taking-actions');
    expect(m.game!.players.find((p) => p.id === id)?.eliminated).toBe(true);
    expect(m.game!.players[0].discard).toHaveLength(1);
    expect(m.paused).toBe(false);
    expect(m.game!.turn).toBe(id === 'p0' ? 1 : 0);
  });
  it('keeps multiple disconnections paused until every remaining survivor returns or forfeits', () => {
    const m = setup(4);
    m.disconnect('p1');
    m.disconnect('p2');
    m.leave('p1');
    expect(m.paused).toBe(true);
    m.reconnect('p2');
    expect(m.paused).toBe(false);
    m.disconnect('p2');
    m.leave('p2');
    m.leave('p3');
    expect(m.game!.phase).toEqual({ type: 'finished', winner: 'p0' });
  });
  it('isolates private draw outcomes and deck order in every projection', () => {
    const m = setup();
    const { outcomes } = m.command('p0', {
      id: 'draw',
      revision: 0,
      command: { type: 'maneuver' },
    });
    expect(outcomes.some((o) => o.type === 'draw')).toBe(true);
    expect(projectOutcomes(outcomes, 'p1').some((o) => o.type === 'draw')).toBe(false);
    const view = m.view('p1').game!;
    expect(view.hand.map((c) => c.id)).toEqual(m.game!.players[1].hand.map((c) => c.id));
    expect(view.players.every((p) => !('deck' in p) && !('hand' in p))).toBe(true);
    expect(view).not.toHaveProperty('processed');
  });
  it('does not let delayed cleanup remove an account’s newer seat', () => {
    const old = setup();
    old.leave('p0');
    const next = new Match('new-room', 2);
    next.join({ id: 'p0', name: 'Rival 0' }, () => {});
    old.leave('p0');
    old.dispose();
    expect(activeSeats.get('p0')?.room).toBe('new-room');
  });
  it('rejects stale and duplicate commands without changing the room', () => {
    const m = setup();
    const command = { id: 'same', revision: 0, command: { type: 'maneuver' } as const };
    m.command('p0', command);
    const before = structuredClone(m.game);
    expect(m.command('p0', command).error?.code).toBe('DUPLICATE');
    expect(m.command('p0', { ...command, id: 'new' }).error?.code).toBe('STALE');
    expect(m.game).toEqual(before);
  });
});

it('restores nested character choices on reconnect, isolates their options and rejects stale/duplicate responses', () => {
  const m = new Match('abilities', 4, deck);
  for (let i = 0; i < 4; i++) {
    m.join({ id: `p${i}`, name: `Rival ${i}` }, () => {});
    if (!i) m.selectCharacter('p0', 'ranger');
    m.ready(`p${i}`);
  }
  m.start('p0');
  m.game!.fighters[1].position = 'n1';
  const send = (actor: string, command: import('@open-boards/game').Command) =>
    m.command(actor, { id: `step-${m.game!.revision}`, revision: m.game!.revision, command });
  send('p0', {
    type: 'attack',
    fighter: 'p0:main',
    card: m.game!.players[0].hand[0].id,
    target: 'p1:main',
  });
  send('p1', { type: 'defend', card: null });
  expect(m.game!.phase.type).toBe('ability-choice');
  expect(m.view('p1').game!.choice).toBeNull();
  expect(m.view('p0').game!.choice?.options.map((o) => o.id)).toEqual(['use', 'skip']);
  expect(m.view('p0').game).not.toHaveProperty('resolution');
  expect(JSON.stringify(m.view('p0'))).not.toContain('continuations');
  const choice = m.view('p0').game!.choice!;
  const before = structuredClone(m.game);
  m.disconnect('p0');
  m.reconnect('p0');
  expect(m.game).toEqual(before);
  expect(m.view('p0').game!.choice).toEqual(choice);
  const command = {
    id: 'choose-ability',
    revision: m.game!.revision,
    command: { type: 'choose' as const, choice: choice.id, options: ['use'] },
  };
  expect(m.command('p1', command).error?.code).toBe('ILLEGAL');
  expect(m.command('p0', command).error).toBeUndefined();
  expect(m.command('p0', command).error?.code).toBe('DUPLICATE');
  expect(m.command('p0', { ...command, id: 'another' }).error?.code).toBe('STALE');
  const move = m.view('p0').game!.choice!;
  m.disconnect('p0');
  m.reconnect('p0');
  expect(m.view('p0').game!.choice).toEqual(move);
  expect(m.view('p2').game!.choice).toBeNull();
  send('p0', { type: 'choose', choice: move.id, options: ['n5'] });
  expect(m.game!.fighters[0].position).toBe('n5');
  expect(m.game!.actions).toBe(1);
  expect(m.game!.phase.type).toBe('taking-actions');
});

it('reserves and pauses for an eliminated player with a death choice, then skips it on timeout', () => {
  const m = setup(4),
    defs = structuredClone(basic);
  defs.characters.ranger.abilities = [
    {
      id: 'last-word',
      name: 'Last word',
      description: 'Choose retaliation.',
      trigger: 'eliminated',
      effects: [
        {
          type: 'choose-option',
          prompt: 'Retaliate?',
          options: [
            { id: 'hit', label: 'Hit', effects: [{ type: 'damage', target: 'source', amount: 1 }] },
          ],
        },
      ],
    },
  ];
  m.game!.fighters[1].hp = 1;
  m.game!.fighters[1].position = 'n1';
  const attack = execute(
    m.game!,
    'p0',
    {
      id: 'attack',
      revision: 0,
      command: {
        type: 'attack',
        fighter: 'p0:main',
        card: m.game!.players[0].hand[0].id,
        target: 'p1:main',
      },
    },
    defs,
  );
  if (!attack.ok) throw new Error(attack.message);
  const defense = execute(
    attack.state,
    'p1',
    { id: 'defense', revision: 1, command: { type: 'defend', card: null } },
    defs,
  );
  if (!defense.ok) throw new Error(defense.message);
  m.game = defense.state;
  expect(m.needsConnection('p1')).toBe(true);
  const choice = structuredClone(m.view('p1').game!.choice);
  m.disconnect('p1');
  expect(m.paused).toBe(true);
  m.reconnect('p1');
  expect(m.view('p1').game!.choice).toEqual(choice);
  expect(m.paused).toBe(false);
  m.disconnect('p1');
  m.leave('p1');
  expect(m.needsConnection('p1')).toBe(false);
  expect(m.paused).toBe(false);
  expect(m.game.phase.type).toBe('taking-actions');
  expect(m.game.resolution.choice).toBeNull();
  expect(m.game.fighters[0].hp).toBe(15);
});

it('restores a printed action card’s suspended movement and remaining draw on reconnect', () => {
  const m = new Match('card-movement', 2, (character) => {
    const definitions = deckDefinitions(character);
    definitions.splice(definitions.indexOf('advance'), 1);
    return ['advance', ...definitions].map((definition, i) => ({
      id: `card-${character}-${deckId++}-${i}`,
      definition,
    }));
  });
  for (const id of ['a', 'b']) {
    m.join({ id, name: id }, () => {});
    m.ready(id);
  }
  m.start('a');
  const card = m.game!.players[0].hand[0];
  const deckCount = m.game!.players[0].deck.length;
  expect(
    m.command('a', {
      id: 'advance',
      revision: 0,
      command: { type: 'play-action', fighter: 'a:main', card: card.id },
    }).error,
  ).toBeUndefined();
  const choice = structuredClone(m.view('a').game!.choice!);
  expect(choice.prompt).toBe('Choose a destination');
  expect(m.view('b').game!.choice).toBeNull();
  m.disconnect('a');
  expect(m.paused).toBe(true);
  m.reconnect('a');
  expect(m.view('a').game!.choice).toEqual(choice);
  expect(
    m.command('a', {
      id: 'destination',
      revision: 1,
      command: { type: 'choose', choice: choice.id, options: ['n10'] },
    }).error,
  ).toBeUndefined();
  expect(m.game!.fighters[0].position).toBe('n10');
  expect(m.game!.players[0].deck).toHaveLength(deckCount - 1);
  expect(m.game!.players[0].discard[0]).toEqual(card);
  expect(m.game!.actions).toBe(1);
  expect(m.game!.phase.type).toBe('taking-actions');
});

it('restores all public fighters, setup and shared movement progress through actual room reconnects', () => {
  const m = new Match('pack-reconnect', 2, deck);
  for (const id of ['a', 'b']) {
    m.join({ id, name: id }, () => {});
    m.selectCharacter(id, 'leader');
    m.ready(id);
  }
  m.start('a');
  const first = m.view('a').game!;
  expect(first.fighters).toHaveLength(8);
  expect(first.phase).toEqual({ type: 'placing-allies', player: 'a' });
  const firstCompanion = first.fighters.find((f) => f.player === 'a' && f.role === 'ally')!;
  expect(
    m.command('a', {
      id: 'place',
      revision: 0,
      command: { type: 'place-ally', fighter: firstCompanion.id, position: 'n1' },
    }).error,
  ).toBeUndefined();
  m.disconnect('a');
  expect(m.view('b').game!.paused).toBe(true);
  m.reconnect('a');
  expect(m.view('a').game!.fighters.find((f) => f.id === firstCompanion.id)!.position).toBe('n1');
  let id = 0;
  while (m.game!.phase.type === 'placing-allies') {
    const player = m.game!.phase.player;
    const f = m.game!.fighters.find((f) => f.player === player && f.position === null)!;
    const position = deploymentSpaces(m.game!, f.id, basic.map)[0];
    expect(
      m.command(player, {
        id: `place-${++id}`,
        revision: m.game!.revision,
        command: { type: 'place-ally', fighter: f.id, position },
      }).error,
    ).toBeUndefined();
  }
  expect(
    m.command('a', { id: 'maneuver', revision: m.game!.revision, command: { type: 'maneuver' } })
      .error,
  ).toBeUndefined();
  expect(
    m.command('a', {
      id: 'stay-companion',
      revision: m.game!.revision,
      command: { type: 'move', fighter: firstCompanion.id, path: [] },
    }).error,
  ).toBeUndefined();
  const progress = structuredClone(m.game!.maneuver);
  m.disconnect('a');
  m.reconnect('a');
  expect(m.view('a').game!.maneuver).toEqual(progress);
  expect(progress!.remaining).toHaveLength(3);
  expect(
    m.view('b').game!.hand.every((c) => !m.view('a').game!.hand.some((own) => own.id === c.id)),
  ).toBe(true);
});

it('restores Medusa group, movement, revival and placement choices with private options through room reconnects', () => {
  const m = new Match('medusa-recovery', 2, deck);
  for (const id of ['p0', 'p1']) m.join({ id, name: id }, () => {});
  m.selectCharacter('p0', 'medusa');
  m.selectCharacter('p1', 'vanguard');
  for (const id of ['p0', 'p1']) m.ready(id);
  m.start('p0');
  const apply = (command: Command, actor = 'p0') => {
    const envelope = { id: `medusa-${m.game!.revision}`, revision: m.game!.revision, command };
    const result = m.command(actor, envelope);
    expect(result.error).toBeUndefined();
    expect(m.command(actor, envelope).error?.code).toBe('DUPLICATE');
    return result;
  };
  while (m.game!.phase.type === 'placing-allies') {
    const fighter = m.game!.fighters.find((f) => f.position === null)!;
    apply({
      type: 'place-ally',
      fighter: fighter.id,
      position: deploymentSpaces(m.game!, fighter.id, basic.map)[0],
    });
  }
  const choose = (option: string) =>
    apply({ type: 'choose', choice: m.game!.resolution.choice!.id, options: [option] });
  choose('skip');
  const ally = m.game!.fighters.find((f) => f.id === 'p0:ally-3')!;
  ally.hp = 0;
  ally.defeated = true;
  const card = m.game!.players[0].hand[0];
  card.definition = 'medusa-winged-frenzy';
  apply({ type: 'play-action', fighter: 'p0:ally-1', card: card.id });
  const recover = (prompt: string) => {
    expect(m.game!.resolution.choice?.prompt).toBe(prompt);
    const before = JSON.parse(JSON.stringify(m.game));
    m.disconnect('p0');
    expect(m.paused).toBe(true);
    m.reconnect('p0');
    expect(JSON.parse(JSON.stringify(m.game))).toEqual(before);
    expect(m.view('p0').game!.choice?.prompt).toBe(prompt);
    expect(m.view('p1').game!.choice).toBeNull();
    const choice = m.game!.resolution.choice!;
    const snapshot = structuredClone(m.game);
    expect(
      m.command('p1', {
        id: 'forged',
        revision: m.game!.revision,
        command: { type: 'choose', choice: choice.id, options: [choice.options[0].id] },
      }).error?.code,
    ).toBe('ILLEGAL');
    expect(m.game).toEqual(snapshot);
  };
  recover('Choose the next fighter');
  choose('p0:main');
  recover('Choose a destination');
  choose('n2');
  for (const id of ['p0:ally-2', 'p0:ally-1']) {
    choose(id);
    choose('$stay');
  }
  recover('Return a defeated ally');
  choose('p0:ally-3');
  recover('Choose where to return the ally');
  const position = m.game!.resolution.choice!.options[0].id;
  const result = choose(position);
  expect(projectOutcomes(result.outcomes, 'p1')).toContainEqual(
    expect.objectContaining({ type: 'revived', fighter: 'p0:ally-3', position }),
  );
  expect(m.game!.fighters.find((f) => f.id === 'p0:ally-3')).toMatchObject({
    defeated: false,
    hp: 1,
    position,
  });
});
