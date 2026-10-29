import { afterEach, expect, it } from 'vitest';
import { deploymentSpaces, type Command } from '@open-boards/game';
import { Match, activeSeats } from '../../../../apps/server/src/rooms/match';
import { basic, deckDefinitions } from '../index';

afterEach(() => activeSeats.clear());
it.each(['prophecy', 'the-lady-of-the-lake', 'restless-spirits', 'noble-sacrifice'])(
  'restores every private %s stage across room reconnects',
  (slug) => {
    let next = 0;
    const match = new Match(`arthur-${slug}`, 2, (character) =>
      deckDefinitions(character).map((definition) => ({ id: `c-${next++}`, definition })),
    );
    for (const id of ['a', 'b']) {
      match.join({ id, name: id }, () => {});
      match.selectCharacter(id, 'king-arthur');
      match.ready(id);
    }
    match.start('a');
    const command = (actor: string, command: Command) => {
      const result = match.command(actor, {
        id: `c-${match.game!.revision}`,
        revision: match.game!.revision,
        command,
      });
      expect(result.error).toBeUndefined();
    };
    while (match.game!.phase.type === 'placing-allies') {
      const fighter = match.game!.fighters.find((f) => !f.defeated && f.position === null)!;
      command(fighter.player, {
        type: 'place-ally',
        fighter: fighter.id,
        position: deploymentSpaces(match.game!, fighter.id, basic.map)[0],
      });
    }
    const state = match.game!,
      card = state.players[0].hand[0];
    card.definition = `king-arthur-${slug}`;
    state.fighters.find((f) => f.id === 'a:main')!.position = 'n0';
    state.fighters.find((f) => f.id === 'b:main')!.position = 'n1';
    command(
      'a',
      slug === 'noble-sacrifice'
        ? { type: 'attack', fighter: 'a:main', target: 'b:main', card: card.id }
        : {
            type: 'play-action',
            fighter: slug === 'the-lady-of-the-lake' ? 'a:main' : 'a:ally-1',
            card: card.id,
          },
    );
    let stages = 0;
    do {
      const own = match.view('a').game!,
        before = structuredClone(match.game);
      expect(own.choice).not.toBeNull();
      expect(own.choice).not.toHaveProperty('continuations');
      expect(match.view('b').game!.choice).toBeNull();
      match.disconnect('a');
      match.reconnect('a');
      expect(match.game).toEqual(before);
      expect(match.view('a').game!.choice).toEqual(own.choice);
      const response: Command = {
        type: 'choose',
        choice: own.choice!.id,
        options: [own.choice!.options[0].id],
      };
      expect(
        match.command('b', { id: 'forged', revision: match.game!.revision, command: response })
          .error,
      ).toBeDefined();
      command('a', response);
      if (match.game!.phase.type === 'awaiting-defense')
        command('b', { type: 'defend', card: null });
      stages++;
    } while (match.game!.resolution.choice);
    expect(stages).toBeGreaterThanOrEqual(
      slug === 'prophecy' ? 3 : slug === 'noble-sacrifice' || slug === 'restless-spirits' ? 2 : 1,
    );
  },
);
