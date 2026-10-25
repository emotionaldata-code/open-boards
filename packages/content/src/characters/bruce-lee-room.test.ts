import { afterEach, expect, it } from 'vitest';
import { type Command } from '@open-boards/game';
import { Match, activeSeats } from '../../../../apps/server/src/rooms/match';
import { deckDefinitions } from '../index';

afterEach(() => activeSeats.clear());
it.each(['recovery', 'placement', 'punch', 'swap', 'end-step'])(
  'restores Bruce Lee’s private %s choices after room reconnect',
  (scene) => {
    let next = 0;
    const match = new Match(`bruce-lee-${scene}`, 2, (character) =>
      deckDefinitions(character).map((definition) => ({ id: `c-${next++}`, definition })),
    );
    for (const id of ['a', 'b']) {
      match.join({ id, name: id }, () => {});
      match.selectCharacter(id, 'bruce-lee');
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
    const state = match.game!,
      fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
    fighter('a:main').position = 'n0';
    fighter('b:main').position = 'n1';
    const slug = {
      recovery: 'hoo-whaaaaaa',
      placement: 'bring-it-on',
      punch: 'one-inch-punch',
      swap: 'jeet-kune-do-short-lead-hook',
      'end-step': 'nunchaku',
    }[scene]!;
    state.players[0].hand[0].definition = `bruce-lee-${slug}`;
    if (scene === 'recovery')
      state.players[0].discard.push({
        id: 'technique',
        definition: 'bruce-lee-jeet-kune-do-wrist-lock',
      });
    if (scene === 'swap') {
      send('a', {
        type: 'attack',
        fighter: 'a:main',
        target: 'b:main',
        card: state.players[0].hand[0].id,
      });
      send('b', { type: 'defend', card: null });
    } else if (scene === 'end-step') {
      state.actions = 1;
      send('a', { type: 'maneuver' });
      send('a', { type: 'finish-maneuver' });
    } else send('a', { type: 'play-action', fighter: 'a:main', card: state.players[0].hand[0].id });
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
      const selected = c.options.find((o) => o.id === '$stay')?.id ?? c.options[0].id;
      const command: Command = { type: 'choose', choice: c.id, options: [selected] };
      for (const [requestActor, id, revision, options] of [
        [other, 'wrong-owner', match.game!.revision, [selected]],
        [actor, 'forged', match.game!.revision, ['forged']],
        [actor, 'stale', match.game!.revision - 1, [selected]],
        [actor, 'duplicate-selection', match.game!.revision, [selected, selected]],
      ] as const)
        expect(
          match.command(requestActor, {
            id,
            revision,
            command: { ...command, options: [...options] },
          }).error,
        ).toBeDefined();
      expect(match.game).toEqual(before);
      const revision = match.game!.revision;
      send(actor, command);
      const after = structuredClone(match.game);
      match.command(actor, { id: `c-${revision}`, revision, command });
      expect(match.game).toEqual(after);
      stages++;
      expect(stages).toBeLessThan(4);
    }
    expect(stages).toBeGreaterThan(0);
    expect(match.game!.resolution.frames).toEqual({});
    expect(match.game!.fighters).toHaveLength(2);
  },
);
