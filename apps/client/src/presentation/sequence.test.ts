import { expect, it } from 'vitest';
import type { PresentationEvent } from '../animation/events';
import { PresentationSequence } from './sequence';

const event = (id: string, review = true): PresentationEvent => ({
  id,
  revision: 1,
  title: id,
  detail: '',
  tone: 'gold',
  duration: 1,
  effects: [],
  sounds: [],
  review: review ? { participants: [], explanation: id } : undefined,
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it('holds the complete ordered sequence for local acknowledgement, including rapid appended batches', async () => {
  const shown: string[] = [];
  const rendered: string[] = [];
  let pending = 0;
  const sequence = new PresentationSequence(
    (event, count) => {
      if (event && shown.at(-1) !== event.id) shown.push(event.id);
      pending = count;
    },
    async (event) => {
      rendered.push(event.id);
    },
  );
  sequence.consume([event('card'), event('ability')]);
  sequence.consume([event('ability'), event('damage'), event('move', false)]);
  await flush();
  expect(shown).toEqual(['card']);
  expect(rendered).toEqual(['card']);
  expect(pending).toBe(3);
  sequence.acknowledge('wrong-event');
  await flush();
  expect(shown).toEqual(['card']);
  sequence.acknowledge('card');
  await flush();
  expect(shown).toEqual(['card', 'ability']);
  sequence.acknowledge('card'); // A stale/double click cannot acknowledge the next review.
  await flush();
  expect(rendered).toEqual(['card', 'ability']);
  sequence.acknowledge('ability');
  await flush();
  sequence.acknowledge('damage');
  await flush();
  expect(rendered).toEqual(['card', 'ability', 'damage', 'move']);
  expect(pending).toBe(0);
});

it('waits for both playback and acknowledgement before rendering the next event', async () => {
  let finish = () => {};
  const rendered: string[] = [];
  const sequence = new PresentationSequence(
    () => {},
    async (event) => {
      rendered.push(event.id);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  );
  sequence.consume([event('combat'), event('after-combat')]);
  await flush();
  sequence.acknowledge('combat');
  await flush();
  expect(rendered).toEqual(['combat']);
  finish();
  await flush();
  expect(rendered).toEqual(['combat', 'after-combat']);
  sequence.reset();
  finish();
});

it('cancels an unread review and queued work on reset without replaying historical events', async () => {
  const shown: string[] = [];
  let current = () => false;
  const sequence = new PresentationSequence(
    (event) => {
      if (event) shown.push(event.id);
    },
    async (_event, active) => {
      current = active;
    },
  );
  sequence.consume([event('old'), event('obsolete')]);
  await flush();
  expect(current()).toBe(true);
  sequence.reset([event('history')]);
  expect(current()).toBe(false);
  sequence.consume([event('history'), event('fresh')]);
  await flush();
  sequence.acknowledge('old');
  await flush();
  expect(shown).toEqual(['old', 'fresh']);
  sequence.acknowledge('fresh');
  await flush();
});
