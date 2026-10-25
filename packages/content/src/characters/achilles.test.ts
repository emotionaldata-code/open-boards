import { describe, expect, it } from 'vitest';
import {
  createGame,
  deploymentSpaces,
  execute,
  forfeit,
  validateDefinitions,
  type Command,
  type Definitions,
  type GameState,
  type Outcome,
} from '@open-boards/game';
import { projectGame } from '../../../../apps/server/src/transport/projection';
import { basic as content, deckDefinitions } from '../index';
import { basic as neutral } from '../../../../tests/rules-fixture';
import inventory from '../../../../docs/characters/achilles/inventory.json';

function setup(edit: (defs: Definitions) => void = () => {}, roster = ['achilles', 'vanguard']) {
  const defs = structuredClone({
    ...content,
    characters: { ...content.characters, ...neutral.characters },
    cards: { ...content.cards, ...neutral.cards },
  });
  edit(defs);
  let state = createGame(
    roster.map((character, i) => ({
      id: `p${i}`,
      name: `Seat ${i}`,
      character,
      deck: defs.characters[character].deck
        .flatMap(({ card, count }) => Array<string>(count).fill(card))
        .map((definition, j) => ({ id: `p${i}-${j}`, definition })),
    })),
    defs,
    731,
  );
  const h = {
    defs,
    get state() {
      return state;
    },
    fighter(id = 'p0:main') {
      return state.fighters.find((f) => f.id === id)!;
    },
    reconnect() {
      state = JSON.parse(JSON.stringify(state)) as GameState;
    },
    run(command: Command, actor = 'p0') {
      return execute(
        state,
        actor,
        { id: `c-${state.revision}`, revision: state.revision, command },
        defs,
      );
    },
    apply(command: Command, actor = 'p0'): Outcome[] {
      const result = h.run(command, actor);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      return result.outcomes;
    },
    choose(option?: string) {
      h.reconnect();
      const c = state.resolution.choice!;
      return h.apply(
        { type: 'choose', choice: c.id, options: [option ?? c.options[0].id] },
        c.player,
      );
    },
    action(slug: string, fighter = 'p0:main') {
      const card = state.players[0].hand[0];
      card.definition = `achilles-${slug}`;
      return h.apply({ type: 'play-action', fighter, card: card.id });
    },
    attack(slug: string, attacking = 'p0:main', defending = 'p1:main') {
      h.fighter(attacking).position = 'n0';
      h.fighter(defending).position = 'n1';
      const actor = h.fighter(attacking).player;
      state.turn = state.players.findIndex((p) => p.id === actor);
      const card = state.players[state.turn].hand[0];
      card.definition = slug;
      return h.apply(
        { type: 'attack', fighter: attacking, target: defending, card: card.id },
        actor,
      );
    },
    defend(slug: string | null = null, actor = 'p1') {
      const p = state.players.find((p) => p.id === actor)!;
      if (slug) p.hand[0].definition = slug;
      return h.apply({ type: 'defend', card: slug ? p.hand[0].id : null }, actor);
    },
  };
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  h.fighter('p0:ally-1').position = 'n5';
  return h;
}

function privateChoice(h: ReturnType<typeof setup>) {
  h.reconnect();
  const choice = h.state.resolution.choice!;
  const snapshot = structuredClone(h.state);
  for (const viewer of ['p1', 'spectator']) {
    const view = projectGame(h.state, viewer, false);
    expect(view.choice).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/continuations|turnPositions|"random"/);
  }
  const command: Command = { type: 'choose', choice: choice.id, options: [choice.options[0].id] };
  expect(h.run(command, 'p1')).toMatchObject({ ok: false, error: 'ILLEGAL' });
  expect(h.run({ ...command, options: ['$forged'] })).toMatchObject({
    ok: false,
    error: 'ILLEGAL',
  });
  expect(h.run({ ...command, options: [choice.options[0].id, choice.options[0].id] }).ok).toBe(
    false,
  );
  expect(execute(h.state, 'p0', { id: 'stale', revision: -1, command }, h.defs)).toMatchObject({
    error: 'STALE',
  });
  expect(h.state).toEqual(snapshot);
}

