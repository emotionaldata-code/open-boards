import { afterEach, expect, it } from 'vitest';
import { deploymentSpaces, type Command, type GameState } from '@open-boards/game';
import { Match, activeSeats } from '../../../../apps/server/src/rooms/match';
import { basic, deckDefinitions } from '../index';

afterEach(() => activeSeats.clear());
it.each([
  'confirm-suspicion',
  'confirm-suspicion-miss',
  'eliminate-the-impossible',
  'study-methods',
  'elementary',
  'administer-aid',
  'deduce-strategy',
])(
  'restores every %s choice with its exact owner, private cards and legal continuation',
  (slug) => {
    let next = 0;
    const match = new Match(`holmes-${slug}`, 2, (character) =>
      deckDefinitions(character).map((definition) => ({ id: `c-${next++}`, definition })),
    );
    for (const id of ['a', 'b']) {
      match.join({ id, name: id }, () => {});
      match.selectCharacter(id, 'sherlock-holmes');
      match.ready(id);
    }
    match.start('a');
    const send = (actor: string, command: Command) => {
      const envelope = {
        id: `request-${match.game!.revision}`,
        revision: match.game!.revision,
        command,
      };
      const result = match.command(actor, envelope);
      expect(result.error).toBeUndefined();
      const saved = structuredClone(match.game);
      expect(match.command(actor, envelope).error?.code).toBe('DUPLICATE');
      expect(match.game).toEqual(saved);
    };
    while (match.game!.phase.type === 'placing-allies') {
      const f = match.game!.fighters.find((f) => f.position === null)!;
      send(f.player, {
        type: 'place-ally',
        fighter: f.id,
        position: deploymentSpaces(match.game!, f.id, basic.map)[0],
      });
    }
    const game = match.game!;
    game.fighters.find((f) => f.id === 'a:main')!.position = 'n0';
    game.fighters.find((f) => f.id === 'a:ally-1')!.position = 'n5';
    game.fighters.find((f) => f.id === 'b:main')!.position = 'n1';
    game.fighters.find((f) => f.id === 'b:ally-1')!.position = 'n18';
    const card = game.players[0].hand[0];
    card.definition = `sherlock-holmes-${slug.replace('-miss', '')}`;
    if (slug === 'elementary') {
      game.turn = 1;
      const attack = game.players[1].hand[0];
      attack.definition = 'sherlock-holmes-counterpunch';
      send('b', { type: 'attack', fighter: 'b:main', target: 'a:main', card: attack.id });
      send('a', { type: 'defend', card: card.id });
    } else if (['study-methods', 'deduce-strategy'].includes(slug)) {
      send('a', { type: 'attack', fighter: 'a:main', target: 'b:main', card: card.id });
      send('b', { type: 'defend', card: null });
    } else
      send('a', {
        type: 'play-action',
        fighter: slug === 'administer-aid' ? 'a:ally-1' : 'a:main',
        card: card.id,
      });
    let stages = 0;
    while (match.game!.resolution.choice) {
      const choice = match.game!.resolution.choice!,
        owner = choice.player,
        other = owner === 'a' ? 'b' : 'a';
      const view = match.view(owner).game!,
        before = structuredClone(match.game);
      expect(view.choice).not.toBeNull();
      expect(view.choice).not.toHaveProperty('continuations');
      expect(match.view(other).game!.choice).toBeNull();
      if (choice.public)
        expect(match.view(other).game!.observation?.cards).toEqual(
          view.choice!.options.map((o) => o.card),
        );
      else if (slug !== 'elementary') expect(match.view(other).game!.observation).toBeUndefined();
      match.disconnect(owner);
      expect(match.paused).toBe(true);
      match.reconnect(owner);
      expect(match.game).toEqual(before);
      expect(match.view(owner).game!.choice).toEqual(view.choice);
      match.game = JSON.parse(JSON.stringify(match.game)) as GameState;
      const option =
        choice.prompt === 'Name an attack or defense value'
          ? slug.endsWith('miss')
            ? 'value-100'
            : 'value-3'
          : choice.prompt === 'Predict the printed attack value'
            ? 'value-3'
            : choice.options[0].id;
      const response: Command = { type: 'choose', choice: choice.id, options: [option] };
      expect(
        match.command(other, {
          id: 'forged-owner',
          revision: match.game!.revision,
          command: response,
        }).error?.code,
      ).toBe('ILLEGAL');
      expect(
        match.command(owner, {
          id: 'forged-option',
          revision: match.game!.revision,
          command: { ...response, options: ['$forged'] },
        }).error?.code,
      ).toBe('ILLEGAL');
      expect(match.game).toEqual(before);
      send(owner, response);
      stages++;
    }
    expect(stages).toBeGreaterThanOrEqual(
      slug.startsWith('confirm-suspicion') ? 3 : slug === 'eliminate-the-impossible' ? 2 : 1,
    );
    expect(match.game!.resolution.frames).toEqual({});
  },
);
