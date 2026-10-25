# JSON bundle authoring

Use `packages/content/src/characters/medusa.json` as a multi-ally example and `the-genie.json` for a solo example. Read the actual files and their tests. The authoring bundle is **not** a raw `CharacterDefinition`: write `cards` with counts instead of `deck`. `compileRoster` builds the engine deck/card records and removes `palette`, card `art`, `flavor` and `count` from engine rules. The constraints below describe existing vocabulary; verify current types and validation, and extend them as directed in the skill when an import requires additional capabilities.

## Minimal complete shape

This valid 5-card teaching example shows the shape, not a balanced deck or a template for reducing imported quantities:

```json
{
  "id": "trail-captain",
  "name": "Trail Captain",
  "hp": 14,
  "movement": 2,
  "attackType": "ranged",
  "ally": {
    "id": "trail-hound",
    "name": "Trail Hound",
    "count": 2,
    "hp": 2,
    "attackType": "melee"
  },
  "palette": {
    "ground": "#293b32",
    "ink": "#e2e6cb",
    "accent": "#a4c79a"
  },
  "cards": [
    {
      "id": "trail-captain-shot",
      "name": "Clear Shot",
      "count": 1,
      "usableBy": "MAIN",
      "category": "attack",
      "value": 4,
      "boost": 1,
      "description": "Attack with value 4.",
      "art": { "scene": "bolt", "variant": 0 },
      "flavor": "Wait for the opening."
    },
    {
      "id": "trail-captain-fangs",
      "name": "Fangs",
      "count": 1,
      "usableBy": "ALLY",
      "category": "attack",
      "value": 3,
      "boost": 2,
      "description": "Attack with value 3.",
      "art": { "scene": "blade", "variant": 1 },
      "flavor": "Follow the scent."
    },
    {
      "id": "trail-captain-stand",
      "name": "Stand Together",
      "count": 1,
      "usableBy": "BOTH",
      "category": "versatile",
      "value": 3,
      "boost": 2,
      "description": "Attack or defend with value 3.",
      "art": { "scene": "ward", "variant": 2 },
      "flavor": "Hold your ground."
    },
    {
      "id": "trail-captain-guard",
      "name": "Guard",
      "count": 1,
      "usableBy": "BOTH",
      "category": "defense",
      "value": 3,
      "boost": 2,
      "description": "Defend with value 3.",
      "art": { "scene": "shield", "variant": 3 },
      "flavor": "Protect the pack."
    },
    {
      "id": "trail-captain-recover",
      "name": "Recover",
      "count": 1,
      "usableBy": "BOTH",
      "category": "action",
      "value": 0,
      "boost": 2,
      "description": "Heal this fighter 2 health, then draw 1 card.",
      "effects": [
        { "type": "heal", "amount": 2 },
        { "type": "draw", "count": 1 }
      ],
      "art": { "scene": "lantern", "variant": 4 },
      "flavor": "Catch your breath."
    }
  ]
}
```

## Passives and timed card rules

The same ability structure belongs in the hero's `abilities`, the ally's `abilities`, or a combat card's `abilities`. Choose the source that actually owns the rule. For a hero/ally passive that draws after dealing attack damage once per seat-turn:

```json
{
  "id": "successful-hunt",
  "name": "Successful Hunt",
  "description": "After dealing attack damage, draw 1 card. Once per turn.",
  "trigger": "after-attack",
  "when": {
    "type": "all",
    "conditions": [
      { "type": "role", "role": "attacker" },
      { "type": "compare", "left": { "event": "amount" }, "op": "gt", "right": 0 }
    ]
  },
  "limit": { "scope": "turn", "count": 1 },
  "effects": [{ "type": "draw", "count": 1 }]
}
```

Every ally copy gets its own usage limit, counters and statuses. Omitting `limit` does not imply once per turn. A turn limit resets each seat's turn, not each full round; optional offers consume a use even when skipped. Main passives concern the main fighter by default. To observe a different friendly/enemy fighter, declare `scope: "any"` and precise ownership conditions.

Action cards use ordered direct `effects`. Combat cards use timed `abilities`, never direct `effects`. `before-combat` permits fixed `modify` of attack/defense. Combat cards support only the timings listed in `bundle.ts`; a card's `after-damage` or `after-move` hook does not become a continuing passive. Do not replace “if you won” with unconditional effects or add `optional` to mandatory effects.

