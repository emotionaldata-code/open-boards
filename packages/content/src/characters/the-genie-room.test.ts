import { afterEach, expect, it } from 'vitest';
import { Match, activeSeats } from '../../../../apps/server/src/rooms/match';
import { deckDefinitions } from '../index';
import type { Command } from '@open-boards/game';

afterEach(() => activeSeats.clear());
it.each(['ive-made-sultans-out-of-less', 'i-am-freed'])(
  'restores the exact private %s continuation across room disconnect/reconnect',
  (slug) => {
    let next = 0;
    const m = new Match(`genie-${slug}`, 2, (character) =>
      deckDefinitions(character).map((definition) => ({ id: `g-${next++}`, definition })),
    );
    for (const id of ['a', 'b']) {
      m.join({ id, name: id }, () => {});
      m.selectCharacter(id, 'the-genie');
      m.ready(id);
    }
    m.start('a');
    const command = (actor: string, command: Command) =>
      m.command(actor, {
        id: `r-${m.game!.revision}`,
        revision: m.game!.revision,
        command,
      });
    command('a', { type: 'choose', choice: m.game!.resolution.choice!.id, options: ['skip'] });
    const state = m.game!,
      ac = state.players[0].hand[0];
    ac.definition = `the-genie-${slug}`;
    state.fighters[0].position = 'n0';
    state.fighters[1].position = 'n1';
    command('a', { type: 'attack', fighter: 'a:main', target: 'b:main', card: ac.id });
    command('b', { type: 'defend', card: null });
    const before = structuredClone(m.game),
      own = m.view('a').game!;
    expect(own.choice).not.toBeNull();
    expect(m.view('b').game!.choice).toBeNull();
    expect(own.choice).not.toHaveProperty('continuations');
    if (slug === 'ive-made-sultans-out-of-less') {
      expect(own.choice!.options.every((o) => o.card?.id === o.id)).toBe(true);
    } else expect(own.choice!.options.some((o) => o.id === '$stay')).toBe(false);
    m.disconnect('a');
    m.reconnect('a');
    expect(m.game).toEqual(before);
    expect(m.view('a').game!.choice).toEqual(own.choice);
    const pick = own.choice!.options[0].id;
    const response = { type: 'choose' as const, choice: own.choice!.id, options: [pick] };
    expect(command('b', response).error).toBeDefined();
    expect(command('a', { ...response, options: ['forged'] }).error).toBeDefined();
    expect(m.game).toEqual(before);
    const envelope = { id: 'final-choice', revision: m.game!.revision, command: response };
    m.command('a', envelope);
    const applied = structuredClone(m.game);
    expect(m.command('a', envelope).error?.code).toBe('DUPLICATE');
    expect(m.game).toEqual(applied);
    if (slug === 'ive-made-sultans-out-of-less') {
      expect(m.game!.players[1].discard.some((c) => c.id === pick)).toBe(true);
    } else expect(m.game!.fighters[0].position).toBe(pick);
  },
);
