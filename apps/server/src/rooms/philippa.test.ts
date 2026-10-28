import { afterEach, expect, it } from 'vitest';
import { basic, deckDefinitions } from '@open-boards/content';
import { deploymentSpaces, type Command, type GameState } from '@open-boards/game';
import { Match, activeSeats } from './match';

afterEach(() => activeSeats.clear());
it.each([2, 4] as const)(
  'restores both owners’ exact Spymaster’s Ruse choices across reconnect (%s seats)',
  (size) => {
    let deckId = 0;
    const m = new Match(`philippa-${size}`, size, (character) => {
      const prefix = deckId++;
      return deckDefinitions(character).map((definition, i) => ({
        id: `${prefix}-${i}`,
        definition,
      }));
    });
    for (let i = 0; i < size; i++) {
      m.join({ id: `p${i}`, name: `Seat ${i}` }, () => {});
      m.selectCharacter(`p${i}`, 'philippa');
      m.ready(`p${i}`);
    }
    m.start('p0');
    const send = (actor: string, command: Command) =>
      m.command(actor, { id: `c-${m.game!.revision}`, revision: m.game!.revision, command });
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
    m.game!.players[0].hand[0].definition = 'philippa-spymasters-ruse';
    expect(
      send('p0', { type: 'play-action', fighter: 'p0:ally-1', card: m.game!.players[0].hand[0].id })
        .error,
    ).toBeUndefined();
    expect(
      send('p0', { type: 'choose', choice: m.game!.resolution.choice!.id, options: ['p1'] }).error,
    ).toBeUndefined();
    const reconnect = () => {
      const choice = m.game!.resolution.choice!;
      const view = m.view(choice.player).game!.choice;
      m.disconnect(choice.player);
      expect(m.paused).toBe(true);
      m.game = JSON.parse(JSON.stringify(m.game)) as GameState;
      m.reconnect(choice.player);
      expect(m.paused).toBe(false);
      expect(m.view(choice.player).game!.choice).toEqual(view);
      for (let i = 0; i < size; i++)
        if (`p${i}` !== choice.player) {
          expect(m.view(`p${i}`).game!.choice).toBeNull();
          expect(JSON.stringify(m.view(`p${i}`))).not.toContain('continuations');
        }
      const envelope = {
        id: `test-${m.game!.revision}`,
        revision: m.game!.revision,
        command: { type: 'choose' as const, choice: choice.id, options: ['$forged'] },
      };
      const before = structuredClone(m.game);
      expect(m.command(choice.player, envelope).error?.code).toBe('ILLEGAL');
      expect(m.game).toEqual(before);
    };
    for (let i = 0; i < 4; i++) {
      reconnect();
      const c = m.game!.resolution.choice!;
      expect(c.player).toBe('p1');
      expect(
        send('p1', { type: 'choose', choice: c.id, options: [c.options[0].id] }).error,
      ).toBeUndefined();
    }
    reconnect();
    const c = m.game!.resolution.choice!;
    expect(c.player).toBe('p0');
    expect(c.options).toHaveLength(4);
    const envelope = {
      id: 'discard-revealed',
      revision: m.game!.revision,
      command: {
        type: 'choose' as const,
        choice: c.id,
        options: c.options.slice(0, 2).map((o) => o.id),
      },
    };
    expect(m.command('p1', envelope).error?.code).toBe('ILLEGAL');
    expect(m.command('p0', envelope).error).toBeUndefined();
    expect(m.command('p0', envelope).error?.code).toBe('DUPLICATE');
    expect(m.command('p0', { ...envelope, id: 'stale' }).error?.code).toBe('STALE');
    expect(m.game!.players[1].discard).toHaveLength(2);
    expect(m.game!.players[1].hand).toHaveLength(5);
  },
);
