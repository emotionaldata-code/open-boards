import { Container, Graphics, Sprite } from 'pixi.js';
import { fighterArtwork, rasterAssets } from '../artwork/assets';
import { loadFigureTexture } from '../artwork/textures';

export const playerColors = [0xdcc58d, 0x91d9c7, 0xef9c8f, 0xc1c9ec];
const figureScale = 0.85;

/** Board coordinates for the token artwork and owner base. */
export function figureBounds(character: string) {
  let left = -36 * figureScale;
  let right = 36 * figureScale;
  let top = -15 * figureScale;
  let bottom = 32;
  const asset = rasterAssets[fighterArtwork[character]?.token];
  if (asset) {
    const [anchorX, anchorY] = asset.anchor ?? [0.5, 1];
    const width = asset.width * (asset.scale ?? 0.3);
    const height = asset.height * (asset.scale ?? 0.3);
    left = Math.min(left, -width * anchorX);
    right = Math.max(right, width * (1 - anchorX));
    top = Math.min(top, -height * anchorY);
    bottom = Math.max(bottom, height * (1 - anchorY));
  }
  return { left, top, width: right - left, height: bottom - top };
}

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
  base.scale.set(figureScale);
  figure.addChild(base);
  const asset = rasterAssets[fighterArtwork[character]?.token];
  if (asset) {
    void loadFigureTexture(asset.url)
      .then((texture) => {
        if (figure.destroyed || !active()) return;
        const sprite = new Sprite(texture);
        sprite.anchor.set(...(asset.anchor ?? [0.5, 1]));
        sprite.scale.set(asset.scale ?? 0.3);
        figure.addChild(sprite);
        render();
      })
      .catch(() => {
        // Keep the owner base visible if the artwork is unavailable.
      });
  }
  return figure;
}
