import { Container, Graphics, Sprite } from 'pixi.js';
import { figureSvg } from '../characters/art';
import { fighterArtwork, rasterAssets } from '../artwork/assets';
import { loadFigureTexture } from '../artwork/textures';

export const playerColors = [0xdcc58d, 0x91d9c7, 0xef9c8f, 0xc1c9ec];
export function createFigure(
  character: string,
  color: number,
  render: () => void = () => {},
  active: () => boolean = () => true,
): Container {
  const figure = new Container();
  const base = new Graphics();
  base.ellipse(0, 4, 36, 15).fill({ color: 0x070e0c, alpha: 0.55 });
  base.ellipse(0, 0, 32, 12).fill(0x26362b).stroke({ color, width: 3 });
  base.scale.set(0.85);
  figure.addChild(base);
  const art = new Graphics();
  art.svg(figureSvg(character, `#${color.toString(16).padStart(6, '0')}`));
  // Match the arena's existing miniature scale while retaining the portrait's crisp vector detail.
  art.scale.set(0.85);
  figure.addChild(art);
  const asset = rasterAssets[fighterArtwork[character]?.token];
  if (asset) {
    void loadFigureTexture(asset.url)
      .then((texture) => {
        if (figure.destroyed || !active()) return;
        const sprite = new Sprite(texture);
        sprite.anchor.set(...(asset.anchor ?? [0.5, 1]));
        sprite.scale.set(asset.scale ?? 0.3);
        figure.addChildAt(sprite, 1);
        art.destroy();
        render();
      })
      .catch(() => {
        // The existing vector figure remains visible on a failed load.
      });
  }
  return figure;
}
