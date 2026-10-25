import type { Outcome } from '@open-boards/game';
import { fighterById, fighterDefinition, mainFighter, portalStep } from '@open-boards/game';
import type { GameView } from '@open-boards/protocol';
import { basic } from '@open-boards/content';
import type { SoundEffect } from '../audio/cues';
import { timing } from './timing';
import { abilityVisuals, statusVisuals, type AbilityMark } from '../characters/marks';
import { isActionPlay, outcomeReview, type EventReview } from '../presentation/reviews';

export type Tone = 'gold' | 'mint' | 'ember';
export type VisualEffect = (
  | { type: 'move'; player: string; path: string[] }
  | { type: 'ring'; node: string }
  | { type: 'burst'; node: string }
  | { type: 'text'; node: string; text: string }
  | { type: 'attack'; player: string; from: string; to: string; style: 'ranged' | 'melee' }
  | { type: 'shield'; node: string }
  | { type: 'cards'; node: string }
  | { type: 'sigil'; node: string; mark: AbilityMark }
) & { delay?: number; duration?: number };
export interface PresentationEvent {
  id: string;
  revision: number;
  title: string;
  detail: string;
  tone: Tone;
  duration: number;
  effects: VisualEffect[];
  sounds: SoundEffect[];
  review?: EventReview;
}
type Cue = Omit<PresentationEvent, 'id' | 'revision'>;
interface Context {
  game: GameView;
  previous: GameView | null;
  name: (id: string) => string;
  node: (id: string) => string;
}
type Recipes = {
  [K in Outcome['type']]: (event: Extract<Outcome, { type: K }>, context: Context) => Cue | null;
};
const cue = (
  title: string,
  detail: string,
  effects: VisualEffect[],
  tone: Tone = 'gold',
  duration = timing.notice,
  sounds: SoundEffect[] = [],
): Cue => ({ title, detail, effects, tone, duration, sounds });

