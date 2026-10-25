import { z } from 'zod';
import type { Definitions } from '../types';
import { hooks, type Ability, type Condition, type Effect } from './vocabulary';

const id = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/)
  .refine((s) => !['constructor', 'prototype', '__proto__'].includes(s));
const count = z.number().int().min(0).max(100);
const signed = z.number().int().min(-100).max(100);
const ref = z.enum([
  'self',
  'source',
  'actor',
  'target',
  'attacker',
  'defender',
  'opponent',
  'chosen',
  'main',
]);
const expression = z.union([
  z.strictObject({ stat: z.enum(['hp', 'hand', 'deck', 'movement']), of: ref.optional() }),
  z.strictObject({ stat: z.literal('counter'), name: id, of: ref.optional() }),
  z.strictObject({ stat: z.literal('actions') }),
  z.strictObject({ event: z.enum(['amount', 'attack', 'defense', 'distance']) }),
  z.strictObject({
    card: z.enum(['played', 'attack', 'defense', 'opposing']),
    field: z.enum(['value', 'boost']),
  }),
]);
const value = z.union([signed, expression]);
const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ type: z.enum(['all', 'any']), conditions: z.array(conditionSchema).max(32) }),
    z.strictObject({ type: z.literal('not'), condition: conditionSchema }),
    z.strictObject({
      type: z.literal('compare'),
      left: value,
      op: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte']),
      right: value,
    }),
    z.strictObject({
      type: z.literal('relation'),
      relation: z.enum(['same', 'friendly', 'enemy', 'adjacent', 'zone', 'attack-range']),
      a: ref,
      b: ref,
    }),
    z.strictObject({
      type: z.literal('role'),
      role: z.enum(['actor', 'target', 'attacker', 'defender']),
    }),
    z.strictObject({
      type: z.literal('card-category'),
      card: z.enum(['played', 'attack', 'defense']),
      category: z.enum(['attack', 'defense', 'versatile', 'action']),
    }),
    z.strictObject({
      type: z.literal('combat-result'),
      result: z.enum(['won', 'lost', 'blocked']),
    }),
    z.strictObject({ type: z.literal('changed-position'), target: ref.optional() }),
    z.strictObject({ type: z.literal('has-status'), player: ref.optional(), status: id }),
  ]),
);
const effects = (): z.ZodType<Effect[]> => z.array(effectSchema).max(32);
export const effectSchema: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('draw'),
      target: ref.optional(),
      count: z.union([count, expression]),
    }),
    z.strictObject({ type: z.enum(['damage', 'heal']), target: ref.optional(), amount: count }),
    z.strictObject({
      type: z.literal('move'),
      throughEnemies: z.boolean().optional(),
      target: ref.optional(),
      distance: count,
    }),
    z.strictObject({ type: z.enum(['push', 'pull']), target: ref.optional(), distance: count }),
    z.strictObject({
      type: z.literal('teleport'),
      target: ref.optional(),
      zone: z.enum(['any', 'shared']).optional(),
      optional: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal('discard'),
      target: ref.optional(),
      chooser: ref.optional(),
      count,
    }),
    z.strictObject({ type: z.literal('actions'), amount: signed }),
    z.strictObject({ type: z.literal('counter'), name: id, amount: signed }),
    z.strictObject({
      type: z.literal('status'),
      target: ref.optional(),
      status: id,
      stacks: count.min(1).optional(),
      turns: count.min(1).optional(),
    }),
    z.strictObject({ type: z.literal('remove-status'), target: ref.optional(), status: id }),
    z.strictObject({
      type: z.literal('modify'),
      field: z.enum(['amount', 'attack', 'defense']),
      amount: signed,
    }),
    z.strictObject({
      type: z.literal('set-combat-value'),
      mode: z.enum(['printed', 'total']).optional(),
      target: ref.optional(),
      value,
    }),
    z.strictObject({ type: z.literal('cancel') }),
    z.strictObject({
      type: z.literal('boost-attack'),
      grant: id.optional(),
      cancelWithCard: z.boolean().optional(),
    }),
    z.strictObject({ type: z.literal('set-health'), target: ref.optional(), value: count.min(1) }),
    z.strictObject({ type: z.literal('prevent-damage'), target: ref.optional() }),
    z.strictObject({
      type: z.literal('search-card'),
      card: id,
      zones: z
        .array(z.enum(['deck', 'discard']))
        .min(1)
        .max(2),
    }),
    z.strictObject({ type: z.literal('inspect-deck'), count, take: count }),
    z.strictObject({
      type: z.literal('area-damage'),
      range: z.enum(['zone', 'any']),
      adjacent: z.boolean().optional(),
      relation: z.enum(['friendly', 'enemy', 'any']),
      amount: count,
      onDefeat: effects().optional(),
    }),
    z.strictObject({ type: z.literal('suppress-card-effects') }),
    z.strictObject({
      type: z.literal('revive-ally'),
      optional: z.boolean().optional(),
      anchor: ref.optional(),
    }),
    z.strictObject({
      type: z.literal('for-each-fighter'),
      relation: z.enum(['friendly', 'enemy', 'any']),
      role: z.enum(['main', 'ally']).optional(),
      effects: effects(),
    }),
    z.strictObject({
      type: z.literal('if'),
      condition: conditionSchema,
      then: effects(),
      else: effects().optional(),
    }),
    z.strictObject({
      type: z.literal('choose-fighter'),
      relation: z.enum(['friendly', 'enemy', 'any']),
      range: z.enum(['any', 'adjacent', 'zone', 'attack-range']).optional(),
      effects: effects(),
    }),
    z.strictObject({
      type: z.literal('choose-player'),
      relation: z.enum(['opponent', 'any', 'self']),
      range: z.enum(['any', 'adjacent', 'zone', 'attack-range']).optional(),
      effects: effects(),
    }),
    z.strictObject({
      type: z.literal('choose-option'),
      prompt: z.string().min(1).max(200),
      options: z
        .array(z.strictObject({ id, label: z.string().min(1).max(100), effects: effects() }))
        .min(1)
        .max(16),
    }),
  ]),
);
const abilitySchema: z.ZodType<Ability> = z.strictObject({
  id,
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  trigger: z.enum(hooks),
  scope: z.enum(['self', 'any']).optional(),
  when: conditionSchema.optional(),
  optional: z.boolean().optional(),
  limit: z.strictObject({ scope: z.enum(['turn', 'match']), count: count.min(1) }).optional(),
  effects: effects(),
});
const abilities = z
  .array(abilitySchema)
  .max(32)
  .refine(
    (a) => new Set(a.map((x) => x.id)).size === a.length,
    'Ability IDs must be unique per source',
  );
