# Source inventory and translation

## UmDb source

The public deck page may return only a JavaScript shell to text browsers. Its current read-only data endpoint is `https://unmatched.cards/api/db/decks/<slug>`. The bundled fetch helper verifies a JSON response and captures provenance. This endpoint is not a promised stable contract; inspect a changed response before using it.

The helper stores `{ sourceUrl, apiUrl, retrievedAt, deck }`. Keep raw snapshots in temporary working storage; write a concise, maintained import note in `docs/characters/<id>.md`. Record the source version/edition when known, corrections from source notes, asset origins and any agreed rule differences. Do not inject provenance fields into the strict rules JSON.

| UmDb field                                              | Open Boards meaning                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `heroes[]`                                              | Main fighter name, `hp`, `attack_type`; currently exactly one hero with quantity 1 is representable   |
| `movement`                                              | Character `movement`, shared as base movement by allies                                               |
| `special`                                               | Hero passive ability rules, after checking their exact semantics                                      |
| `sidekicks[]`                                           | Optional `ally`; zero entries means omit it; one type maps `quantity` → `count`                       |
| `cards[].slug`                                          | Stable card ID, prefixed with the character ID to avoid cross-deck collisions                         |
| `cards[].title`, `quantity`                             | Card name, `count`; sum quantities to get the source deck size                                        |
| `cards[].type`                                          | `attack`, `defense`, `versatile`; `scheme` maps to `action`                                           |
| `cards[].value`                                         | Combat value; action cards use `value: 0`; copy the separate source BOOST into `boost`                |
| `cards[].characterName`                                 | Explicit name matching: main → `MAIN`, ally → `ALLY`, `ANY` → `BOTH`                                  |
| `basicText`, `immediateText`, `duringText`, `afterText` | Ordered rule clauses to translate and verify individually, never descriptions alone                   |
| `boost`                                                 | Required `boost` integer (0–100); movement boosting and ability-granted attack boosting are supported |
| `image`                                                 | Source artwork reference for inspection/provenance, not a local `art.image` path                      |
| `card_notes`, `deck_card_notes`, deck `notes`           | Clarifications affecting translation; check edition and named-fighter differences                     |

Compare source names explicitly: labels can be shortened (e.g. `ARTHUR` versus `King Arthur`). Do not infer unknown labels as BOTH. `ANY` on a solo deck may be BOTH; absence of allies does not change its intended meaning. One repeated ally type is supported, including a single durable sidekick. Multiple hero pieces, heterogeneous allies or individual-ally card restrictions cannot be faithfully represented by the current model.

## Compatibility audit

Treat the mappings and gaps below as examples, not a frozen capability list. Check the current engine and tests before declaring a rule unsupported. Implement missing reusable capabilities according to `SKILL.md`; a compatibility gap alone does not require approval or justify a permanently blocked import.

For every ability/card, record a compact mapping: source rule, trigger/condition/effects, acting/receiving fighter, supported or gap. Check base game differences as well as printed text: this project has two actions, a five-card initial hand, hand limit seven, exhaustion and no automatic reshuffle. Maneuver BOOST is supported after drawing/reactions and before any fighter moves. Do not describe an imported deck as fully Unmatched-compatible merely because its cards compile.

Useful supported mappings:

- Drawing, fixed healing/damage, fixed movement, push/pull, teleport and action changes have existing effects.
- “Your fighter” on a card means the fighter playing it (`self`), including allies. “Your hand/deck” belongs to its player. Named-other-fighter effects need an exact supported reference/selection; `self` cannot mean a different piece.
- Conditional combat bonuses use `before-combat` with role/relationship/result/stat conditions as appropriate. Reactions after winning or dealing combat damage are separate checks.
- “Choose a fighter” uses `choose-fighter`; “choose an opponent/player” uses `choose-player`. Selection effects bind `chosen`; choosing an owner resolves physical effects to their main fighter.
- Default `discard` lets the affected player choose; `chooser: 'self'` lets the effect owner inspect and choose exact opposing card instances. Random discard uses `random: true`.

Use `{ type: 'boost-attack' }` at `before-attack` for a private pre-defense commitment or `before-combat` for an immediate public payment. The effect already offers Skip, so it needs no extra optional prompt. Only the attacking fighter can pay, once per combat; payment-card effects are ignored but character/status discard reactions resolve. Copy printed BOOST values exactly, including schemes and cards restricted to defeated allies.

