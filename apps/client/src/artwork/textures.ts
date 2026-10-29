import { Assets, type Texture } from 'pixi.js';

const pending = new Map<string, Promise<Texture>>();

/** Pixi owns cached textures; actors never destroy textures shared with other scenes. */
export function loadFigureTexture(url: string): Promise<Texture> {
  let texture = pending.get(url);
  if (!texture) {
    texture = Assets.load<Texture>({
      src: url,
      data: { autoGenerateMipmaps: true, scaleMode: 'linear' },
    }).catch((error: unknown) => {
      pending.delete(url);
      throw error;
    });
    pending.set(url, texture);
  }
  return texture;
}
