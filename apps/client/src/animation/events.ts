import { contentText } from '../localization/text';
import { messageText } from '../ui/messages';
import type { Outcome } from '@open-boards/game';
import { fighterById, fighterDefinition, mainFighter, portalStep } from '@open-boards/game';
import type { GameView } from '@open-boards/protocol';
import { basic } from '@open-boards/content';
import type { SpriteClip } from './sprites';
import type { SoundEffect } from '../audio/cues';
import { timing } from './timing';
import { abilityVisuals, statusVisuals, type AbilityMark } from '../characters/marks';
import { isActionPlay, outcomeReview, type EventReview } from '../presentation/reviews';

export type Tone = 'gold' | 'mint' | 'ember';
export type VisualEffect = (
  | { type: 'move'; player: string; path: string[] }
  | { type: 'sprite'; clip: SpriteClip; node: string }
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
      'Carte rivelate',
      `${c.name(o.player)} rivela ${o.cards.length} carte`,
      [],
      'gold',
      timing.notice,
      [{ name: 'cards' }],
    ),
  boost: (o, c) =>
    cue(
      o.cancelled
        ? 'BOOST annullato'
        : o.purpose === 'maneuver'
          ? 'Movimento potenziato'
          : o.purpose === 'defense'
            ? 'Difesa potenziata'
            : 'Attacco potenziato',
      `${c.name(o.fighter)} · ${contentText(basic.cards[o.card.definition].name)} · +${o.amount}`,
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
        ? 'Attraverso il portale'
        : o.path.length > 1
          ? 'In movimento'
          : 'Posizione mantenuta',
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
      damage === 0 ? 'Parato!' : 'Scontro!',
      `${contentText(bonus?.name) ?? contentText(basic.cards[attack.definition].name)} ${bonus?.value ?? basic.cards[attack.definition].value}${boosts
        .filter((b) => b.field !== 'defense')
        .map((b) => ` +${b.amount} BOOST`)
        .join('')} · ${
        defense
          ? `${contentText(basic.cards[defense.definition].name)} ${basic.cards[defense.definition].value}${boosts
              .filter((b) => b.field === 'defense')
              .map((b) => ` +${b.amount} BOOST`)
              .join('')}`
          : 'Nessuna difesa'
      }`,
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
      o.reason === 'exhaustion' ? 'Esaurimento' : o.amount ? 'Colpo diretto' : 'La difesa regge',
      `${c.name(o.fighter)} · ${o.amount} danni`,
      [
        { type: 'text', node: c.node(o.fighter), text: o.amount ? `−${o.amount}` : 'Parato' },
        { type: o.amount ? 'burst' : 'shield', node: c.node(o.fighter) },
      ],
      o.amount ? 'ember' : 'mint',
      timing.notice,
      o.reason === 'combat' ? [] : [{ name: o.amount ? 'impact' : 'shield' }],
    ),
  placed: (o, c) =>
    cue(
      'Di nuovo in plancia',
      c.name(o.fighter),
      [
        { type: 'ring', node: o.position },
        { type: 'text', node: o.position, text: 'Ritornato' },
      ],
      'mint',
      timing.notice,
      [{ name: 'ability' }],
    ),
  revived: (o, c) =>
    cue(
      'Ritornato',
      `${c.name(o.fighter)} ritorna nell’arena`,
      [
        { type: 'ring', node: o.position },
        { type: 'text', node: o.position, text: 'Ritornato' },
      ],
      'mint',
      timing.notice,
      [{ name: 'heal' }],
    ),
  defeated: (o, c) =>
    cue(
      'Sconfitto',
      `${c.name(o.fighter)} è sconfitto`,
      [{ type: 'text', node: c.node(o.fighter), text: 'Sconfitto' }],
      'ember',
      timing.notice,
      [{ name: 'fallen' }],
    ),
  eliminated: (o, c) =>
    cue(
      'Sconfitto',
      `${c.name(o.player)} è eliminato`,
      [
        { type: 'ring', node: c.node(o.player) },
        { type: 'text', node: c.node(o.player), text: 'Sconfitto' },
      ],
      'ember',
      timing.notice,
      [{ name: 'fallen' }],
    ),
  turn: (o, c) =>
    cue(
      'Tocca a te, ' + c.name(o.player),
      '2 azioni',
      [{ type: 'ring', node: c.node(o.player) }],
      'gold',
      timing.brief,
      [{ name: 'turn' }],
    ),
  finished: (o, c) =>
    cue(
      o.winner ? 'Vittoria' : 'Pareggio',
      o.winner ? `${c.name(o.winner)} conquista l’arena` : 'Nessun sopravvissuto',
      o.winner
        ? [
            { type: 'ring', node: c.node(o.winner) },
            { type: 'text', node: c.node(o.winner), text: 'Vittoria' },
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
      contentText(definition.name),
      `${c.name(o.player)} · ${action ? 'Carta giocata' : 'Carta scartata'}`,
      [
        { type: action ? 'cards' : 'ring', node: c.node(o.fighter) },
        { type: 'text', node: c.node(o.fighter), text: action ? 'Gioca' : 'Scarta' },
      ],
      'gold',
      timing.notice,
      [{ name: 'cards' }],
    );
  },
  heal: (o, c) =>
    cue(
      'Curato',
      `${c.name(o.fighter)} · +${o.amount} vita`,
      [
        { type: 'ring', node: c.node(o.fighter) },
        { type: 'sprite', clip: 'heal', node: c.node(o.fighter) },
        { type: 'text', node: c.node(o.fighter), text: `+${o.amount}` },
      ],
      'mint',
      timing.notice,
      [{ name: 'heal' }],
    ),
  ability: (o, c) => {
    const character = fighterById(c.game, o.fighter)?.definition ?? '';
    const status = Object.values(basic.statuses ?? {}).find((s) =>
      s.abilities?.some((ability) => ability.name === o.name),
    );
    const visual = (status && statusVisuals[status.id]) || abilityVisuals[character];
    return cue(
      messageText(o.name),
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
      contentText(basic.statuses?.[o.status]?.name) ?? o.status,
      `${c.name(o.fighter)} · ${o.stacks ? `${o.stacks} accumuli` : 'Stato rimosso'}`,
      [
        { type: 'ring', node: c.node(o.fighter) },
        ...(visual && o.stacks
          ? [{ type: 'sigil' as const, node: c.node(o.fighter), mark: visual.mark }]
          : []),
        { type: 'text', node: c.node(o.fighter), text: o.stacks ? `×${o.stacks}` : 'Rimosso' },
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
          ? `${contentText(fighterDefinition(f, basic).name)} ${f.id.split('-').at(-1)}`
          : game.players.find((p) => p.id === f.player)!.name
        : (game.players.find((p) => p.id === id)?.name ?? 'Un avversario');
    },
    node: (id) =>
      fighterById(game, id)?.position ??
      mainFighter(game, id)?.position ??
      (previous && (fighterById(previous, id)?.position ?? mainFighter(previous, id)?.position)) ??
      basic.map.nodes[0],
  };
  const events: PresentationEvent[] = [];
  const add = (id: string, data: Cue) => events.push({ ...data, id, revision: game.revision });
  if (previous) {
    if (game.paused !== previous.paused)
      add(
        `connection:${receipt}:${game.paused}`,
        cue(
          game.paused ? 'Arena in pausa' : 'Di nuovo in battaglia',
          game.paused
            ? 'In attesa della riconnessione degli avversari.'
            : 'Tutti gli avversari rimasti sono connessi.',
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
            'Attacco in arrivo',
            `${context.name(attacker)} attacca ${context.name(defender)}`,
            [
              { type: 'ring', node: context.node(defender) },
              { type: 'text', node: context.node(attacker), text: 'Attacco!' },
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
            'Scelta in attesa',
            `${context.name(game.phase.player)} sta scegliendo un’abilità`,
            [{ type: 'ring', node: context.node(game.phase.player) }],
            'gold',
            timing.brief,
          ),
        );
      if (game.phase.type === 'discarding' && previous.phase.type !== 'discarding')
        add(
          `discard:${game.revision}`,
          cue(
            'Fai spazio',
            `${context.name(game.phase.player)} deve scartare fino a sette carte`,
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
            maneuver ? 'Manovra' : 'Carte pescate',
            `${player.name} · ${drawn ? `+${drawn} ${drawn === 1 ? 'carta' : 'carte'}` : 'Scegli il percorso'}`,
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
