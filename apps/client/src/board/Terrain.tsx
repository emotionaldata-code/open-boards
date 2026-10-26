import { basic, zoneStyles } from '@open-boards/content';
import { arenaSize, spaces } from './layout';

const color = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

/** Browser-native paths avoid triangulating the static map on mobile GPUs. */
export function Terrain({
  highlights = [],
  selected,
}: {
  highlights?: string[];
  selected?: string;
}) {
  return (
    <svg
      className="map-terrain"
      viewBox={`0 0 ${arenaSize.width} ${arenaSize.height}`}
      aria-hidden="true"
    >
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
          <g key={id} data-space={id} transform={`translate(${x} ${y})`}>
            <title>
              {`Space ${label} · ${zones.map((zone) => zoneStyles[zone].name).join(', ')}${portal ? ' · Portal (passage arrows): one movement point to another unoccupied portal' : ''}`}
            </title>
            <circle r="45" fill="#13221b" />
            <circle r="32" fill="#25362f" />
            {zones.map((zone, i) => (
              <circle
                key={zone}
                className="zone-ring"
                r="38"
                fill="none"
                stroke={color(zoneStyles[zone].color)}
                strokeWidth="12"
                pathLength="1"
                strokeDasharray={zones.length > 1 ? `${1 / zones.length - 0.024} 1` : undefined}
                transform={`rotate(${-90 + (i * 360) / zones.length + (zones.length > 1 ? 4.32 : 0)})`}
              />
            ))}
            {highlights.includes(id) && (
              <circle
                className="movement-ring"
                r="50"
                fill="none"
                stroke="#ffe1a1"
                strokeWidth="4"
              />
            )}
            {selected === id && (
              <circle
                className="selection-ring"
                r="57"
                fill="none"
                stroke="#ffb3a1"
                strokeWidth="4"
              />
            )}
            {portal && (
              <g className="portal-mark" transform="translate(0 81)">
                <rect
                  x="-28"
                  y="-17"
                  width="56"
                  height="34"
                  rx="5"
                  fill="#f5f3eb"
                  stroke="#13221b"
                  strokeWidth="3"
                />
                <path
                  d="M-5-11H7V11H-5 M-21-5H0 M-7-11 0-5-7 1 M21 6H0 M7 0 0 6 7 12"
                  fill="none"
                  stroke="#13221b"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}
            <text
              y="10"
              textAnchor="middle"
              fill="#f0ead1"
              fontFamily="Georgia, serif"
              fontSize="29"
            >
              {label}
            </text>
            <text y={portal ? 121 : 80} textAnchor="middle" fill="#d5dac3" fontSize="17">
              {zones.map((zone) => zoneStyles[zone].symbol).join(' · ')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
