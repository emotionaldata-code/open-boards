import { afterEach, expect, it } from 'vitest';
import { deploymentSpaces, type Command } from '@open-boards/game';
import { Match, activeSeats } from '../../../../apps/server/src/rooms/match';
import { basic, deckDefinitions } from '../index';

afterEach(() => activeSeats.clear());
it('restores each private gear selection, Dandelion deployment, and defense BOOST after room reconnect', () => {
  let next = 0;
  const match = new Match('geralt-reconnect', 2, (character) =>
    deckDefinitions(character).map((definition) => ({ id: `c-${next++}`, definition })),
  );
  for (const id of ['a', 'b']) {
    match.join({ id, name: id }, () => {});
    match.selectCharacter(id, 'geralt-of-rivia');
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
  const restore = () => {
    const choice = match.game!.resolution.choice!,
      actor = choice.player,
      other = actor === 'a' ? 'b' : 'a';
    const view = match.view(actor).game!.choice!;
    expect(view).not.toHaveProperty('continuations');
    expect(match.view(other).game!.choice).toBeNull();
    const before = structuredClone(match.game);
    match.disconnect(actor);
    match.reconnect(actor);
    expect(match.game).toEqual(before);
    expect(match.view(actor).game!.choice).toEqual(view);
    expect(
      match.command(other, {
        id: 'forged-owner',
        revision: match.game!.revision,
        command: { type: 'choose', choice: choice.id, options: [choice.options[0].id] },
      }).error,
    ).toBeDefined();
    expect(match.game).toEqual(before);
    return choice;
  };
  let loadouts = 0;
  while (match.game!.resolution.choice) {
    const c = restore();
    send(c.player, { type: 'choose', choice: c.id, options: [c.options[0].id] });
    loadouts++;
  }
  expect(loadouts).toBe(6);
  while (match.game!.phase.type === 'placing-allies') {
    const f = match.game!.fighters.find((f) => !f.defeated && f.position === null)!;
    match.disconnect(f.player);
    match.reconnect(f.player);
    expect(match.view(f.player).game!.phase).toEqual(match.game!.phase);
    send(f.player, {
      type: 'place-ally',
      fighter: f.id,
      position: deploymentSpaces(match.game!, f.id, basic.map)[0],
    });
  }
  for (const p of match.game!.players) expect(p.hand.length + p.deck.length).toBe(30);
  match.game!.fighters.find((f) => f.id === 'a:main')!.position = 'n0';
  match.game!.fighters.find((f) => f.id === 'b:main')!.position = 'n1';
  match.game!.players[0].hand[0].definition = 'geralt-of-rivia-damn-youre-ugly';
  match.game!.players[1].hand[0].definition = 'geralt-of-rivia-rend';
  send('a', {
    type: 'attack',
    fighter: 'a:main',
    target: 'b:main',
    card: match.game!.players[0].hand[0].id,
  });
  send('b', { type: 'defend', card: match.game!.players[1].hand[0].id });
  const c = restore();
  expect(c.prompt).toBe('Boost defense');
  send('b', { type: 'choose', choice: c.id, options: [c.options[0].id] });
  expect(match.game!.resolution.frames).toEqual({});
  expect(match.game!.fighters).toHaveLength(4);
});