Attack BOOST uses `{ "type": "boost-attack" }` in `before-attack` or `before-combat` abilities, including nested choices and conditions. It offers hand cards plus Skip automatically, and only the attacking fighter can pay. Maneuver BOOST is available universally. Payment-card effects are suppressed while character/status discard reactions still resolve.

`self` means the exact acting fighter for a played card. Moving/healing it affects that piece. Drawing/discarding affects its owner; exhaustion damages the main fighter. `opponent` means the other combat/event participant, not all opponents. A movement effect already offers destinations plus Stay; do not add a second Use/Skip prompt unless the source needs that distinction.

## Constraints that matter during import

- IDs match `^[a-z][a-z0-9-]{0,63}$`. Character/card IDs must not collide with existing content; use a character prefix on imported card and ally IDs. Ability IDs are unique within each source.
- Hero/ally HP and ally count are 1–100; character movement is 0–100. Only one repeated ally definition is supported. Omit `ally` when absent, rather than writing `count: 0`. Allies have no independent deck or base movement.
- Every card requires `usableBy`, a category, and an explicit `boost` integer (0–100); quantities are 1–100, and total deck size is 5–100. `MAIN`, `ALLY`, `BOTH` apply to attacks, defenses and actions. Discarding remains unrestricted.
- Declare counters on every fighter type that may use a counter effect; BOTH cards may require matching counter declarations on main and ally. Use `counters: { "focus": { "initial": 0, "max": 3 } }`. Do not treat counters as an arbitrary scripting escape hatch.
- Referenced statuses must already exist in `packages/content/src/statuses.ts`, or be added there as reusable definitions and visual cues. A bundle has no top-level `statuses` field.
- Effects use fixed integer quantities (0–100); modifiers are −100–100. `draw.count` also accepts a Value, evaluated at execution and clamped to 0–100. Other effect amounts remain fixed integers. Combat setters can read a committed card’s printed value/BOOST; see `docs/engine.md` for replacement and lock semantics. At most 32 effects/abilities per list. Full bounds are in `validation.ts`.
- Names/descriptions do not execute rules. Unknown JSON keys fail strict engine validation after compilation; do not add `source`, `portrait`, per-card range or custom JavaScript to a bundle and assume they work.

Use a test that compiles the bundle with the real roster and validates only the engine fields; TypeScript casts alone are not validation:

```ts
const { characters, cards } = compileRoster(bundles);
validateDefinitions({ ...basic, characters, cards });
```

Do not spread the entire compiler result into Definitions: it also contains `cardPresentation`, which strict rules validation rejects. Then exercise behavior with fixed decks and command sequences. Review `packages/content/src/characters/characters.test.ts` and `packages/game/src/fighters.test.ts` for patterns and legal setup.

Reusable combat suppression uses `combat-reveal` → `suppress-card-effects`, with defender-first immediate priority. It suppresses the exact opposing card’s pending effects, including lifecycle hooks and nested continuations, while preserving printed values and fighter/status abilities.

For multiple pieces, use `{ "type": "for-each-fighter", "relation": "friendly", "role": "ally", "effects": [{ "type": "move", "target": "chosen", "distance": 3 }] }`. Omit `role` to include main and allies. The owner chooses order from a snapshot; each eligible ID resolves once. Ordinary movement may add `throughEnemies: true`, retaining empty endpoints. Then `{ "type": "revive-ally", "optional": true, "anchor": "main" }` can restore an existing defeated owned ally in the owning main fighter’s current zone. `main` works even when an ally plays the card. See `medusa.json` for the complete composition and `docs/engine.md` for reset/usage semantics.

Sherlock Holmes demonstrates static `cardEffectProtection`, `faceUpDefense`, `predict-value`/`prediction-matches`, final `ignore-combat-value`, `inspect-hand`, `named-value-discard`, `swap` with `onSuccess`, and anchored adjacent `teleport`. These operations are typed and strict-schema validated; see `docs/engine.md` for timing, privacy and ownership. Hand inspection uses private card options and public reveals use explicit viewer-safe receipts. Never derive prediction/named-value options from hidden cards.

Achilles adds `discard: { random: true, count }`, `recover-card`, optional `actions.target`, adjacent/zone group filtering, the sole `ally` reference and the `defeated` condition. Use `bonus-attack: { name, value }` only at `after-combat` for an effectless second attack; do not author a fictitious extra deck card. Use `swap` with `onSuccess: [{ type: 'replace-defender', target: 'ally' }]` at `combat-reveal` to transfer the existing defense after a successful exchange. See `docs/engine.md` for timing, ownership and supported bounds.
