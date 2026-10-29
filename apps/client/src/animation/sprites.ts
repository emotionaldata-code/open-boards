import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { loadFigureTexture } from '../artwork/textures';
import { spaces } from '../board/layout';
import type { EffectFrame } from './effects';

const atlas = { url: '/effects/tabletop-vfx.webp', columns: 4, rows: 4 } as const;
const clips = {
  impact: { row: 0, size: 170, lift: 48, duration: 600 },
  heal: { row: 1, size: 180, lift: 60, duration: 700 },
  select: { row: 2, size: 150, lift: 0, duration: 600 },
  parry: { row: 3, size: 170, lift: 48, duration: 500 },
} as const;
export type SpriteClip = keyof typeof clips;
let pending: Promise<Record<SpriteClip, Texture[]>> | undefined;

export function preloadEffects() {
  return (pending ??= loadFigureTexture(atlas.url)
    .then((texture) => {
      const width = texture.width / atlas.columns;
      const height = texture.height / atlas.rows;
      const frames = (row: number) =>
        Array.from(
          { length: atlas.columns },
          (_, column) =>
            new Texture({
              source: texture.source,
              frame: new Rectangle(column * width, row * height, width, height),
            }),
        );
      return {
        impact: frames(clips.impact.row),
        heal: frames(clips.heal.row),
        select: frames(clips.select.row),
        parry: frames(clips.parry.row),
      };
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    }));
}

/** Uses the existing presentation clock; never adds a ticker or owns shared atlas textures. */
export function createSpriteEffect(
  clip: SpriteClip,
  node: string,
  layer: Container,
  duration = 600,
): EffectFrame {
  const config = clips[clip];
  const point = spaces[node];
  let sprite: Sprite | undefined;
  let textures: Texture[] | undefined;
  let progress = 0;
  let disposed = false;
  const update = (t: number) => {
    progress = t;
    t = Math.min(1, (t * duration) / config.duration);
    if (!sprite || !textures) return;
    sprite.texture = textures[Math.min(textures.length - 1, Math.floor(t * textures.length))];
    sprite.alpha = Math.min(1, (1 - t) * 5);
  };
  void preloadEffects()
    .then((frames) => {
      if (disposed || layer.destroyed) return;
      textures = frames[clip];
      sprite = layer.addChild(new Sprite(textures[0]));
      sprite.anchor.set(0.5);
      sprite.position.set(point.x, point.y - config.lift);
      sprite.width = sprite.height = config.size;
      if (clip === 'select') sprite.scale.y *= 0.45;
      update(progress);
    })
    .catch(() => {
      /* Procedural effects remain available when the atlas fails to load. */
    });
  return {
    update,
    destroy: () => {
      disposed = true;
      if (sprite && !sprite.destroyed) sprite.destroy();
    },
  };
}
