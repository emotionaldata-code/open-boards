/** Static vector artwork; independent of the camera, rules, and animated fighters. */
export function Scenery() {
  return (
    <g strokeLinejoin="round">
      <path
        d="M45 55 320 35 640 55 800 80 1080 45 1370 40 1480 105 1660 45 1870 35 1875 330 1810 395 1840 700 1700 755 1390 770 1130 765 830 760 630 725 510 765 200 775 40 715 60 540 95 400 50 260Z"
        fill="#344438"
        stroke="#7b8063"
        strokeWidth="5"
      />
      <path d="M60 65H630L755 220 570 255 305 200 90 300Z" fill="#455339" />
      <path d="M115 300 480 245 675 365 600 650 260 680 85 510Z" fill="#4b4938" />
      <path d="M650 265 1010 225 1370 295 1430 650 1030 700 675 675 625 400Z" fill="#414c40" />
      <path d="M1510 135 1750 55 1860 60V330L1630 380 1500 320Z" fill="#555343" />
      <path d="M1490 395 1805 405 1815 690 1510 755 1330 675Z" fill="#41463d" />
      <path d="M65 236H565L625 194" fill="none" stroke="#858668" strokeWidth="8" />
      <path
        d="M1470 55 1425 165 1450 280 1490 375 1535 455 1530 590 1590 770"
        fill="none"
        stroke="#638070"
        strokeWidth="64"
      />
      <path
        d="M1470 55 1425 165 1450 280 1490 375 1535 455 1530 590 1590 770"
        fill="none"
        stroke="#294c48"
        strokeWidth="48"
      />
      {[
        [1440, 350],
        [1530, 555],
      ].map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y}) rotate(-30)`}>
          <rect
            x="-58"
            y="-24"
            width="116"
            height="48"
            fill="#928c6b"
            stroke="#c1b38c"
            strokeWidth="4"
          />
          {[-36, -18, 0, 18, 36].map((dx) => (
            <path key={dx} d={`M${dx} -20V20`} stroke="#646d55" strokeWidth="3" />
          ))}
        </g>
      ))}
      {[
        [310, 390],
        [1170, 350],
        [1070, 175],
      ].map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <path d="M0 0H64V48H0Z" fill="#8d8c6e" />
          <path d="M-9 9 32-24 73 9 32 38Z" fill="#677b6c" stroke="#a1aa87" strokeWidth="3" />
          <path d="M32-24 73 9 32 38Z" fill="#3d5a4f" />
        </g>
      ))}
      <ellipse cx="1700" cy="280" rx="78" ry="58" fill="#777c65" stroke="#9b9c7d" strokeWidth="5" />
      <ellipse cx="1700" cy="280" rx="55" ry="39" fill="#344b40" stroke="#bbb18a" strokeWidth="5" />
      <path d="M1670 290 1726 259M1700 249V311" stroke="#bba875" strokeWidth="5" />
      {[
        [75, 165],
        [285, 175],
        [465, 180],
        [780, 100],
        [870, 175],
        [1370, 140],
        [1800, 400],
        [1775, 550],
        [985, 600],
        [680, 650],
        [360, 655],
        [385, 530],
      ].map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <path d="M0 16V-16" stroke="#938366" strokeWidth="6" />
          <ellipse cy="-12" rx="28" ry="20" fill="#536941" />
          <ellipse cx="-9" cy="-19" rx="20" ry="15" fill="#71814b" />
        </g>
      ))}
    </g>
  );
}