Gaps to watch for: defense/other forms of BOOST, summons, teams and alternate victory, multiple ally types, and value arithmetic beyond the typed expressions. Current capabilities already support combat-value replacement/ignoring, deck search/inspection/recovery, turn-start position history and board-space selection through placement/area operations. Use typed Value expressions for hand size, counters and fighter counts; arithmetic beyond those expressions still needs a reusable extension. `cancel` cancels a before-event, not all effects on an opponent's card. Ordinary `move` may opt into `throughEnemies: true`; occupied endpoints remain illegal. `for-each-fighter` snapshots a filtered group and lets the owner choose its order, binding each piece as `chosen`. `revive-ally` restores an existing defeated owned ally with placement anchored to `main` by default. `suppress-card-effects` marks the exact opposing combat card and supports Feint at defender-first `combat-reveal` timing. It preserves printed values, fighter/status abilities and effects already resolved.

Do not map source timing words mechanically. “Immediately” generally means after reveal, but the engine's combat hooks have specific ordering and card lifetimes. `after-combat` includes both roles; “after attacking” requires attack context. Card abilities do not observe nested damage/movement/draw events. Read `docs/engine.md` and inspect runtime behavior when ordering matters.

## Historical King Arthur compatibility example

The source retrieved on 2026-10-25 has one 18-HP melee King Arthur, movement 2, one 7-HP ranged Merlin, and 30 cards across 16 designs. The initial audit identified the following capabilities to check or implement. These are historical findings, not claims about current support:

| Mechanic                              | Why it needs additional capability                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Arthur's special / Noble Sacrifice    | Basic attack BOOST payment and private commitment are supported; verify source-specific cancellation interactions |
| Feint                                 | Supported `combat-reveal` → `suppress-card-effects`; `cancel` has separate before-event semantics                 |
| The Lady of the Lake                  | Named-card search across deck/discard and conditional shuffling                                                   |
| Prophecy                              | Private top-deck inspection, selection and reordering                                                             |
| Momentous Shift                       | Remembering a fighter's position at the start of the turn                                                         |
| Restless Spirits / Command the Storms | Space selection and applying effects across multiple exact fighters                                               |

This is a gap illustration, not an exhaustive audit of the remaining cards. Re-fetch and audit all cards and clarifications when actually importing it. Preserve 30 copies/16 designs rather than reducing the deck to fit another character's quantities. Check current deck-size validation and update roster tests deliberately for the source inventory.

Current information/placement capabilities: `inspect-hand` privately shows a hand (or explicitly reveals it with `public: true`); `discard` with `chooser: 'self'` lets the effect owner inspect/select opposing cards. `named-value-discard` supports matching combat-value discards, BOOST damage to the owning hero, and a public reveal on a miss. `predict-value` at `before-defense`, `prediction-matches`, `faceUpDefense`, and `ignore-combat-value` preserve hidden attacks and prediction timing. `cardEffectProtection` protects listed card tags from opposing cancellation. `teleport` supports an adjacent `anchor`; `swap` exchanges two pieces atomically and can run `onSuccess` effects. See `docs/engine.md` and Sherlock Holmes for complete examples.

## Achilles capabilities

Random discard now uses `discard` with `random: true` (no chooser), consuming the private serialized seed and normal discard hooks. `recover-card` privately returns a prior discarded instance, excluding unfinished combat commitments. `actions.target` can grant the active opponent an action. Groups accept `range: 'adjacent' | 'zone'`.

For a single durable sidekick, `ally` resolves the owner's sole ally even when defeated; `defeated` tests that exact reference. It is undefined for repeated allies: use a group/choice there. `bonus-attack` at `after-combat` schedules an effectless named/value second combat after all first-combat effects and passives. It follows the same defender after movement or replacement, requires living combatants, preserves source BOOST, and spends no additional card/action. Original attack effects/lifecycle do not repeat. `replace-defender` at `combat-reveal` changes to a living owned fighter, retains the defense commitment and rebinds subsequent combat. Compose with `swap.onSuccess` when an exchange of spaces is required. See Achilles's JSON and tests; source rules requiring effects on the bonus attack still need an extension.

Dracula demonstrates reusable computed effects: `Value.fighters` counts living placed fighters by ownership/role and range from an exact `anchor`; damage/heal/modify accept Value expressions. `damage.onDamage` supplies a positive resolved receipt (event amount), and `area-damage` supports source-adjacent groups with one aggregate `onDamage` continuation. `discard.upTo` permits zero through all available cards; `combatBonus` adds one per actual discard or its BOOST during combat. `replace-attack` returns a normal commitment, privately inspects the whole hand, then offers only cards legal for the exact attacker, preserving separate BOOSTs and replacing queued card effects. `teleport.includeOrigin` explicitly permits placement in the target’s own space. Explicit `teleport.allowDefeatedAnchor` supports placement at a defeated opponent’s retained final space. See `docs/engine.md` for timing, privacy and the existing effectless-bonus convention.
