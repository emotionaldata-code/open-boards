import { Container, Graphics, Text } from 'pixi.js';
import { bridge, cypress, observatory, pavilion, ship, tree } from './landmarks';

/** Static cartography sits below routes and spaces, with no knowledge of legal moves. */
export function createScenery(): Container {
  const layer = new Container();
  const g = layer.addChild(new Graphics());
  const coast = [
    45, 55, 320, 35, 640, 55, 800, 80, 1080, 45, 1370, 40, 1480, 105, 1660, 45, 1870, 35, 1875, 330,
    1810, 395, 1840, 700, 1700, 755, 1390, 770, 1130, 765, 830, 760, 630, 725, 510, 765, 200, 775,
    40, 715, 60, 540, 95, 400, 50, 260,
  ];
  // Layered rock faces give the long island a cut-paper silhouette.
  g.poly(coast.map((n, i) => n + (i % 2 ? 12 : 0))).fill(0x162620);
  g.poly(coast).fill(0x344438).stroke({ color: 0x7b8063, width: 5, join: 'round' });
  g.poly([60, 65, 630, 65, 755, 220, 570, 255, 305, 200, 90, 300]).fill(0x455339);
  g.poly([115, 300, 480, 245, 675, 365, 600, 650, 260, 680, 85, 510]).fill(0x4b4938);
  g.poly([650, 265, 1010, 225, 1370, 295, 1430, 650, 1030, 700, 675, 675, 625]).fill(0x414c40);
  g.poly([1510, 135, 1750, 55, 1860, 60, 1860, 330, 1630, 380, 1500, 320]).fill(0x555343);
  g.poly([1490, 395, 1805, 405, 1815, 690, 1510, 755, 1330, 675]).fill(0x41463d);
  // Garden retaining walls leave a single stairway into the upper terrace.
  for (const y of [230, 242]) {
    g.moveTo(65, y)
      .lineTo(565, y)
      .lineTo(625, y - 42)
      .stroke({ color: y === 230 ? 0x8c8d68 : 0x26392a, width: 7 });
  }
  for (let i = 0; i < 6; i++) {
    const x = 622 + i * 12,
      y = 164 + i * 12;
    g.moveTo(x - 16, y + 16)
      .lineTo(x + 16, y - 16)
      .stroke({ color: 0xa4a081, width: 4 });
  }
  const canal = [1470, 55, 1425, 165, 1450, 280, 1490, 375, 1535, 455, 1530, 590, 1590, 770];
  for (const [width, color] of [
    [83, 0x23382f],
    [64, 0x638070],
    [52, 0x294c48],
    [28, 0x365e55],
  ])
    g.poly(canal, false).stroke({ color, width, cap: 'round', join: 'round' });
  for (let i = 0; i < 22; i++) {
    const y = 60 + i * 32;
    const x = y < 300 ? 1450 : y < 480 ? 1490 + (y - 375) * 0.5 : 1540;
    g.moveTo(x - 12, y)
      .lineTo(x + 7, y - 3)
      .stroke({ color: 0x8eafa0, width: 2, alpha: 0.35 });
  }
  bridge(g, 1440, 350, -0.59);
  bridge(g, 1530, 555, -0.5);
  // Broken paving stays quieter than the actual routes.
  for (let i = 0; i < 150; i++) {
    const x = 90 + ((i * 137) % 1720),
      y = 280 + ((i * 83) % 405);
    if (x > 1410 && x < 1595) continue;
    g.poly([x, y, x + 13, y - 3, x + 22, y + 3, x + 5, y + 7]).fill({
      color: i % 3 ? 0x78806a : 0x222f28,
      alpha: 0.16,
    });
  }
  pavilion(g, 310, 390, 74, 53);
  pavilion(g, 1170, 350, 64, 50);
  pavilion(g, 1070, 175, 54, 45);
  observatory(g, 1700, 280);
  // Courtyard mosaic, fountain, and surviving aqueduct piers.
  g.poly([860, 315, 920, 350, 860, 390, 800, 350]).fill(0x68735b);
  g.poly([860, 325, 905, 350, 860, 380, 815, 350]).stroke({ color: 0xb3aa7c, width: 3 });
  g.ellipse(860, 350, 25, 16).fill(0x2b3c32).stroke({ color: 0x95977a, width: 5 });
  g.ellipse(860, 347, 15, 8).fill(0x64867a);
  for (const x of [1130, 1195, 1260, 1325]) {
    g.poly([x, 540, x + 20, 528, x + 20, 565, x, 580]).fill(0x26382d);
    g.rect(x - 7, 520, 23, 39).fill(0x7c8268);
    g.rect(x - 11, 515, 31, 10).fill(0xb1aa83);
  }
  g.moveTo(1119, 515).lineTo(1345, 515).stroke({ color: 0x929478, width: 11 });
  // Timber jetty and moored skiff beside the single-entry dock branch.
  g.poly([90, 690, 200, 690, 213, 725, 100, 725]).fill(0x283e36);
  for (let i = 0; i < 10; i++)
    g.moveTo(108 + i * 9, 695)
      .lineTo(112 + i * 9, 722)
      .stroke({ color: i % 2 ? 0x93815a : 0x746345, width: 7 });
  ship(g, 135, 570);
  for (const x of [115, 185]) {
    g.circle(x, 705, 5).fill(0xc4b28a);
    g.rect(x + 10, 676, 16, 13).fill(0x9c8b62);
  }
  for (const [x, y, size] of [
    [75, 165, 1],
    [285, 175, 0.8],
    [465, 180, 1],
    [550, 65, 0.7],
    [780, 100, 1],
    [870, 175, 0.85],
    [1175, 100, 0.8],
    [1370, 140, 0.7],
    [1605, 70, 0.8],
    [1800, 400, 1],
    [1775, 550, 1],
    [1630, 675, 0.8],
    [985, 600, 0.9],
    [680, 650, 1],
    [360, 655, 0.7],
    [80, 385, 0.7],
    [385, 530, 0.7],
  ])
    tree(g, x, y, size);
  for (const [x, y] of [
    [85, 280],
    [390, 220],
    [510, 200],
    [610, 365],
    [660, 400],
    [1180, 450],
    [1740, 365],
  ])
    cypress(g, x, y);
  for (const [text, x, y] of [
    ['Hanging gardens', 430, 45],
    ['West gate', 355, 448],
    ['Drowned observatory', 1695, 220],
    ['The old aqueduct', 1225, 490],
    ['Smugglers’ landing', 365, 690],
  ] as const) {
    const label = new Text({
      text,
      style: {
        fontFamily: 'Georgia',
        fontSize: 18,
        fontStyle: 'italic',
        fill: 0xc3c3a0,
        stroke: { color: 0x344438, width: 3 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    layer.addChild(label);
  }
  return layer;
}
