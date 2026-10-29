import { Container, Graphics, Text } from 'pixi.js';
import { spaces } from '../board/layout';
import type { VisualEffect } from './events';
import { markSvg } from '../characters/marks';
import { createAttack } from './combat';
import { createTravel } from './travel';
import { createSpriteEffect } from './sprites';

export const effectColors = { gold: 0xf1ce8a, mint: 0x99e6d1, ember: 0xffae8c };
export interface EffectFrame {
  update: (progress: number) => void;
  destroy: () => void;
}
export function createEffect(
  effect: VisualEffect,
  layer: Container,
  actors: Map<string, Container>,
  color: number,
  reduced: boolean,
  duration = 1400,
): EffectFrame {
  if (effect.type === 'sprite') {
    if (reduced) return { update: () => {}, destroy: () => {} };
    return createSpriteEffect(effect.clip, effect.node, layer, duration);
  }
  if (effect.type === 'attack') return createAttack(effect, layer, actors, color, reduced);
  if (effect.type === 'sigil') {
    const point = spaces[effect.node];
    const g = layer.addChild(new Graphics().svg(markSvg(effect.mark)));
    g.tint = color;
    return {
      update: (t) => {
        g.position.set(point.x, point.y - 90 - (reduced ? 0 : t * 30));
        g.scale.set(reduced ? 1 : Math.min(1.3, 0.5 + t * 4));
        g.alpha = Math.min(1, (1 - t) * 4);
      },
      destroy: () => {
        if (!g.destroyed) g.destroy();
      },
    };
  }
  if (effect.type === 'move') return createTravel(effect, layer, actors, color, reduced);
  if (effect.type === 'text') {
    const point = spaces[effect.node];
    const text = new Text({
      text: effect.text,
      style: {
        fontFamily: 'Georgia',
        fontWeight: 'bold',
        fontSize: 42,
        fill: color,
        stroke: { color: 0x102219, width: 5 },
      },
    });
    text.anchor.set(0.5);
    layer.addChild(text);
    return {
      update: (t) => {
        text.position.set(point.x, point.y - 115 - (reduced ? 0 : t * 55));
        text.alpha = t < 0.75 ? 1 : (1 - t) * 4;
      },
      destroy: () => {
        if (!text.destroyed) text.destroy();
      },
    };
  }
  const g = new Graphics();
  layer.addChild(g);
  const sprite =
    !reduced && (effect.type === 'burst' || effect.type === 'shield' || effect.type === 'ring')
      ? createSpriteEffect(
          effect.type === 'burst' ? 'impact' : effect.type === 'shield' ? 'parry' : 'select',
          effect.node,
          layer,
          duration,
        )
      : undefined;
  return {
    update: (t) => {
      sprite?.update(t);
      g.clear();
      const fade = Math.min(1, (1 - t) * 3);
      const point = spaces[effect.node];
      const radius = reduced ? 58 : 25 + t * 85;
      if (effect.type === 'ring') {
        g.ellipse(point.x, point.y, radius, radius * 0.43).stroke({
          color,
          width: 4,
          alpha: fade,
        });
        if (!reduced)
          g.ellipse(point.x, point.y, radius * 0.7, radius * 0.3).stroke({
            color,
            width: 2,
            alpha: fade * 0.5,
          });
      } else if (effect.type === 'burst') {
        for (let i = 0; i < 12; i++) {
          const angle = (i * Math.PI) / 6;
          const distance = reduced ? 24 : 20 + t * 95;
          const x = point.x + Math.cos(angle) * distance,
            y = point.y - 42 + Math.sin(angle) * distance * 0.65;
          g.moveTo(x, y)
            .lineTo(x + Math.cos(angle) * 12, y + Math.sin(angle) * 12)
            .stroke({ color, width: 4, alpha: fade });
        }
      } else if (effect.type === 'shield') {
        const size = reduced ? 1 : Math.min(1, t * 6);
        g.position.set(point.x, point.y - 58);
        g.scale.set(size);
        g.poly([-36, -36, 0, -49, 36, -36, 30, 4, 0, 35, -30, 4])
          .fill({ color: 0x17271f, alpha: fade * 0.85 })
          .stroke({ color: 0x99e6d1, width: 5, alpha: fade });
        g.moveTo(0, -25)
          .lineTo(0, 13)
          .moveTo(-17, -7)
          .lineTo(17, -7)
          .stroke({ color: 0xffedd0, width: 4, alpha: fade });
      } else if (effect.type === 'cards') {
        for (let i = -1; i <= 1; i++) {
          const spread = reduced ? 1 : Math.sin((Math.min(1, t * 2) * Math.PI) / 2);
          const x = point.x + i * 26 * spread,
            y = point.y - 70 - Math.abs(i) * 9;
          g.roundRect(x - 15, y - 22, 30, 44, 3)
            .fill({ color: 0x17271f, alpha: fade })
            .stroke({ color, width: 3, alpha: fade });
          g.poly([x, y - 10, x + 7, y, x, y + 10, x - 7, y]).fill({ color, alpha: fade });
        }
      } else {
        const unhandled: never = effect;
        throw new Error(`Unknown visual effect: ${JSON.stringify(unhandled)}`);
      }
    },
    destroy: () => {
      sprite?.destroy();
      if (!g.destroyed) g.destroy();
    },
  };
}
