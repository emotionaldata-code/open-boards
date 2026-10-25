import { Container, Graphics } from 'pixi.js';
import { figureSvg } from '../characters/art';

export const playerColors = [0xdcc58d, 0x91d9c7, 0xef9c8f, 0xc1c9ec];
export function createFigure(character: string, color: number): Container {
  const figure = new Container();
  const art = new Graphics();
  art.ellipse(0, 4, 36, 15).fill({ color: 0x070e0c, alpha: 0.55 });
  art.ellipse(0, 0, 32, 12).fill(0x26362b).stroke({ color, width: 3 });
  art.svg(figureSvg(character, `#${color.toString(16).padStart(6, '0')}`));
  // Match the arena's existing miniature scale while retaining the portrait's crisp vector detail.
  art.scale.set(0.85);
  figure.addChild(art);
  return figure;
}
