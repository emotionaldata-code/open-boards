import { afterEach, expect, it } from 'vitest';
import { deploymentSpaces, type Command } from '@open-boards/game';
import { Match, activeSeats } from '../../../../apps/server/src/rooms/match';
import { basic, deckDefinitions } from '../index';

afterEach(() => activeSeats.clear());
it.each([
  'beastform',
  'do-my-bidding',
  'baptism-of-blood',
  'ravening-seduction',
  'mistform',
  'bloodthirsty',
])('restores Dracula’s private %s prompts and exact Sisters after room reconnect', (slug) => {
  let next = 0;
  const match = new Match(`dracula-${slug}`, 2, (character) =>
    deckDefinitions(character).map((definition) => ({ id: `c-${next++}`, definition })),
  );
  for (const id of ['a', 'b']) {
    match.join({ id, name: id }, () => {});
    match.selectCharacter(id, 'dracula');
    match.ready(id);
  }
  match.start('a');
  const send = (actor: string, command: Command) => {
    const response = match.command(actor, {
      id: `c-${match.game!.revision}`,
      revision: match.game!.revision,
      command,
    });
    expect(response.error).toBeUndefined();
  };
  while (match.game!.phase.type === 'placing-allies') {
    const f = match.game!.fighters.find((f) => f.position === null)!;
    send(f.player, {
      type: 'place-ally',
      fighter: f.id,
      position: deploymentSpaces(match.game!, f.id, basic.map)[0],
    });
  }
  if (match.game!.resolution.choice)
    send('a', { type: 'choose', choice: match.game!.resolution.choice!.id, options: ['skip'] });
  const state = match.game!,
    fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
  for (let i = 1; i <= 3; i++) {
    fighter(`a:ally-${i}`).position = `n${20 + i}`;
    fighter(`b:ally-${i}`).position = `n${15 + i}`;
  }
  fighter('a:main').position = 'n0';
  fighter('b:main').position = 'n1';
  state.players[0].hand[0].definition = `dracula-${slug}`;
  if (slug === 'bloodthirsty') {
    state.turn = 1;
    state.actions = 1;
    send('b', { type: 'maneuver' });
    send('b', { type: 'finish-maneuver' });
  } else if (slug === 'beastform' || slug === 'do-my-bidding') {
    const attacker = slug === 'beastform' ? 'a' : 'b',
      defender = attacker === 'a' ? 'b' : 'a';
    if (attacker === 'b') {
      state.turn = 1;
      state.players[1].hand[0].definition = 'dracula-ambush';
      state.players[1].hand[1].definition = 'dracula-feint';
    }
    send(attacker, {
      type: 'attack',
      fighter: `${attacker}:main`,
      target: `${defender}:main`,
      card: match.game!.players[attacker === 'a' ? 0 : 1].hand[0].id,
    });
    send(defender, {
      type: 'defend',
      card: slug === 'beastform' ? null : match.game!.players[0].hand[0].id,
    });
  } else {
    if (slug === 'baptism-of-blood') {
      fighter('a:ally-2').hp = 0;
      fighter('a:ally-2').defeated = true;
    }
    send('a', {
      type: 'play-action',
      fighter: slug === 'ravening-seduction' ? 'a:ally-1' : 'a:main',
      card: state.players[0].hand[0].id,
    });
  }
  let stages = 0;
  while (match.game!.resolution.choice) {
    const c = match.game!.resolution.choice!,
      actor = c.player,
      other = actor === 'a' ? 'b' : 'a';
    const view = match.view(actor).game!.choice!;
    expect(view).not.toHaveProperty('continuations');
    expect(match.view(other).game!.choice).toBeNull();
    const before = structuredClone(match.game);
    match.disconnect(actor);
    match.reconnect(actor);
    expect(match.game).toEqual(before);
    expect(match.view(actor).game!.choice).toEqual(view);
    const selected =
      slug === 'bloodthirsty' && stages === 0
        ? 'use'
        : slug === 'bloodthirsty'
          ? 'b:main'
          : slug === 'ravening-seduction' && stages === 0
            ? 'b:main'
            : (c.options.find((o) => o.id === '$stay')?.id ?? c.options[0].id);
    const command: Command = { type: 'choose', choice: c.id, options: [selected] };
    expect(
      match.command(other, { id: 'wrong-owner', revision: match.game!.revision, command }).error,
    ).toBeDefined();
    expect(
      match.command(actor, {
        id: 'forged',
        revision: match.game!.revision,
        command: { ...command, options: ['forged'] },
      }).error,
    ).toBeDefined();
    expect(
      match.command(actor, { id: 'stale', revision: match.game!.revision - 1, command }).error,
    ).toBeDefined();
    expect(match.game).toEqual(before);
    const revision = match.game!.revision;
    send(actor, command);
    const after = structuredClone(match.game);
    match.command(actor, { id: `c-${revision}`, revision, command });
    expect(match.game).toEqual(after);
    stages++;
    expect(stages).toBeLessThan(8);
  }
  expect(stages).toBeGreaterThan(0);
  expect(match.game!.resolution.frames).toEqual({});
  expect(match.game!.fighters.filter((f) => f.player === 'a' && f.role === 'ally')).toHaveLength(3);
});
