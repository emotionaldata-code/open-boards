import { Container, Graphics } from 'pixi.js';
import { portalStep } from '@open-boards/game';
import { basic } from '@open-boards/content';
import { spaces } from '../board/layout';
import type { VisualEffect } from './events';
import type { EffectFrame } from './effects';

export function createTravel(
  effect: Extract<VisualEffect, { type: 'move' }>,
  layer: Container,
  actors: Map<string, Container>,
  color: number,
  reduced: boolean,
): EffectFrame {
  const actor = actors.get(effect.player);
  const path = effect.path;
  const trail = layer.addChild(new Graphics());
  const scale = actor?.scale.x ?? 1;
  return {
    update: (progress) => {
      if (!actor || !path.length) return;
      trail.clear();
      const step = (reduced ? 1 : Math.min(progress, 1)) * (path.length - 1);
      const index = Math.min(Math.floor(step), Math.max(0, path.length - 2));
      const t = path.length > 1 ? step - index : 1;
      const from = spaces[path[index]],
        to = spaces[path[index + 1]] ?? from;
      const portal = portalStep(basic.map, path[index], path[index + 1]);
      if (portal && !reduced) {
        const point = t < 0.5 ? from : to;
        const visibility = Math.abs(t * 2 - 1);
        actor.position.set(point.x, point.y);
        actor.alpha = visibility;
        actor.scale.set(scale * (0.45 + visibility * 0.55));
        for (const p of [from, to]) {
          trail
            .circle(p.x, p.y, 20 + Math.sin(t * Math.PI) * 40)
            .stroke({ color: 0x9bdbcf, width: 5, alpha: Math.sin(t * Math.PI) });
        }
      } else {
        const eased = reduced ? 1 : t * t * (3 - 2 * t);
        actor.position.set(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
        actor.alpha = 1;
        actor.scale.set(scale);
        if (!reduced)
          trail
            .moveTo(from.x, from.y)
            .lineTo(actor.x, actor.y)
            .stroke({ color, width: 6, alpha: 0.65 * (1 - t) });
      }
      actor.zIndex = actor.y;
    },
    destroy: () => {
      if (actor && !actor.destroyed) {
        actor.alpha = 1;
        actor.scale.set(scale);
      }
      if (!trail.destroyed) trail.destroy();
    },
  };
}
