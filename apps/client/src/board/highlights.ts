import type { Graphics } from 'pixi.js';
import { spaces } from './layout';

export function paintHighlights(g: Graphics, highlights: string[], selected?: string) {
  g.clear();
  for (const id of highlights) {
    const { x, y } = spaces[id];
    g.circle(x, y, 39).fill({ color: 0xffe9ad, alpha: 0.13 }).stroke({ color: 0xffe1a1, width: 4 });
  }
  if (selected && spaces[selected]) {
    const { x, y } = spaces[selected];
    g.circle(x, y, 45).stroke({ color: 0xffb3a1, width: 4 });
  }
}
