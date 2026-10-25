import type { Graphics } from 'pixi.js';

/** Original scenery primitives, in board coordinates; no gameplay or animation state. */
export function tree(g: Graphics, x: number, y: number, size: number) {
  g.ellipse(x + 8, y + 15, 32 * size, 17 * size).fill({ color: 0x1d3025, alpha: 0.6 });
  g.moveTo(x, y + 15)
    .lineTo(x + 3, y - 10)
    .stroke({ color: 0x938366, width: 6 * size });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4,
      r = (i % 3) * 9 * size;
    const px = x + Math.cos(a) * r,
      py = y - 13 + Math.sin(a) * r * 0.7;
    g.ellipse(px, py, (19 - (i % 4)) * size, (15 - (i % 3)) * size).fill(
      [0x3c573b, 0x536941, 0x71814b][i % 3],
    );
    g.moveTo(px - 6 * size, py - 4 * size)
      .lineTo(px + 2 * size, py - 7 * size)
      .stroke({ color: 0x9a9d62, width: 2 * size, alpha: 0.6 });
  }
}

export function cypress(g: Graphics, x: number, y: number) {
  g.ellipse(x + 9, y + 10, 18, 9).fill(0x26372b);
  g.moveTo(x, y + 10)
    .lineTo(x, y - 28)
    .stroke({ color: 0x8b7957, width: 5 });
  g.poly([x, y - 66, x + 14, y - 25, x + 11, y, x - 11, y, x - 14, y - 25]).fill(0x2d4936);
  g.poly([x, y - 66, x + 11, y - 25, x + 7, y - 4, x - 2, y - 10]).fill(0x667b4b);
}

export function pavilion(g: Graphics, x: number, y: number, w: number, h: number) {
  g.poly([x - 8, y + 12, x + w + 9, y + 12, x + w + 20, y + h + 20, x, y + h + 26]).fill(0x29382c);
  g.rect(x, y, w, h).fill(0x8d8c6e);
  g.rect(x + 9, y + h - 13, w - 18, 21).fill(0x5b614e);
  g.poly([x - 9, y + 9, x + w / 2, y - 24, x + w + 9, y + 9, x + w / 2, y + 38])
    .fill(0x677b6c)
    .stroke({ color: 0xa1aa87, width: 3 });
  g.poly([x + w / 2, y - 24, x + w + 9, y + 9, x + w / 2, y + 38]).fill(0x3d5a4f);
  g.moveTo(x + w / 2, y - 24)
    .lineTo(x + w / 2, y + 38)
    .stroke({ color: 0xa6ad89, width: 4 });
  for (let i = 1; i < 4; i++) {
    const dx = (i * w) / 5;
    g.moveTo(x + dx, y + 3 - dx * 0.5)
      .lineTo(x + dx, y + 13 + dx * 0.5)
      .stroke({ color: 0x89997a, width: 2 });
  }
}

export function observatory(g: Graphics, x: number, y: number) {
  g.ellipse(x + 6, y + 15, 85, 63).fill(0x344035);
  g.ellipse(x, y, 78, 58).fill(0x777c65).stroke({ color: 0x9b9c7d, width: 5 });
  g.ellipse(x, y, 60, 44).fill(0x344b40).stroke({ color: 0xbbb18a, width: 5 });
  g.ellipse(x, y, 39, 28).stroke({ color: 0x72816a, width: 2 });
  for (let i = 0; i < 8; i++) {
    if (i === 1 || i === 2) continue;
    const a = (i * Math.PI) / 4,
      px = x + Math.cos(a) * 70,
      py = y + Math.sin(a) * 52;
    g.rect(px - 6, py - 23, 12, 26).fill(0xb0ab86);
    g.ellipse(px, py - 23, 9, 5).fill(0xd0c49a);
  }
  g.moveTo(x - 29, y + 10)
    .lineTo(x + 26, y - 21)
    .stroke({ color: 0xbaa474, width: 5 });
  g.ellipse(x, y - 9, 23, 31).stroke({ color: 0xbba875, width: 3 });
  g.ellipse(x, y - 9, 32, 12).stroke({ color: 0xbba875, width: 3 });
  g.circle(x, y - 9, 8).fill(0xc1b385);
  for (const [dx, dy] of [
    [60, 45],
    [82, 22],
    [44, 59],
  ])
    g.poly([
      x + dx,
      y + dy,
      x + dx + 13,
      y + dy - 4,
      x + dx + 18,
      y + dy + 8,
      x + dx + 3,
      y + dy + 13,
    ]).fill(0x8e9276);
}

export function bridge(g: Graphics, x: number, y: number, angle: number) {
  const point = (dx: number, dy: number) => [
    x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y + dx * Math.sin(angle) + dy * Math.cos(angle),
  ];
  g.poly([...point(-57, -22), ...point(57, -22), ...point(57, 22), ...point(-57, 22)])
    .fill(0x928c6b)
    .stroke({ color: 0x333f32, width: 5 });
  for (let i = -4; i <= 4; i++)
    g.poly([...point(i * 12, -20), ...point(i * 12, 20)], false).stroke({
      color: 0x646d55,
      width: 2,
    });
  for (const side of [-1, 1])
    g.poly([...point(-60, side * 24), ...point(60, side * 24)], false).stroke({
      color: 0xc1b38c,
      width: 7,
    });
}

export function ship(g: Graphics, x: number, y: number) {
  g.ellipse(x + 4, y + 14, 37, 13).fill(0x263c33);
  g.poly([x - 42, y - 7, x + 40, y - 7, x + 25, y + 16, x - 25, y + 16])
    .fill(0x8f7851)
    .stroke({ color: 0xc0a576, width: 3 });
  g.moveTo(x, y + 7)
    .lineTo(x, y - 62)
    .stroke({ color: 0xc0ae83, width: 4 });
  g.poly([x - 4, y - 58, x - 4, y - 5, x - 34, y - 10]).fill(0xc4bd91);
  g.poly([x + 5, y - 52, x + 31, y - 14, x + 5, y - 7]).fill(0x909f7d);
}
