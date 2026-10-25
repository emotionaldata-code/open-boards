import { basic, zoneStyles } from '@open-boards/content';
import { arenaSize, spaces } from './layout';
import { Scenery } from './Scenery';

const color = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

/** Browser-native paths avoid triangulating the static map on mobile GPUs. */
export function Terrain() {
  return (
    <svg
      className="map-terrain"
      viewBox={`0 0 ${arenaSize.width} ${arenaSize.height}`}
      aria-hidden="true"
    >
      <Scenery />
      <g fill="none" strokeLinecap="round">
        {[
          [13, '#17271f'],
          [5, '#b0af90'],
        ].map(([width, stroke]) => (
          <g key={width} stroke={String(stroke)} strokeWidth={width}>
            {basic.map.edges.map(([a, b]) => (
              <path
                key={`${a}-${b}`}
                d={`M${spaces[a].x} ${spaces[a].y}L${spaces[b].x} ${spaces[b].y}`}
              />
            ))}
          </g>
        ))}
      </g>
      {basic.map.nodes.map((id) => {
        const { x, y, label } = spaces[id];
        const zones = basic.map.zones[id];
        const portal = basic.map.portals?.includes(id);
        return (
          <g key={id} transform={`translate(${x} ${y})`}>
            <circle r="35" fill="#25362f" />
            {zones.map((zone, i) => (
              <circle
                key={zone}
                r="32"
                fill="none"
                stroke={color(zoneStyles[zone].color)}
                strokeWidth="7"
                pathLength="1"
                strokeDasharray={`${1 / zones.length - 0.01} 1`}
                transform={`rotate(${-90 + (i * 360) / zones.length})`}
              />
            ))}
            {portal && (
              <g fill="none" stroke="#9bdbcf" strokeWidth="2">
                <circle r="43" />
                <path d="M0-26 12-9 0 6-12-9Z" stroke="#eee0b5" strokeWidth="3" />
              </g>
            )}
            <text
              y={portal ? 25 : 10}
              textAnchor="middle"
              fill="#f0ead1"
              fontFamily="Georgia, serif"
              fontSize={portal ? 20 : 29}
            >
              {label}
            </text>
            <text y={portal ? 63 : 54} textAnchor="middle" fill="#d5dac3" fontSize="17">
              {zones.map((zone) => zoneStyles[zone].symbol).join(' · ')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
