import { Application, Container, Text } from 'pixi.js';
import type { GameView } from '@open-boards/protocol';
import type { PresentationEvent } from '../animation/events';
import { playPresentation } from '../animation/playback';
import { sound } from '../audio/player';
import { createFigure, playerColors } from './figures';
import { spaces } from './layout';

export class ArenaScene {
  private actors = new Map<string, Container>();
  private people = new Container({ sortableChildren: true });
  private effects = new Container();
  private seen = new Set<string>();
  private moving = new Map<string, number>();
  private resetId: number | undefined;
  private disposed = false;
  constructor(
    app: Application,
    private render: () => void,
  ) {
    app.stage.addChild(this.people, this.effects);
  }
  update(game: GameView | undefined, events: PresentationEvent[], reset: number) {
    const resetting = this.resetId !== reset;
    if (resetting) {
      this.people.removeChildren().forEach((actor) => actor.destroy({ children: true }));
      this.actors.clear();
      this.seen.clear();
      this.moving.clear();
      this.effects.removeChildren().forEach((c) => c.destroy());
      this.resetId = reset;
    }
    const players = game
      ? game.fighters
          .filter((f) => f.position !== null)
          .map((f) => ({
            ...f,
            name:
              f.role === 'ally'
                ? f.id.split('-').at(-1)!
                : game.players.find((p) => p.id === f.player)!.name,
            artwork: f.role === 'ally' ? f.definition : f.character,
            color: playerColors[game.players.findIndex((p) => p.id === f.player)],
          }))
      : [
          {
            id: 'preview-a',
            name: 'Medusa',
            artwork: 'medusa',
            position: 'n0',
            defeated: false,
            color: playerColors[0],
          },
          {
            id: 'preview-b',
            name: 'Medusa',
            artwork: 'medusa',
            position: 'n13',
            defeated: false,
            color: playerColors[1],
          },
        ];
    const incoming = events.filter((event) => !this.seen.has(event.id));
    for (const event of incoming) this.seen.add(event.id);
    // The app retains a bounded event window; keep matching deduplication here.
    for (const id of this.seen) if (!events.some((event) => event.id === id)) this.seen.delete(id);
    // Keep moving figures at their presented position until their confirmed path plays.
    if (!resetting)
      for (const event of incoming) {
        for (const effect of event.effects)
          if (effect.type === 'move')
            this.moving.set(effect.player, (this.moving.get(effect.player) ?? 0) + 1);
      }
    for (const [id, actor] of this.actors)
      if (!players.some((p) => p.id === id)) actor.visible = false;
    players.forEach((player) => {
      let actor = this.actors.get(player.id);
      if (!actor) {
        actor = createFigure(player.artwork, player.color, this.render, () => !this.disposed);
        const label = new Text({
          text:
            'role' in player && player.role === 'ally'
              ? player.name
              : player.name.slice(0, 1).toUpperCase(),
          style: {
            fontFamily: 'Georgia',
            fontSize: 18,
            fill: player.color,
            stroke: { color: 0x101c16, width: 4 },
          },
        });
        label.anchor.set(0.5);
        label.position.set(0, 23);
        actor.addChild(label);
        this.actors.set(player.id, actor);
        this.people.addChild(actor);
      }
      actor.visible = !player.defeated;
      const point = spaces[player.position!];
      if (!this.moving.has(player.id)) actor.position.set(point.x, point.y);
      actor.zIndex = actor.y;
    });
    this.render();
  }
  async present(event: PresentationEvent, active: () => boolean): Promise<void> {
    const reset = this.resetId;
    const current = () => active() && !this.disposed && this.resetId === reset;
    await playPresentation(event, this.effects, this.actors, current, this.render, sound.play);
    if (!current()) return;
    for (const effect of event.effects)
      if (effect.type === 'move') {
        const remaining = (this.moving.get(effect.player) ?? 1) - 1;
        if (remaining) this.moving.set(effect.player, remaining);
        else this.moving.delete(effect.player);
      }
  }
  destroy() {
    this.disposed = true;
  }
}
