import { boardLayout, boardSize } from '@open-boards/content';

export interface Point {
  x: number;
  y: number;
}
// Map coordinates are already composed for this camera; rules never use these points.
export const arenaSize = boardSize;
export const spaces = boardLayout;
