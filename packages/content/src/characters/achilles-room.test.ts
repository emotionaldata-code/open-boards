import { afterEach, expect, it } from 'vitest';
import { deploymentSpaces, type Command } from '@open-boards/game';
import { Match, activeSeats } from '../../../../apps/server/src/rooms/match';
import { basic, deckDefinitions } from '../index';

afterEach(() => activeSeats.clear());
it.each(['battle-hardened', 'blessed-by-hermes', 'under-achilles-helm', 'test-for-weakness'])(
  'restores Achilles’s %s choices and defense participants after room reconnect',
  (slug) => {
    let next = 0;
    const match = new Match(`achilles-${slug}`, 2, (character) =>
      deckDefinitions(character).map((definition) => ({ id: `c-${next++}`, definition })),
    );
    for (const id of ['a', 'b']) {
      match.join({ id, name: id }, () => {});
      match.selectCharacter(id, 'achilles');
      match.ready(id);
    }
    match.start('a');
    const send = (actor: string, command: Command) => {
      const result = match.command(actor, {
        id: `c-${match.game!.revision}`,
        revision: match.game!.revision,
        command,
      });
      expect(result.error).toBeUndefined();
    };
    while (match.game!.phase.type === 'placing-allies') {
      const fighter = match.game!.fighters.find((f) => f.position === null)!;
      send(fighter.player, {
        type: 'place-ally',
        fighter: fighter.id,
        position: deploymentSpaces(match.game!, fighter.id, basic.map)[0],
      });
    }
    const state = match.game!;
    state.fighters.find((f) => f.id === 'a:main')!.position = 'n0';
    state.fighters.find((f) => f.id === 'a:ally-1')!.position = 'n5';
    state.fighters.find((f) => f.id === 'b:main')!.position = 'n1';
    state.fighters.find((f) => f.id === 'b:ally-1')!.position = 'n18';
    state.players[0].discard.push({ id: 'prior', definition: 'achilles-feint' });
    if (slug === 'under-achilles-helm') {
      state.turn = 1;
      state.players[1].hand[0].definition = 'achilles-test-for-weakness';
      state.players[0].hand[0].definition = 'achilles-under-achilles-helm';
      send('b', {
        type: 'attack',
        fighter: 'b:main',
        target: 'a:main',
        card: state.players[1].hand[0].id,
      });
      send('a', { type: 'defend', card: match.game!.players[0].hand[0].id });
    } else {
      state.players[0].hand[0].definition = `achilles-${slug}`;
      send('a', {
        type: 'attack',
        fighter: 'a:main',
        target: 'b:main',
        card: state.players[0].hand[0].id,
      });
      send('b', { type: 'defend', card: null });
    }
    let stages = 0;
    while (match.game!.resolution.choice) {
      const choice = match.view('a').game!.choice!;
      expect(choice).not.toHaveProperty('continuations');
      expect(match.view('b').game!.choice).toBeNull();
      const before = structuredClone(match.game);
      match.disconnect('a');
      match.reconnect('a');
      expect(match.game).toEqual(before);
      expect(match.view('a').game!.choice).toEqual(choice);
      const response: Command = {
        type: 'choose',
        choice: choice.id,
        options: [choice.options.find((o) => o.id === '$stay')?.id ?? choice.options[0].id],
      };
      expect(
        match.command('b', { id: 'forged', revision: match.game!.revision, command: response })
          .error,
      ).toBeDefined();
      expect(
        match.command('a', {
          id: 'forged-option',
          revision: match.game!.revision,
          command: { ...response, options: ['forged'] },
        }).error,
      ).toBeDefined();
      expect(match.game).toEqual(before);
      send('a', response);
      stages++;
    }
    if (slug === 'test-for-weakness' || slug === 'under-achilles-helm') {
      const defender = slug === 'under-achilles-helm' ? 'a:ally-1' : 'b:main';
      const actor = slug === 'under-achilles-helm' ? 'a' : 'b';
      expect(match.view(actor).game!.phase).toMatchObject({
        type: 'awaiting-defense',
        defender,
        bonus: { name: 'Relentless Assault', value: 3 },
      });
      const before = structuredClone(match.game);
      match.disconnect(actor);
      match.reconnect(actor);
      expect(match.game).toEqual(before);
      send(actor, { type: 'defend', card: null });
      expect(
        match.game!.players[slug === 'under-achilles-helm' ? 1 : 0].discard.filter(
          (c) => c.definition === 'achilles-test-for-weakness',
        ),
      ).toHaveLength(1);
    } else expect(stages).toBe(slug === 'blessed-by-hermes' ? 4 : 1);
    expect(match.game!.resolution.frames).toEqual({});
  },
);