const fighterFields = {
  name: z.string().min(1).max(100),
  hp: count.min(1),
  attackType: z.enum(['melee', 'ranged']),
  abilities: abilities.optional(),
  counters: z.record(id, z.strictObject({ initial: count, max: count })).optional(),
};
const definitionSchema = z.strictObject({
  characters: z.record(
    id,
    z.strictObject({
      id,
      ...fighterFields,
      movement: count,
      ally: z.strictObject({ id, ...fighterFields, count: count.min(1) }).optional(),
      deck: z
        .array(z.strictObject({ card: id, count: count.min(1) }))
        .min(1)
        .max(100),
      abilities: abilities.optional(),
      counters: z.record(id, z.strictObject({ initial: count, max: count })).optional(),
    }),
  ),
  cards: z.record(
    id,
    z.strictObject({
      id,
      name: z.string().min(1).max(100),
      usableBy: z.enum(['MAIN', 'ALLY', 'BOTH']),
      category: z.enum(['attack', 'defense', 'versatile', 'action']),
      value: count,
      boost: count,
      description: z.string().max(500).optional(),
      effects: effects().optional(),
      abilities: abilities.optional(),
    }),
  ),
  statuses: z
    .record(
      id,
      z.strictObject({
        id,
        name: z.string().min(1).max(100),
        maxStacks: count.min(1),
        modifiers: z
          .strictObject({
            attack: signed.optional(),
            defense: signed.optional(),
            movement: signed.optional(),
          })
          .optional(),
        combatValue: z.strictObject({ value: count, locked: z.boolean().optional() }).optional(),
        abilities: abilities.optional(),
      }),
    )
    .optional(),
  map: z.strictObject({
    id,
    name: z.string().min(1).max(100),
    nodes: z.array(id).min(4).max(100),
    zones: z.record(id, z.array(id).min(1).max(16)),
    edges: z.array(z.tuple([id, id])).max(1000),
    portals: z.array(id).max(100).optional(),
    spawns: z.strictObject({ 2: z.array(id).length(2), 4: z.array(id).length(4) }),
  }),
});
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`Invalid definitions: ${message}`);
}
/** Bounds recursion before schema parsing; rejects callbacks, cycles and non-JSON values. */
function json(value: unknown, depth = 0, seen = new Set<object>()): void {
  assert(depth <= 20, 'nesting exceeds 20 levels');
  if (value === undefined) return;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return;
  assert(
    typeof value === 'object' &&
      (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype),
    'only JSON data is supported',
  );
  assert(!seen.has(value), 'cyclic content');
  seen.add(value);
  assert(Object.keys(value).length <= 2000, 'definition is too large');
  for (const child of Object.values(value)) json(child, depth + 1, seen);
  seen.delete(value);
}
export function validateDefinitions(input: unknown): asserts input is Definitions {
  json(input);
  const defs = definitionSchema.parse(input);
  const known = (record: object | undefined, key: string) => !!record && Object.hasOwn(record, key);
  const inspect = (node: unknown, trigger?: string): void => {
    if (!node || typeof node !== 'object') return;
    if ('trigger' in node && typeof node.trigger === 'string') trigger = node.trigger;
    if ('status' in node && typeof node.status === 'string')
      assert(known(defs.statuses, node.status), `unknown status ${node.status}`);
    if (
      'name' in node &&
      typeof node.name === 'string' &&
      (('type' in node && node.type === 'counter') || ('stat' in node && node.stat === 'counter'))
    )
      assert(
        Object.values(defs.characters).some(
          (c) => known(c.counters, String(node.name)) || known(c.ally?.counters, String(node.name)),
        ),
        `unknown counter ${node.name}`,
      );
    if ('type' in node && node.type === 'modify' && 'field' in node) {
      const allowed =
        node.field === 'attack' || node.field === 'defense'
          ? ['before-combat']
          : ['before-draw', 'before-damage', 'before-heal'];
      assert(
        trigger && allowed.includes(trigger),
        `modify ${String(node.field)} needs ${allowed.join('/')}`,
      );
    }
    if ('type' in node && node.type === 'search-card' && 'card' in node)
      assert(known(defs.cards, String(node.card)), `unknown search card ${String(node.card)}`);
    if ('type' in node && node.type === 'prevent-damage')
      assert(trigger === 'before-combat', `${node.type} needs before-combat`);
    if ('type' in node && node.type === 'set-combat-value')
      assert(trigger === 'before-combat', 'set-combat-value needs before-combat');
    if ('type' in node && node.type === 'boost-attack')
      assert(
        trigger === 'before-attack' || trigger === 'before-combat',
        'boost-attack needs before-attack/before-combat',
      );
    if ('type' in node && node.type === 'suppress-card-effects')
      assert(!!trigger, 'suppress-card-effects needs an ability hook');
    if ('type' in node && node.type === 'cancel')
      assert(trigger?.startsWith('before-'), 'cancel needs a before hook');
    if ('options' in node && Array.isArray(node.options))
      assert(
        new Set(node.options.map((x) => x.id)).size === node.options.length,
        'duplicate option IDs',
      );
    for (const child of Object.values(node)) inspect(child, trigger);
  };
  for (const [key, c] of Object.entries(defs.characters)) {
    assert(key === c.id, 'character key must equal its id');
    for (const entry of c.deck) assert(known(defs.cards, entry.card), `unknown card ${entry.card}`);
    const size = c.deck.reduce((sum, e) => sum + e.count, 0);
    assert(size >= 5 && size <= 100, 'decks need 5–100 cards');
    if (c.ally) assert(c.ally.id !== c.id, 'ally and character IDs must differ');
    for (const counter of [
      ...Object.values(c.counters ?? {}),
      ...Object.values(c.ally?.counters ?? {}),
    ])
      assert(counter.initial <= counter.max, 'counter initial exceeds max');
    inspect(c);
    const checkCounters = (node: unknown, counters = c.counters): void => {
      if (!node || typeof node !== 'object') return;
      if ('type' in node && node.type === 'counter' && 'name' in node)
        assert(
          known(counters, String(node.name)),
          `character ${c.id} needs counter ${String(node.name)}`,
        );
      for (const child of Object.values(node)) checkCounters(child, counters);
    };
    checkCounters(c.abilities);
    if (c.ally) checkCounters(c.ally.abilities, c.ally.counters);
    for (const entry of c.deck) {
      const card = defs.cards[entry.card];
      if (card.usableBy !== 'ALLY') checkCounters(card);
      if (c.ally && card.usableBy !== 'MAIN') checkCounters(card, c.ally.counters);
    }
  }
  for (const record of [defs.cards, defs.statuses ?? {}])
    for (const [key, d] of Object.entries(record)) {
      assert(key === d.id, 'definition key must equal its id');
      if ('category' in d)
        assert(
          d.category === 'action' || !d.effects?.length,
          'combat cards use abilities, not direct effects',
        );
      inspect(d);
    }
  const nodes = new Set(defs.map.nodes);
  assert(nodes.size === defs.map.nodes.length, 'duplicate graph nodes');
  for (const n of nodes) assert(known(defs.map.zones, n), `missing zones for ${n}`);
  for (const n of Object.keys(defs.map.zones)) assert(nodes.has(n), `unknown zone node ${n}`);
  for (const [a, b] of defs.map.edges)
    assert(nodes.has(a) && nodes.has(b) && a !== b, 'invalid graph edge');
  const portals = defs.map.portals ?? [];
  assert(
    new Set(portals).size === portals.length && portals.every((n) => nodes.has(n)),
    'invalid portals',
  );
  for (const spawns of Object.values(defs.map.spawns))
    assert(
      new Set(spawns).size === spawns.length && spawns.every((n) => nodes.has(n)),
      'invalid spawns',
    );
}
/** Server composition freezes a match's content so authoring cannot alter an active game. */
export function prepareDefinitions(input: unknown): Definitions {
  validateDefinitions(input);
  const copy: Definitions = structuredClone(input);
  function freeze(value: object): void {
    for (const v of Object.values(value)) if (v && typeof v === 'object') freeze(v);
    Object.freeze(value);
  }
  freeze(copy);
  return copy;
}