// Recipes interpret confirmed, viewer-safe events. They never infer damage or legality.
const recipes: Recipes = {
  'hand-revealed': (o, c) =>
    cue(
      'Hand revealed',
      `${c.name(o.player)} reveals ${o.cards.length} cards`,
      [],
      'gold',
      timing.notice,
      [{ name: 'cards' }],
    ),
  boost: (o, c) =>
    cue(
      o.cancelled
        ? 'BOOST cancelled'
        : o.purpose === 'maneuver'
          ? 'Movement boosted'
          : 'Attack boosted',
      `${c.name(o.fighter)} · ${basic.cards[o.card.definition].name} · +${o.amount}`,
      [{ type: 'text', node: c.node(o.fighter), text: `+${o.amount}` }],
      'mint',
      timing.notice,
      [{ name: 'cards' }],
    ),
  draw: () => null, // Public deck-count changes cover drawing without accessing private card IDs.
  move: (o, c) => {
    const travel = Math.max(timing.step, (o.path.length - 1) * timing.step);
    const portals = o.path.slice(1).map((node, i) => portalStep(basic.map, o.path[i], node));
    return cue(
      portals.some(Boolean)
        ? 'Through the rift'
        : o.path.length > 1
          ? 'On the move'
          : 'Holding ground',
      c.name(o.fighter),
      [
        { type: 'move', player: o.fighter, path: o.path, duration: travel },
        { type: 'ring', node: o.path.at(-1) ?? c.node(o.fighter), delay: travel },
      ],
      'mint',
      Math.max(timing.brief, travel + 450),
      portals.map((portal, index) => ({
        name: portal ? 'portal' : 'move',
        delay: index * timing.step,
      })),
    );
  },
  combat: (o, c) => {
    const { attacker, defender, attack, defense, boosts, damage, bonus } = o.combat;
    const ranged = fighterDefinition(fighterById(c.game, attacker)!, basic).attackType === 'ranged';
    return cue(
      damage === 0 ? 'Blocked!' : 'Clash!',
      `${bonus?.name ?? basic.cards[attack.definition].name} ${bonus?.value ?? basic.cards[attack.definition].value}${boosts.map((b) => ` +${b.amount} BOOST`).join('')} · ${defense ? `${basic.cards[defense.definition].name} ${basic.cards[defense.definition].value}` : 'No defense'}`,
      [
        {
          type: 'attack',
          player: attacker,
          from: c.node(attacker),
          to: c.node(defender),
          style: ranged ? 'ranged' : 'melee',
          duration: timing.impact + 450,
        },
        ...(defense
          ? [{ type: 'shield' as const, node: c.node(defender), delay: timing.impact - 200 }]
          : []),
        { type: damage ? 'burst' : 'ring', node: c.node(defender), delay: timing.impact },
      ],
      damage ? 'ember' : 'mint',
      timing.combat,
      [
        { name: ranged ? 'arrow' : 'slash', delay: ranged ? 200 : 400 },
        ...(defense ? [{ name: 'shield' as const, delay: timing.impact }] : []),
        ...(damage ? [{ name: 'impact' as const, delay: timing.impact }] : []),
      ],
    );
  },
  damage: (o, c) =>
    cue(
      o.reason === 'exhaustion' ? 'Exhaustion' : o.amount ? 'Direct hit' : 'Guard holds',
      `${c.name(o.fighter)} · ${o.amount} damage`,
      [
        { type: 'text', node: c.node(o.fighter), text: o.amount ? `−${o.amount}` : 'Blocked' },
        { type: o.amount ? 'burst' : 'shield', node: c.node(o.fighter) },
      ],
      o.amount ? 'ember' : 'mint',
      timing.notice,
      o.reason === 'combat' ? [] : [{ name: o.amount ? 'impact' : 'shield' }],
    ),
  revived: (o, c) =>
    cue(
      'Returned',
      `${c.name(o.fighter)} returns to the arena`,
      [
        { type: 'ring', node: o.position },
        { type: 'text', node: o.position, text: 'Returned' },
      ],
      'mint',
      timing.notice,
      [{ name: 'heal' }],
    ),
  defeated: (o, c) =>
    cue(
      'Fallen',
      `${c.name(o.fighter)} is defeated`,
      [{ type: 'text', node: c.node(o.fighter), text: 'Fallen' }],
      'ember',
      timing.notice,
      [{ name: 'fallen' }],
    ),
  eliminated: (o, c) =>
    cue(
      'Fallen',
      `${c.name(o.player)} is eliminated`,
      [
        { type: 'ring', node: c.node(o.player) },
        { type: 'text', node: c.node(o.player), text: 'Fallen' },
      ],
      'ember',
      timing.notice,
      [{ name: 'fallen' }],
    ),
  turn: (o, c) =>
    cue(
      'Your move, ' + c.name(o.player),
      '2 actions',
      [{ type: 'ring', node: c.node(o.player) }],
      'gold',
      timing.brief,
      [{ name: 'turn' }],
    ),
  finished: (o, c) =>
    cue(
      o.winner ? 'Victory' : 'A draw',
      o.winner ? `${c.name(o.winner)} claims the arena` : 'No survivors',
      o.winner
        ? [
            { type: 'ring', node: c.node(o.winner) },
            { type: 'text', node: c.node(o.winner), text: 'Victory' },
          ]
        : [],
      'gold',
      timing.victory,
      [{ name: 'victory' }],
    ),
  played: (o, c) => {
    const definition = basic.cards[o.card.definition];
    const action = isActionPlay(o, c.previous);
    return cue(
      definition.name,
      `${c.name(o.player)} · ${action ? 'Card played' : 'Card discarded'}`,
      [
        { type: action ? 'cards' : 'ring', node: c.node(o.fighter) },
        { type: 'text', node: c.node(o.fighter), text: action ? 'Play' : 'Discard' },
      ],
      'gold',
      timing.notice,
      [{ name: 'cards' }],
    );
  },
  heal: (o, c) =>
    cue(
      'Restored',
      `${c.name(o.fighter)} · +${o.amount} health`,
      [
        { type: 'ring', node: c.node(o.fighter) },
        { type: 'text', node: c.node(o.fighter), text: `+${o.amount}` },
      ],
      'mint',
      timing.notice,
      [{ name: 'heal' }],
    ),
  ability: (o, c) => {
    const character = fighterById(c.game, o.fighter)?.character ?? '';
    const status = Object.values(basic.statuses ?? {}).find((s) =>
      s.abilities?.some((ability) => ability.name === o.name),
    );
    const visual = (status && statusVisuals[status.id]) || abilityVisuals[character];
    return cue(
      o.name,
      c.name(o.fighter),
      [
        { type: 'ring', node: c.node(o.fighter) },
        ...(visual
          ? [{ type: 'sigil' as const, node: c.node(o.fighter), mark: visual.mark, delay: 120 }]
          : [{ type: 'burst' as const, node: c.node(o.fighter), delay: 180 }]),
      ],
      visual?.tone ?? 'gold',
      timing.notice,
      [{ name: status?.id === 'burn' ? 'burn' : 'ability' }],
    );
  },
  status: (o, c) => {
    const visual = statusVisuals[o.status];
    return cue(
      basic.statuses?.[o.status]?.name ?? o.status,
      `${c.name(o.fighter)} · ${o.stacks ? `${o.stacks} stacks` : 'Status removed'}`,
      [
        { type: 'ring', node: c.node(o.fighter) },
        ...(visual && o.stacks
          ? [{ type: 'sigil' as const, node: c.node(o.fighter), mark: visual.mark }]
          : []),
        { type: 'text', node: c.node(o.fighter), text: o.stacks ? `×${o.stacks}` : 'Cleared' },
      ],
      visual?.tone ?? 'mint',
      timing.notice,
      o.stacks ? [{ name: o.status === 'burn' ? 'burn' : 'ability' }] : [],
    );
  },
};
function interpret(outcome: Outcome, context: Context): Cue | null {
  // The dispatch keeps the discriminated event/recipe pair together.
  return (recipes[outcome.type] as (o: Outcome, c: Context) => Cue | null)(outcome, context);
}
export function presentationEvents(
  previous: GameView | null,
  game: GameView,
  outcomes: Outcome[],
  receipt = game.revision,
): PresentationEvent[] {
  const context: Context = {
    game,
    previous,
    name: (id) => {
      const f = fighterById(game, id);
      return f
        ? f.role === 'ally'
          ? `${fighterDefinition(f, basic).name} ${f.id.split('-').at(-1)}`
          : game.players.find((p) => p.id === f.player)!.name
        : (game.players.find((p) => p.id === id)?.name ?? 'A rival');
    },
    node: (id) =>
      fighterById(game, id)?.position ?? mainFighter(game, id)?.position ?? basic.map.nodes[0],
  };
  const events: PresentationEvent[] = [];
  const add = (id: string, data: Cue) => events.push({ ...data, id, revision: game.revision });
  if (previous) {
    if (game.paused !== previous.paused)
      add(
        `connection:${receipt}:${game.paused}`,
        cue(
          game.paused ? 'Arena paused' : 'Back in the fight',
          game.paused
            ? 'Waiting for your rivals to reconnect.'
            : 'All remaining rivals are connected.',
          [],
          'gold',
          timing.notice,
        ),
      );
    if (game.revision !== previous.revision) {
      if (game.phase.type === 'awaiting-defense' && previous.phase.type !== 'awaiting-defense') {
        const { attacker, defender } = game.phase;
        add(
          `attack:${game.revision}`,
          cue(
            'Attack incoming',
            `${context.name(attacker)} challenges ${context.name(defender)}`,
            [
              { type: 'ring', node: context.node(defender) },
              { type: 'text', node: context.node(attacker), text: 'Attack!' },
            ],
            'ember',
            timing.notice,
            [{ name: 'alert' }],
          ),
        );
      }
      if (game.phase.type === 'ability-choice' && previous.phase.type !== 'ability-choice')
        add(
          `choice:${game.revision}`,
          cue(
            'A choice awaits',
            `${context.name(game.phase.player)} is choosing an ability`,
            [{ type: 'ring', node: context.node(game.phase.player) }],
            'gold',
            timing.brief,
          ),
        );
      if (game.phase.type === 'discarding' && previous.phase.type !== 'discarding')
        add(
          `discard:${game.revision}`,
          cue(
            'Make room',
            `${context.name(game.phase.player)} must discard to seven cards`,
            [{ type: 'ring', node: context.node(game.phase.player) }],
            'gold',
            timing.brief,
          ),
        );
    }
  }
  for (const outcome of outcomes) {
    // Combat already reveals committed cards; don't announce those as separate discards.
    if (
      outcome.type === 'played' &&
      outcomes.some(
        (o) =>
          o.type === 'combat' &&
          (o.combat.attack.id === outcome.card.id || o.combat.defense?.id === outcome.card.id),
      )
    )
      continue;
    const data = interpret(outcome, context);
    if (data)
      events.push({
        ...data,
        id: `outcome:${outcome.sequence}`,
        revision: outcome.revision,
        review: outcomeReview(outcome, game, previous),
      });
  }
  if (previous && game.revision !== previous.revision) {
    for (const player of game.players) {
      const before = previous.players.find((p) => p.id === player.id);
      const drawn = before ? before.deckCount - player.deckCount : 0;
      const maneuver =
        game.phase.type === 'choosing-movement' &&
        game.phase.player === player.id &&
        previous.phase.type !== 'choosing-movement';
      if (maneuver || drawn > 0)
        add(
          `draw:${game.revision}:${player.id}`,
          cue(
            maneuver ? 'Maneuver' : 'Cards drawn',
            `${player.name} · ${drawn ? `+${drawn} ${drawn === 1 ? 'card' : 'cards'}` : 'Choose your path'}`,
            [
              { type: 'cards', node: context.node(player.id) },
              ...(drawn
                ? [{ type: 'text' as const, node: context.node(player.id), text: `+${drawn}` }]
                : []),
            ],
            'mint',
            timing.brief,
            [{ name: 'cards' }],
          ),
        );
    }
  }
  return events;
}
