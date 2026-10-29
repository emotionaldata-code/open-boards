import type { Agent } from './observation';

/** Small deterministic PRNG; separate instances keep policy and game randomness independent. */
export function seededRandom(seed = 1): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createRandomAgent(seed = 1): Agent {
  const random = seededRandom(seed);
  return {
    decide(observation, signal) {
      signal?.throwIfAborted();
      const { commands, selection } = observation.legal;
      if (selection) {
        const count = selection.min + Math.floor(random() * (selection.max - selection.min + 1));
        const options = shuffled(selection.options, random).slice(0, count);
        return selection.type === 'choose'
          ? { type: 'choose', choice: selection.id!, options }
          : { type: 'discard', cards: options };
      }
      if (!commands.length) throw new Error('No decision is available for this observer.');
      return structuredClone(commands[Math.floor(random() * commands.length)]);
    },
  };
}

export type PolicyId = 'random';
export function isPolicyId(value: string): value is PolicyId {
  return value === 'random';
}

/** Registry boundary for explicitly approved, bounded built-in policies. */
export function createAgent(policy: PolicyId, seed = 1): Agent {
  switch (policy) {
    case 'random':
      return createRandomAgent(seed);
    default:
      throw new Error(`Unknown agent policy: ${String(policy)}`);
  }
}
