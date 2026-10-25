import { Container, Graphics, Text } from 'pixi.js';
import { basic, zoneStyles } from '@open-boards/content';
import { spaces } from './layout';
import { createScenery } from './scenery';

export function createTerrain(): Container {
  const terrain = createScenery();
  const paths = terrain.addChild(new Graphics());
  for (const [a, b] of basic.map.edges) {
    const from = spaces[a],
      to = spaces[b];
    paths
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ color: 0x17271f, width: 13, cap: 'round' });
    paths
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ color: 0xb0af90, width: 5, cap: 'round' });
  }
  for (const id of basic.map.nodes) {
    const { x, y, label } = spaces[id];
    const zones = basic.map.zones[id];
    const portal = basic.map.portals?.includes(id);
    const g = terrain.addChild(new Graphics());
    g.circle(x, y + 4, 38).fill(0x17251f);
    g.circle(x, y, 35).fill(0x25362f);
    g.circle(x, y, 27).fill({ color: zoneStyles[zones[0]].color, alpha: 0.18 });
    zones.forEach((zone, i) => {
      const start = -Math.PI / 2 + (i * Math.PI * 2) / zones.length;
      const end = start + (Math.PI * 2) / zones.length - 0.06;
      g.moveTo(x + Math.cos(start) * 32, y + Math.sin(start) * 32)
        .arc(x, y, 32, start, end)
        .stroke({ color: zoneStyles[zone].color, width: 7, cap: 'butt' });
    });
    if (portal) {
      g.poly([x, y - 26, x + 12, y - 9, x, y + 6, x - 12, y - 9]).stroke({
        color: 0xeee0b5,
        width: 3,
      });
      g.circle(x, y - 10, 5).fill(0x9bdbcf);
      g.circle(x, y, 43).stroke({ color: 0x9bdbcf, width: 2 });
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        g.moveTo(x + Math.cos(a) * 39, y + Math.sin(a) * 39)
          .lineTo(x + Math.cos(a) * 48, y + Math.sin(a) * 48)
          .stroke({ color: 0xeee0b5, width: 4 });
      }
    }
    const text = new Text({
      text: label,
      style: {
        fontFamily: 'Georgia',
        fontSize: portal ? 16 : 25,
        fill: 0xf0ead1,
        stroke: { color: 0x25362f, width: 3 },
      },
    });
    text.anchor.set(0.5);
    text.position.set(x, portal ? y + 20 : y);
    terrain.addChild(text);
    const colors = new Text({
      text: zones.map((zone) => zoneStyles[zone].symbol).join(' · '),
      style: {
        fontFamily: 'Inter Variable',
        fontSize: 13,
        fill: 0xd5dac3,
        stroke: { color: 0x25362f, width: 3 },
      },
    });
    colors.anchor.set(0.5);
    colors.position.set(x, portal ? y + 58 : y + 49);
    terrain.addChild(colors);
  }
  return terrain;
}
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
