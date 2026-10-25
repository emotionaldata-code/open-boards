import type { CardPresentation } from '@open-boards/content';

const path = (d: string, fill: string, stroke?: string, width = 3) =>
  `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"` : ''}/>`;

/** Small, reusable illustration scenes. Recipes are data; drawing remains client-local. */
export function cardSvg({ art, palette: p }: CardPresentation): string {
  const variant = art.variant ?? 0;
  const dark = '#172720';
  const paper = '#f0e4c4';
  const scenes: Record<typeof art.scene, string> = {
    shield:
      path('M111 43 161 29 211 43 204 112 161 153 118 112Z', p.ink, p.accent) +
      path('M125 55 161 45 197 55 191 107 161 134 131 107Z', p.ground) +
      path('M161 54V123 M139 87H183', 'none', p.accent, 6) +
      path('M101 145 223 36 230 40 113 155Z', paper) +
      path('M100 137 121 158', 'none', p.accent, 6),
    blade:
      path('M112 143 181 29 194 19 195 38 128 151Z', p.ink) +
      path('M125 139 185 40', 'none', paper) +
      path('M107 126 143 148 M124 145 108 170', 'none', p.accent, 8) +
      path('M186 128 210 113 240 125 233 158 209 176 189 160Z', p.ground, p.ink),
    bastion:
      path('M91 164V61H110V44H129V61H149V44H169V61H188V44H208V61H229V164Z', p.ink) +
      path('M108 164V90H131V164 M189 164V90H212V164', p.ground) +
      path('M145 164V119Q160 97 176 119V164', dark) +
      path('M91 76H229 M91 166H229', 'none', p.accent, 5),
    lantern:
      path('M137 70Q118 27 161 27Q204 27 184 70', 'none', p.accent, 6) +
      path('M125 74 195 74 189 146 131 146Z', p.ink) +
      path('M137 84H183L178 134H142Z', p.ground) +
      path('M160 127Q141 118 157 96Q162 109 168 99Q186 119 160 127Z', p.accent) +
      path('M119 72H201 M125 151H195 M160 23V12', 'none', p.accent, 7),
    trail:
      path(
        'M74 200Q190 151 164 119Q132 88 194 66Q215 53 203 31L224 31Q243 57 211 77Q166 96 190 115Q233 161 160 200Z',
        p.ink,
      ) +
      path(
        'M83 107 108 73 132 107 M115 87 140 53 165 87 M62 76 86 43 109 76',
        p.ground,
        p.accent,
        2,
      ) +
      path('M237 121V58 M217 71H260L270 83 260 95H217Z', dark, p.accent),
    fire:
      path(
        'M160 170C84 155 90 108 134 76Q127 112 149 116Q140 68 178 25Q166 74 198 90Q229 120 212 144Q197 174 160 170Z',
        p.accent,
      ) +
      path('M161 159Q118 141 154 111Q151 133 174 122Q193 146 161 159Z', paper) +
      path('M88 132 76 115 M225 79 234 63 M113 60 109 46', 'none', p.ink, 4),
    embers:
      path('M74 175 123 149 210 148 254 176Z', dark, p.ink) +
      path('M114 147 156 87 149 118 187 60 180 105 209 92 199 147Z', p.accent) +
      path('M137 147 165 119 157 140 180 124 177 148Z', paper) +
      path('M120 83 128 66 M196 48 203 28 M220 117 227 98 M90 130 96 117', 'none', p.accent, 5),
    ward:
      path(
        'M74 163Q53 77 124 44Q181 12 241 71Q198 43 160 72Q202 56 228 112Q250 163 194 180Q219 145 190 122Q194 164 151 174Q97 185 74 163Z',
        p.accent,
      ) +
      path('M132 89 166 78 195 91 187 129 164 147 140 131Z', p.ink) +
      path('M145 98 164 92 182 100 176 123 164 132 151 122Z', p.ground),
    bolt:
      path('M83 143Q88 42 213 46Q251 84 223 155', 'none', p.accent, 7) +
      path('M83 143 213 46 223 155 M100 134 241 38', 'none', p.ink) +
      path('M226 32 252 29 247 53 M111 125 99 118 94 141 116 140Z', p.ink) +
      path('M127 97 112 85 104 110 M144 83 129 70 121 96', 'none', p.accent, 5),
    map:
      path('M69 65 125 48 183 65 240 47 250 152 191 174 132 155 79 174Z', p.ink) +
      path('M125 48 132 155 M183 65 191 174', 'none', p.ground, 3) +
      path('M100 137 127 108 151 119 180 90 212 102', 'none', p.accent, 6) +
      path('M200 90 223 113 M223 90 200 113', 'none', dark, 5),
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
    <rect width="320" height="200" fill="${p.ground}"/>
    <circle cx="${67 + variant * 28}" cy="48" r="30" fill="${p.ink}" opacity=".15"/>
    ${path('M0 124 43 73 87 112 129 61 172 121 229 59 279 107 320 68V200H0Z', dark)}
    ${path('M0 166 70 137 115 157 186 131 244 158 320 120V200H0Z', p.ink)}
    <g transform="rotate(${(variant - 3) * 2} 160 100)">${scenes[art.scene]}</g>
    ${path('M0 192 60 177 112 190 161 182 228 195 283 173 320 182V200H0Z', dark)}
  </svg>`;
}
