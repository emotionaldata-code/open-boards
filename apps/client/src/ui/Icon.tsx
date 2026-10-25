export type SymbolName =
  | 'attack'
  | 'defense'
  | 'versatile'
  | 'action'
  | 'fullscreen'
  | 'close'
  | 'rotate'
  | 'sound'
  | 'muted'
  | 'zoom-in'
  | 'zoom-out';
const paths: Record<SymbolName, string> = {
  'zoom-in': 'M10 5v10M5 10h10m2 7 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  'zoom-out': 'M5 10h10m2 7 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  attack: 'M5 19 17 7m-9 9-3-3m3 3 3 3M14 4h6v6l-6-6Z',
  defense: 'M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Zm0 4v10',
  versatile: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
  action: 'M12 3v18M3 12h18M6 6l12 12M6 18 18 6',
  fullscreen: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',
  close: 'm6 6 12 12M6 18 18 6',
  rotate: 'M8 3h8v18H8V3ZM3 8l-2 4 3 3m17 1 2-4-3-3',
  sound: 'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  muted: 'M11 4 6 8H3v8h3l5 4V4Zm5 5 6 6m0-6-6 6',
};
export function Icon({ name, className = '' }: { name: SymbolName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
