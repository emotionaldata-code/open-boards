import { Container, Graphics } from 'pixi.js';
import { spaces } from '../board/layout';
import type { VisualEffect } from './events';
import { timing } from './timing';

export function createAttack(
  effect: Extract<VisualEffect, { type: 'attack' }>,
  layer: Container,
  actors: Map<string, Container>,
  color: number,
  reduced: boolean,
) {
  const g = layer.addChild(new Graphics());
  const art = actors.get(effect.player)?.children[0];
  const a = spaces[effect.from],
    b = spaces[effect.to];
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const dx = Math.cos(angle),
    dy = Math.sin(angle);
  const impact = timing.impact / (effect.duration ?? timing.combat);
  return {
    update(t: number) {
      g.clear();
      const fade = Math.min(1, (1 - t) * 4);
      const travel = Math.max(0, Math.min(1, (t - 0.15) / (impact - 0.15)));
      if (reduced) {
        g.moveTo(b.x - dx * 28, b.y - 55 - dy * 28)
          .lineTo(b.x + dx * 28, b.y - 55 + dy * 28)
          .stroke({ color, width: 6, alpha: fade });
        if (effect.style === 'ranged')
          g.moveTo(b.x + dx * 10 - dy * 14, b.y - 55 + dy * 10 + dx * 14)
            .lineTo(b.x + dx * 28, b.y - 55 + dy * 28)
            .lineTo(b.x + dx * 10 + dy * 14, b.y - 55 + dy * 10 - dx * 14)
            .stroke({ color, width: 5, alpha: fade });
        return;
      }
      if (effect.style === 'ranged') {
        // Draw back, release, then let the arrow settle at the impact point.
        if (art) {
          const recoil = t < 0.15 ? (-t / 0.15) * 8 : -8 * Math.max(0, 1 - travel * 3);
          art.position.set(dx * recoil, dy * recoil);
        }
        if (t < 0.15) return;
        const x = a.x + (b.x - a.x) * travel;
        const y = a.y + (b.y - a.y) * travel - 55 - Math.sin(travel * Math.PI) * 30;
        for (let i = 3; i > 0; i--)
          g.moveTo(x - dx * (22 + i * 18), y - dy * (22 + i * 18))
            .lineTo(x - dx * 22, y - dy * 22)
            .stroke({ color, width: 2 + i, alpha: fade * 0.12 });
        g.moveTo(x - dx * 46, y - dy * 46)
          .lineTo(x, y)
          .stroke({ color: 0xffedd0, width: 4, alpha: fade });
        g.poly([
          x + dx * 15,
          y + dy * 15,
          x - dx * 8 - dy * 8,
          y - dy * 8 + dx * 8,
          x - dx * 8 + dy * 8,
          y - dy * 8 - dx * 8,
        ]).fill({ color, alpha: fade });
      } else {
        // Keep the logical figure anchored; only its artwork lunges and returns.
        const lunge =
          t < impact
            ? Math.sin((travel * Math.PI) / 2)
            : Math.max(0, 1 - (t - impact) / (1 - impact));
        if (art) {
          art.position.set(dx * 42 * lunge, dy * 24 * lunge);
          art.rotation = Math.sign(dx) * 0.13 * lunge;
        }
        if (t < 0.28) return;
        const sweep = Math.min(1, (t - 0.28) / (impact - 0.28));
        const start = angle - 1.8;
        for (let i = 3; i > 0; i--)
          g.moveTo(b.x + Math.cos(start) * (56 + i * 5), b.y - 55 + Math.sin(start) * (56 + i * 5))
            .arc(b.x, b.y - 55, 56 + i * 5, start, start + Math.max(0.01, sweep * 2.7))
            .stroke({
              color: i === 1 ? 0xffedd0 : color,
              width: 3 + i * 2,
              alpha: fade / i,
            });
      }
    },
    destroy() {
      if (art && !art.destroyed) {
        art.position.set(0, 0);
        art.rotation = 0;
      }
      if (!g.destroyed) g.destroy();
    },
  };
}
