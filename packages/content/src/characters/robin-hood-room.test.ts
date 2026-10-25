import { afterEach, expect, it } from 'vitest';
import { deploymentSpaces, type Command } from '@open-boards/game';
import { Match, activeSeats } from '../../../../apps/server/src/rooms/match';
import { basic, deckDefinitions } from '../index';

afterEach(() => activeSeats.clear());
it.each(['steal-from-the-rich', 'disarming-shot', 'defenders-of-sherwood', 'highway-robbery'])(
  'restores Robin Hood’s private %s prompts and exact Outlaws after room reconnect',
  (slug) => {
    let next = 0;
    const match = new Match(`robin-hood-${slug}`, 2, (character) =>
      deckDefinitions(character).map((definition) => ({ id: `c-${next++}`, definition })),
    );
    for (const id of ['a', 'b']) {
      match.join({ id, name: id }, () => {});
      match.selectCharacter(id, 'robin-hood');
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
    const state = match.game!,
      fighter = (id: string) => state.fighters.find((f) => f.id === id)!;
    for (let i = 1; i <= 4; i++) {
      fighter(`a:ally-${i}`).position = `n${20 + i}`;
      fighter(`b:ally-${i}`).position = `n${15 + i}`;
    }
    fighter('a:main').position = 'n0';
    fighter('b:main').position = 'n1';
    if (slug === 'highway-robbery') {
      fighter('a:main').position = 'n25';
      fighter('a:ally-1').position = 'n0';
    }
    state.players[0].hand[0].definition = `robin-hood-${slug}`;
    if (slug === 'steal-from-the-rich') {
      send('a', { type: 'play-action', fighter: 'a:main', card: state.players[0].hand[0].id });
    } else {
      const defending = slug === 'defenders-of-sherwood';
      if (defending) {
        state.turn = 1;
        fighter('a:ally-4').hp = 0;
        fighter('a:ally-4').defeated = true;
        state.players[1].hand[0].definition = 'robin-hood-a-hunter-s-eye';
      }
      send(defending ? 'b' : 'a', {
        type: 'attack',
        fighter: defending ? 'b:main' : slug === 'highway-robbery' ? 'a:ally-1' : 'a:main',
        target: defending ? 'a:main' : 'b:main',
        card: state.players[defending ? 1 : 0].hand[0].id,
      });
      send(defending ? 'a' : 'b', {
        type: 'defend',
        card: defending ? match.game!.players[0].hand[0].id : null,
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
      const selected = c.options.find((o) => o.id === '$stay')?.id ?? c.options[0].id;
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
    expect(match.game!.fighters.filter((f) => f.player === 'a' && f.role === 'ally')).toHaveLength(
      4,
    );
  },
);
