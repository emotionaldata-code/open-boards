import { Container } from 'pixi.js';
import { expect, it } from 'vitest';
import { spaces } from '../board/layout';
import { createTravel } from './travel';

it('fades out at the entrance and reappears at the exit without crossing the map', () => {
  const actor = new Container(),
    layer = new Container();
  const travel = createTravel(
    { type: 'move', player: 'a', path: ['n5', 'n16'] },
    layer,
    new Map([['a', actor]]),
    0xffffff,
    false,
  );
  travel.update(0.25);
  expect({ x: actor.x, y: actor.y }).toEqual({ x: spaces.n5.x, y: spaces.n5.y });
  expect(actor.alpha).toBe(0.5);
  travel.update(0.75);
  expect({ x: actor.x, y: actor.y }).toEqual({ x: spaces.n16.x, y: spaces.n16.y });
  expect(actor.alpha).toBe(0.5);
  travel.destroy();
  expect(actor.alpha).toBe(1);
  expect(actor.scale.x).toBe(1);
  expect(layer.children).toHaveLength(0);
  actor.destroy();
  layer.destroy();
});
it('snaps the complete confirmed route to its destination with reduced motion', () => {
  const actor = new Container(),
    layer = new Container();
  const travel = createTravel(
    { type: 'move', player: 'a', path: ['n0', 'n5', 'n16', 'n17'] },
    layer,
    new Map([['a', actor]]),
    0xffffff,
    true,
  );
  travel.update(0.01);
  expect({ x: actor.x, y: actor.y }).toEqual({ x: spaces.n17.x, y: spaces.n17.y });
  expect(actor.alpha).toBe(1);
  travel.destroy();
  actor.destroy();
  layer.destroy();
});
