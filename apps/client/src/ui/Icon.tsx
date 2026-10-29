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
  | 'health'
  | 'move'
  | 'cards'
  | 'boost'
  | 'confirm'
  | 'notification';
const paths: Record<SymbolName, string> = {
  attack: 'm5 19 3-3m-3-3 6 6m-3-3 11-11 1-4-4 1L5 13',
  health:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  move: 'm4 17 4-4 4 4 8-10m-6 0h6v6',
  cards: 'M7 7h13v14H7V7ZM4 17H2V2h13v2',
  boost: 'm13 2-9 12h7l-1 8 10-13h-8l1-7Z',
  confirm: 'm5 12 4 4L19 6',
  notification: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
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