describe('complete printed Achilles deck', () => {
  it('preserves all 30 copies, 12 designs, fighter stats, tags, BOOSTs and source clauses', () => {
    expect(() => validateDefinitions(content)).not.toThrow();
    expect(deckDefinitions('achilles')).toHaveLength(30);
    expect(content.characters.achilles.deck).toHaveLength(12);
    expect(content.characters.achilles).toMatchObject({
      hp: 18,
      movement: 2,
      attackType: 'melee',
      ally: { hp: 6, count: 1, attackType: 'melee' },
    });
    for (const source of inventory.cards) {
      expect(content.cards[source.id]).toMatchObject({
        name: source.name,
        usableBy: source.usableBy,
        category: source.category,
        value: source.value,
        boost: source.boost,
      });
      expect(deckDefinitions('achilles').filter((id) => id === source.id)).toHaveLength(
        source.count,
      );
      for (const text of Object.values(source.sourceRules))
        expect(content.cards[source.id].description).toContain(text);
      expect(
        content.cards[source.id].effects?.length || content.cards[source.id].abilities?.length,
      ).toBeTruthy();
    }
  });

  it.each([0, 1, 4])(
    'Patroclus’s natural defeat randomly discards up to two of %i cards exactly once',
    (size) => {
      const h = setup();
      h.fighter('p0:ally-1').hp = 1;
      h.state.players[0].hand = h.state.players[0].hand.slice(0, size);
      h.attack('strike', 'p1:main', 'p0:ally-1');
      const saved = structuredClone(h.state);
      const outcomes = h.defend(null, 'p0');
      expect(h.fighter('p0:ally-1').defeated).toBe(true);
      expect(h.fighter().hp).toBe(18);
      expect(h.state.players[0].hand).toHaveLength(Math.max(0, size - 2));
      expect(h.state.players[0].discard).toHaveLength(Math.min(size, 2));
      expect(outcomes.filter((o) => o.type === 'played')).toHaveLength(Math.min(size, 2));
      const replay = execute(
        saved,
        'p0',
        { id: 'replay', revision: saved.revision, command: { type: 'defend', card: null } },
        h.defs,
      );
      expect(replay.ok && replay.state.players[0].hand).toEqual(h.state.players[0].hand);
      expect(h.state.resolution.choice).toBeNull();
      expect(JSON.stringify(projectGame(h.state, 'p1', false))).not.toContain('"random"');
    },
  );

  it('rage survives Feint and draws once for attacking or defending wins, after card effects', () => {
    const h = setup();
    h.fighter('p0:ally-1').defeated = true;
    h.fighter('p0:ally-1').hp = 0;
    h.attack('achilles-brothers-in-arms');
    h.defend('achilles-feint');
    expect(h.state.revealed?.damage).toBe(4);
    expect(h.state.actions).toBe(1);
    expect(h.state.players[0].hand).toHaveLength(5);
    const g = setup();
    g.fighter('p0:ally-1').defeated = true;
    g.fighter('p0:ally-1').hp = 0;
    const recovered = { id: 'recover', definition: 'achilles-feint' };
    g.state.players[0].discard.push(recovered);
    g.defs.cards.strike.value = 1;
    g.attack('strike', 'p1:main', 'p0:main');
    g.defend('achilles-battle-hardened', 'p0');
    expect(g.state.players[0].hand).toHaveLength(4); // draw waits for card recovery
    privateChoice(g);
    g.choose(recovered.id);
    expect(g.state.players[0].hand).toHaveLength(6);
    expect(g.state.revealed?.damage).toBe(0);
  });

  it.each([false, true])(
    'Brothers In Arms checks Patroclus at resolution, for either acting fighter (%s)',
    (ally) => {
      const h = setup();
      h.attack('achilles-brothers-in-arms', ally ? 'p0:ally-1' : 'p0:main');
      h.defend();
      expect(h.state.actions).toBe(2);
      expect(h.state.players[0].hand).toHaveLength(4);
    },
  );

  it('a bonus attack costs no second action/card, draws between wins, ignores range, and does not repeat original effects', () => {
    const h = setup();
    h.fighter('p0:ally-1').defeated = true;
    h.fighter('p0:ally-1').hp = 0;
    h.attack('achilles-test-for-weakness');
    const original = h.state.phase.type === 'awaiting-defense' && h.state.phase.card.id;
    const first = h.defend();
    expect(first.filter((o) => o.type === 'combat')).toMatchObject([{ combat: { damage: 3 } }]);
    expect(h.state.phase).toMatchObject({
      type: 'awaiting-defense',
      bonus: { name: 'Relentless Assault', value: 3 },
    });
    expect(h.state.players[0].hand).toHaveLength(5);
    expect(projectGame(h.state, 'p1', false).phase).toMatchObject({
      bonus: { name: 'Relentless Assault', value: 3 },
    });
    expect(projectGame(h.state, 'p1', false).phase).not.toHaveProperty('committedCard');
    h.reconnect();
    h.fighter('p1:main').position = 'n24';
    const second = h.defend();
    expect(second.filter((o) => o.type === 'combat')).toMatchObject([
      { combat: { damage: 5, bonus: { name: 'Relentless Assault', value: 3 } } },
    ]);
    expect(h.state.players[0].hand).toHaveLength(6);
    expect(h.state.players[0].discard.filter((c) => c.id === original)).toHaveLength(1);
    expect(h.state.actions).toBe(1);
    expect(h.state.resolution.frames).toEqual({});
    expect(h.state.phase.type).toBe('taking-actions');
  });

  it('Skirmish moves the defender out of range before the same fighter receives Relentless Assault', () => {
    const h = setup();
    h.attack('achilles-test-for-weakness');
    h.defend('achilles-skirmish');
    h.choose('self');
    const option = h.state.resolution.choice!.options.find((o) => o.id !== '$stay')!.id;
    h.choose(option);
    expect(h.state.phase).toMatchObject({
      type: 'awaiting-defense',
      defender: 'p1:main',
      bonus: { value: 3 },
    });
    h.defend('achilles-feint'); // second defense retains all of its own rules
    expect(h.state.revealed?.damage).toBe(1);
    expect(h.state.phase.type).toBe('taking-actions');
  });

  it.each(['cancel', 'defender-death', 'attacker-death'] as const)(
    'does not start a bonus combat after %s',
    (reason) => {
      const h = setup();
      if (reason === 'defender-death') h.fighter('p1:main').hp = 1;
      if (reason === 'attacker-death') {
        h.fighter('p0:ally-1').hp = 1;
        h.defs.cards.guard.abilities = [
          {
            id: 'retaliate',
            name: 'Retaliate',
            description: 'Deal 1 damage',
            trigger: 'after-combat',
            effects: [{ type: 'damage', target: 'opponent', amount: 1 }],
          },
        ];
      }
      h.attack('achilles-test-for-weakness', reason === 'attacker-death' ? 'p0:ally-1' : 'p0:main');
      h.defend(
        reason === 'cancel' ? 'achilles-feint' : reason === 'attacker-death' ? 'guard' : null,
      );
      expect(h.state.phase.type).not.toBe('awaiting-defense');
      expect(h.state.resolution.frames).toEqual({});
    },
  );

  it('Under Achilles’ Helm swaps distant allies atomically and transfers this and the bonus defense to Patroclus', () => {
    const h = setup(() => {}, ['achilles', 'achilles']);
    h.attack('achilles-test-for-weakness', 'p1:main', 'p0:main');
    h.fighter('p0:ally-1').position = 'n24';
    h.defend('achilles-under-achilles-helm', 'p0');
    privateChoice(h);
    h.choose('use');
    expect(h.fighter().position).toBe('n24');
    expect(h.fighter('p0:ally-1').position).toBe('n1');
    expect(h.state.phase).toMatchObject({
      type: 'awaiting-defense',
      defender: 'p0:ally-1',
      bonus: { value: 3 },
    });
    expect(h.state.revealed?.defender).toBe('p0:ally-1');
    h.reconnect();
    h.defend('achilles-feint', 'p0');
    expect(h.fighter().hp).toBe(18);
    expect(h.fighter('p0:ally-1').hp).toBe(5);
    expect(
      h.state.players[0].discard.filter((c) => c.definition === 'achilles-under-achilles-helm'),
    ).toHaveLength(1);
  });

  it.each(['skip', 'dead', 'cancel'] as const)(
    'respects skip, defeat and defender-first Feint timing (%s)',
    (reason) => {
      const h = setup();
      if (reason === 'dead') {
        h.fighter('p0:ally-1').defeated = true;
        h.fighter('p0:ally-1').hp = 0;
      }
      h.attack(reason === 'cancel' ? 'achilles-feint' : 'strike', 'p1:main', 'p0:main');
      h.defend('achilles-under-achilles-helm', 'p0');
      // Defender-first immediate exchange has already resolved before attacking Feint.
      if (reason === 'cancel') h.choose('use');
      if (reason === 'skip') h.choose('skip');
      expect(h.state.revealed?.defender).toBe(reason === 'cancel' ? 'p0:ally-1' : 'p0:main');
    },
  );

  it('Battle Hardened recovers one exact prior discard, excludes both committed cards and hides its choice', () => {
    const h = setup();
    const prior = { id: 'prior', definition: 'achilles-spear-throw' };
    h.state.players[0].discard.push(prior);
    h.attack('achilles-battle-hardened');
    h.defend('guard');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual([prior.id]);
    privateChoice(h);
    h.choose(prior.id);
    expect(h.state.players[0].hand).toContainEqual(prior);
    expect(h.state.players[0].discard).not.toContainEqual(prior);
    const empty = setup();
    empty.attack('achilles-battle-hardened');
    empty.defend();
    expect(empty.state.resolution.choice).toBeNull();
  });

  it.each([1, 2, 6])(
    'Day of Your Doom optionally pays 2 from %i HP and replaces printed value only',
    (hp) => {
      const h = setup();
      h.fighter('p0:ally-1').hp = hp;
      h.attack('achilles-the-day-of-your-doom', 'p0:ally-1');
      h.defend();
      privateChoice(h);
      h.choose('use');
      expect(h.fighter('p0:ally-1').hp).toBe(Math.max(0, hp - 2));
      expect(h.state.revealed?.damage).toBe(hp <= 2 ? 0 : 5);
      expect(h.state.players[0].hand).toHaveLength(hp <= 2 ? 2 : 4);
    },
  );

  it('does not offer a self-payment after Patroclus is defeated by an immediate opposing effect', () => {
    const h = setup((defs) => {
      defs.cards.guard.abilities = [
        {
          id: 'immediate',
          name: 'Immediate',
          description: 'Deal two damage immediately',
          trigger: 'combat-reveal',
          effects: [{ type: 'damage', target: 'opponent', amount: 2 }],
        },
      ];
    });
    h.fighter('p0:ally-1').hp = 1;
    h.attack('achilles-the-day-of-your-doom', 'p0:ally-1');
    h.defend('guard');
    expect(h.fighter('p0:ally-1').defeated).toBe(true);
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.revealed?.damage).toBe(0);
    expect(h.state.players[0].hand).toHaveLength(2);
  });

  it('Day of Your Doom can skip or be cancelled before its payment', () => {
    for (const cancel of [false, true]) {
      const h = setup();
      h.attack('achilles-the-day-of-your-doom', 'p0:ally-1');
      h.defend(cancel ? 'achilles-feint' : null);
      if (!cancel) h.choose('skip');
      expect(h.fighter('p0:ally-1').hp).toBe(6);
      expect(h.state.revealed?.damage).toBe(cancel ? 1 : 3);
    }
  });

  it('Battle Frenzy damages both combatants even after Patroclus falls, then activates Achilles’s grief', () => {
    const h = setup();
    h.fighter('p0:ally-1').hp = 1;
    h.attack('achilles-battle-frenzy', 'p0:ally-1');
    const outcomes = h.defend();
    expect(h.fighter('p1:main').hp).toBe(10);
    expect(h.fighter('p0:ally-1').defeated).toBe(true);
    expect(h.state.players[0].hand).toHaveLength(2);
    expect(outcomes.filter((o) => o.type === 'damage').map((o) => o.fighter)).toEqual([
      'p1:main',
      'p1:main',
      'p0:ally-1',
    ]);
  });

  it('Wily Fighting hits each adjacent enemy fighter, including allies, without damaging friends or remote pieces', () => {
    const h = setup(() => {}, ['achilles', 'medusa']);
    h.fighter().position = 'n0';
    h.fighter('p0:ally-1').position = 'n7';
    h.fighter('p1:main').position = 'n1';
    h.fighter('p1:ally-1').position = 'n10';
    h.fighter('p1:ally-2').position = 'n13';
    h.fighter('p1:ally-3').position = 'n24';
    h.attack('achilles-wily-fighting');
    h.defend();
    const candidates = h.state.resolution.choice!.options.map((o) => o.id);
    expect(candidates).toEqual(
      h.state.fighters
        .filter((f) => f.player === 'p1' && (f.position === 'n1' || f.position === 'n10'))
        .map((f) => f.id),
    );
    while (h.state.resolution.choice) h.choose();
    expect(h.fighter().hp).toBe(18);
    expect(h.fighter('p0:ally-1').hp).toBe(6);
    expect(h.fighter('p1:main').hp).toBe(12);
    expect(h.fighter('p1:ally-2').hp).toBe(1);
  });

  it('Blessed By Hermes moves each living owned fighter once, through enemies with private recovery', () => {
    const h = setup();
    h.attack('achilles-blessed-by-hermes');
    h.defend();
    privateChoice(h);
    h.choose('p0:ally-1');
    privateChoice(h);
    h.choose('$stay');
    expect(h.state.resolution.choice?.options.map((o) => o.id)).toEqual(['p0:main']);
    h.choose();
    privateChoice(h);
    h.choose('$stay');
    expect(h.state.resolution.frames).toEqual({});
    expect(h.fighter().hp).toBe(18);
  });

  it('Achilles’ Heel grants the attacking opponent one action only after losing', () => {
    for (const attack of [4, 5]) {
      const h = setup((defs) => {
        defs.cards.strike.value = attack;
      });
      h.attack('strike', 'p1:main', 'p0:main');
      h.defend('achilles-achilles-heel', 'p0');
      expect(h.state.actions).toBe(attack === 5 ? 2 : 1);
    }
  });

  it('Spear Throw chooses a zone-sharing enemy fighter and damages only that fighter', () => {
    const h = setup();
    h.fighter().position = 'n0';
    h.fighter('p1:main').position = 'n1';
    h.action('spear-throw');
    privateChoice(h);
    h.choose('p1:main');
    expect(h.fighter('p1:main').hp).toBe(13);
    expect(h.fighter().hp).toBe(18);
  });

  it.each(['MAIN', 'ALLY'] as const)(
    'enforces every %s restriction without consuming cards',
    (tag) => {
      for (const card of inventory.cards.filter((c) => c.usableBy === tag)) {
        const h = setup();
        const wrong = tag === 'MAIN' ? 'p0:ally-1' : 'p0:main';
        h.state.players[0].hand[0].definition = card.id;
        const id = h.state.players[0].hand[0].id;
        h.fighter(wrong).position = 'n0';
        h.fighter('p1:main').position = 'n1';
        if (card.category === 'defense') {
          h.attack('strike', 'p1:main', wrong);
          expect(h.run({ type: 'defend', card: id }).ok).toBe(false);
        } else
          expect(
            h.run(
              card.category === 'action'
                ? { type: 'play-action', fighter: wrong, card: id }
                : { type: 'attack', fighter: wrong, card: id, target: 'p1:main' },
            ).ok,
          ).toBe(false);
        expect(h.state.players[0].hand).toContainEqual({ id, definition: card.id });
      }
    },
  );

  it('forfeiting during bonus defense does not duplicate its already discarded source card', () => {
    const h = setup();
    h.attack('achilles-test-for-weakness');
    h.defend();
    expect(h.state.phase.type).toBe('awaiting-defense');
    const result = forfeit(h.state, 'p1', h.defs);
    expect(result.state.players[0].discard).toHaveLength(1);
    expect(result.state.resolution.frames).toEqual({});
  });
});
