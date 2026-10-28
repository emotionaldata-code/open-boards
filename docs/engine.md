# Character authoring

Characters, cards and statuses are **typed JSON-compatible data**. Supported mechanics compose without changing engine or networking behavior. A complete new character also needs roster registration and client presentation entries; a JSON file alone is not automatically discovered. There are no callbacks, scripts or character-name branches in the rules runtime. [The character guide](characters.md) covers the complete character JSON bundles, unique decks and artwork authoring. For imports from deck URLs, use the repository-local [import-character skill](../.agents/skills/import-character/SKILL.md).

## Players, fighters and commands

A player owns the turn, shared action budget, hand, deck and discard. `Player` has no health, position, counters or statuses. Those fields live only in `GameState.fighters`. Each fighter has a stable instance `id`, owning `player`, character/definition IDs, `main | ally` role, independent HP, position (`null` until deployed), `defeated`, counters and statuses. Defeated pieces retain their last location for animation but never occupy a space or act. Forfeit clears owned positions. Authentication, private audiences, turn ownership and victory continue to use player IDs.

`FighterDefinition` contains `name`, `hp`, `attackType`, optional `abilities` and `counters`. `CharacterDefinition` adds `id`, `movement`, `deck`, and optional `ally: { id, count, ...fighterFields }`. Omit `ally` for zero allies. This milestone supports one repeated ally type, including revival of existing allies, without summons or teams. `fighterById`, `mainFighter`, `fighterDefinition`, `ownedFighters` and `cardEligible` are shared engine/client helpers.

Every card requires an explicit `boost` integer from 0–100; the engine never derives it from the category or combat value. Every card requires `usableBy: "MAIN" | "ALLY" | "BOTH"`. The tag applies to attacks, defenses and actions. Discarding is unrestricted. MAIN means the main fighter; ALLY means any living ally copy; BOTH means either. Decks store those restrictions explicitly.

Commands identify exact pieces:

- `{ type: 'place-ally', fighter, position }`
- `{ type: 'maneuver' }`, `{ type: 'boost-maneuver', card }`, `{ type: 'move', fighter, path }`, `{ type: 'finish-maneuver' }`
- `{ type: 'attack', fighter, card, target }` (enemy fighter target)
- `{ type: 'play-action', fighter, card }`
- `{ type: 'defend', card }` (owner responds for the fixed attacked fighter; `null` declines)

Each turn requires two actions, plus any actions granted by effects. There is no public `end-turn` command: the turn settles automatically after the action budget is spent and pending resolutions finish. Card effects may still request `end-turn`. Finish Maneuver completes movement for that action and preserves remaining actions.

Every missing card in an ordinary draw queues two exhaustion damage per living owned fighter, including allies, using that fighter as its own source. Partial draws deal damage only for the shortfall; drawing the last available card is safe. Damage uses the ordinary reactions, off-board exemption, defeat and elimination rules. Discards never reshuffle automatically.

There are no legacy command adapters. Physical outcomes, combat participants and animations identify fighters. Played-card outcomes also carry the owning player. Snapshot projections expose every fighter and pending Maneuver, while retaining hand, choice and committed-card privacy.

## Deployment and Maneuver

Main fighters start at the existing seat spawns. Allies deploy before turn-start hooks, in seat order, on distinct empty spaces sharing at least one zone with their main fighter’s spawn. `placing-allies` names the current owning player. Bipartite matching verifies that all remaining allies can still fit, including intersecting starting zones; impossible rosters and placements are rejected atomically. Placement order among a seat’s allies is free. The first normal turn starts after the final deployment.

Maneuver spends one action and draws one card for the owner. Every living owned fighter may move once or Stay, in any order, using character movement plus that piece’s status modifiers and the shared Maneuver boost. The exported `maneuverMovement(state, fighter, defs)` helper computes the range for both server validation and client highlights; effect-driven moves retain their own distance. Friendly pieces allow traversal, enemy pieces block it, and every occupied endpoint is illegal. Portals connect movement only; push/pull distance and steps still use physical graph edges. Empty `path` is Stay and runs movement hooks.

`GameState.maneuver` holds `player`, ordered `remaining` fighter IDs, `finishing`, `boost` (initially 0), and `boostable` (initially true) separately from the current phase. Nested private ability choices and reconnect snapshots preserve this progress. Movement reactions finish before Maneuver resumes. Finish Maneuver resolves all remaining fighters as Stay in declaration order through normal hooks; it can itself pause for a reaction. The action completes when no fighters remain.

After the draw and all its reactions, `boost-maneuver` may discard one hand card before the first fighter moves. Any card is eligible, including cards restricted to defeated allies. Boosting, moving (including Stay), or finishing closes the opportunity. A boost spends no extra action and draws no extra card. The payment enters discard publicly and its character/status discard reactions finish before `maneuver-boosted`. That hook reaches each living owned fighter once by default; `actor`/`source` identify the main fighter and `{ event: 'amount' }` reads the bonus. Nested choices suspend and resume this ordering. Ordinary Maneuvers open no additional prompt.

## Fighter ability ownership and defeat

Passives, counters, statuses and usage keys belong to individual fighters. Default physical-event scope concerns that exact piece. Card effects bind to the acting fighter: healing/moving self affects that piece, while draw/discard/actions affect its owner. Turn/draw/discard events are delivered once to each applicable living fighter; actor/source references on these player events identify the main fighter. Explicit `scope: 'any'` plus `friendly`/`enemy` relations can observe other pieces. `attack-range` measures spatial reach, including for friendly choices; attacks additionally require an enemy owner. Status duration expires at the owning player’s turn ending for every living piece.

Ally defeat removes only that piece. Main defeat eliminates its player and removes surviving allies without firing their death abilities. Natural death reactions resolve before victory settlement and can produce mutual defeat. A defeated ally can still finish its committed after-combat card effects and its death reaction for its living owner, but cannot heal or move itself. Its fighter/status passives stay disabled except for its own death reaction. Forfeits remove all owned pieces and bypass death reactions. Exhaustion always damages the main fighter, including draws caused by an ally.

## Add a character and deck

Copy a bundle in `packages/content/src/characters/`, change its IDs, and import it into `characters.ts`. A bundle contains the character’s stats, passive `abilities`, `palette`, and `cards`. Every card carries its own `count`; `compileRoster` derives the engine’s deck and card registry and separates presentation metadata. Card IDs must be unique across bundles; the original decks use twenty cards; Medusa preserves thirty printed cards. The server shuffles the selected character’s deck.

An action card entry looks like this:

```json
{
  "id": "mend",
  "name": "Mend",
  "category": "action",
  "usableBy": "BOTH",
  "value": 0,
  "boost": 2,
  "count": 3,
  "description": "Heal 2 health, then draw 1 card.",
  "effects": [
    { "type": "heal", "amount": 2 },
    { "type": "draw", "count": 1 }
  ],
  "art": { "scene": "lantern", "variant": 2 },
  "flavor": "Battered is not broken."
}
```

Action cards execute `effects` in order. Combat cards use `abilities` with the same fields and condition/effect vocabulary as character passives. See `medusa.json` → Gaze of Stone for a conditional damage effect and Dash for movement after combat.

**Combat timing and suppression:** `combat-reveal` is the immediate timing. At shared combat timings, defending-card effects resolve before attacking-card effects, independently of seat order. Immediate effects resolve before reveal-associated `card-played`/`card-discarded` hooks. After-combat card effects resolve before after-combat fighter/status passives. `suppress-card-effects` marks the exact opposing card instance in the combat frame. Typed card provenance follows abilities, nested effects, operations and choice continuations; each checks suppression before execution. Suppression preserves printed values, fighter/status abilities and already-resolved effects. `cancel` retains its separate before-event semantics.

**Card hook lifetime:** combat cards support `before-attack`, `before-defense`, `combat-reveal`, `before-combat`, `after-combat`, `after-attack`, `after-defense`, `card-played` and `card-discarded`. Only timings in that card’s own card/combat frame fire. Default self scope gives attack hooks to the attacker and defense hooks to the defender; explicit `scope: "any"` can observe the other participant’s timings in that combat. Action cards support `card-played` and `card-discarded`, plus their direct effects. Cards do not listen from the hand/deck/discard or inherit nested draw/movement/damage frames. Put continuing reactions on a character or an applied status. The bundle compiler rejects unsupported card timings and direct effects on combat cards.

Run `pnpm typecheck`, `pnpm test`, and add a fixed-deck interaction test. `validateDefinitions(input)` accepts unknown engine JSON and rejects invalid rules. Match rules are validated, cloned and frozen before play. Artwork remains outside engine Definitions.

## Ability fields

Every ability requires `id`, `name`, `description`, `trigger`, and `effects`. Optional fields:

- `scope: 'self' | 'any'`: defaults to events concerning the owner; `any` observes everyone's events. Use `when` to narrow them.
- `when: Condition`: evaluated when the queued ability is reached.
- `optional: true`: the owner chooses Use or Skip before its effects.
- `limit: { scope: 'turn' | 'match', count: 1 }`: maximum offers/activations. A turn is **one seat's turn**, including opposing turns. Offering an optional ability consumes its use even if skipped. Copies of a card share their definition's limit for that owner.

Abilities can belong to a character, a card or a status. Card abilities are active only while that card is played, discarded or involved in the current combat; cards sitting in a hand/discard pile have no passive hooks.

## Hooks and context

| Hook                            | Default `self` scope / timing                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turn-start`, `turn-end`        | Active player; includes the first turn. End hooks run before status expiry and the hand-limit check.                                                |
| `before-draw`, `after-draw`     | Drawing player; `amount` is requested count before, actual cards drawn after. Exhaustion resolves before `after-draw`.                              |
| `maneuver-boosted`              | Each living owned fighter, after boost discard reactions; actor/source is the main fighter and event amount is the bonus.                           |
| `before-move`, `after-move`     | Moving player; applies to maneuvers and effect movement, including staying. `distance` is the permitted maximum before, steps actually moved after. |
| `before-attack`                 | Attacker; action/card already spent, before asking for defense. The attack is still hidden.                                                         |
| `before-defense`                | Defender; defense selected or declined, before reveal. Both commitments are still private.                                                          |
| `combat-reveal`                 | Both participants; cards are public, before combat calculation.                                                                                     |
| `before-combat`                 | Both participants; modify attack/defense values here.                                                                                               |
| `after-combat`                  | Both participants; damage and its reactions have resolved.                                                                                          |
| `after-attack`, `after-defense` | Attacker / defender, after `after-combat`. `amount` is resolved combat damage.                                                                      |
| `before-damage`, `after-damage` | Victim; `actor`/`source` is damage dealer. `amount` is incoming damage before, resolved damage after (may exceed remaining HP).                     |
| `before-heal`, `after-heal`     | Recipient; `actor`/`source` is healer. After amount is actual HP restored.                                                                          |
| `card-played`                   | Card owner; action cards before direct effects, combat cards only after both commitments reveal.                                                    |
| `card-discarded`                | Card owner; every card entering discard, including played cards. Action-card discard hooks follow its direct effects.                               |
| `eliminated`                    | Victim, after reaching zero; `actor` is victim and `source` is killer (self for exhaustion). Death reactions resolve before victory.                |

Combat order: commit attack → `before-attack` → defense choice → `before-defense` → reveal/consume cards and their card hooks → `combat-reveal` → `before-combat` → damage hooks/application/death reactions → `after-combat` → `after-attack` → `after-defense`. Declining defense still runs defense hooks. Eliminated owners run only their own elimination hooks; they cannot heal or draw themselves back into play.

Attack boosting requires `{ type: 'boost-attack' }` in a character, status, or combat-card ability at `before-attack` or `before-combat`, including nested conditions/choices. Only the current attacking fighter can use it. A private prompt lists remaining hand cards with BOOST values plus Skip; an empty hand skips automatically. Each grant allows one successful payment per combat (even a zero-value payment counts); skipping leaves that grant available. The optional `grant` ID defaults to `attack`; distinct IDs permit independent payments. `cancelWithCard: true` removes that payment’s bonus when pending attack-card effects are suppressed. Effectless cards and already resolved effects do not count as cancelled. There is no universal attack boost permission and no defense boosting.

Before defense, the payment leaves the hand but stays private in the combat frame until reveal. At reveal it enters discard and is announced immediately; a `before-combat` payment is discarded and announced immediately when chosen. Its BOOST value adds to attack alongside ordinary modifiers. `CombatReveal.boosts` records every public payment as `{ card, amount }`; a cancelled payment has amount 0. Cancellation before reveal consumes committed cards exactly once with normal discard reactions; lifecycle forfeits consume them without reactions. Cancellation after reveal never discards them again. Ordinary suppression preserves paid bonuses; cancellation-sensitive grants remove their bonus while retaining the spent card.

Boost payments never execute their own direct effects or card abilities, including their own discard abilities; character and status discard reactions still run through the queue. This follows the publisher's [BOOST rules](https://restorationgames.com/wp-content/uploads/2023/04/UM-KingandCountry_Rules_Pages-sm.pdf). A public `{ type: 'boost', player, fighter, card, amount, purpose: 'maneuver' | 'attack' }` outcome is emitted when the payment becomes public, without an additional played-card outcome. Pre-reveal payment cards, hand options and continuation tasks never enter opponent or spectator views.

## References, values and conditions

Fighter references: `self` (ability owner), `actor`, `target`, `source`, `attacker`, `defender`, `opponent`, `chosen`, `main` (the owning main fighter of the acting fighter). `opponent` means the other participant in a two-player event, not an arbitrary rival; use `choose-player` for that. `source` equals `actor` except on elimination. Combat references exist only in combat events. `chosen` is bound to an exact fighter inside `choose-fighter.effects` / `for-each-fighter.effects` or to the selected owner’s main fighter inside `choose-player.effects` and survives nested choices. An unavailable reference causes targeted effects to do nothing; missing numeric values read as zero.

A numeric value is a number, `{ stat: 'hp' | 'hand' | 'deck' | 'movement', of?: PlayerRef }`, `{ stat: 'counter', name: 'energy', of?: PlayerRef }`, `{ stat: 'actions' }`, or `{ event: 'amount' | 'attack' | 'defense' | 'distance' }`. `of` defaults to self; `hand`/`deck` read counts. Combat `attack`/`defense` include modifiers; `amount` becomes meaningful after damage calculation.

| Condition       | Fields                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compare`       | `left: Value`, `right: Value`, `op`: `eq`, `ne`, `lt`, `lte`, `gt` or `gte`.                                                                               |
| `all`, `any`    | `conditions: Condition[]` (empty all is true; empty any is false)                                                                                          |
| `not`           | `condition: Condition`                                                                                                                                     |
| `role`          | `role`: `actor`, `target`, `attacker` or `defender`; owner must have that role.                                                                            |
| `relation`      | `a`, `b`: fighter references; `relation`: `same` (exact piece), `friendly` (same owner), `enemy` (different owners), `adjacent`, `zone` or `attack-range`. |
| `card-category` | `card`: `played`, `attack` or `defense`; `category`; unavailable cards fail the condition.                                                                 |
| `combat-result` | `result`: `won`, `lost` or `blocked`; attacker wins with positive damage, defender with zero; blocked means zero damage for either participant.            |
| `has-status`    | `status: string`, optional `player` (self)                                                                                                                 |

For “after I deal damage”, use `after-damage`, `scope: 'any'`, and `when: { type: 'role', role: 'actor' }`. For “when I take damage”, default self scope is sufficient.

## Effects

Effects run in array order. `target` defaults to `self` wherever supported.

| Type                    | Fields and behavior                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boost-attack`          | Optional `grant` ID and `cancelWithCard` boolean. At `before-attack` / `before-combat`, privately choose a hand payment or Skip; one payment per grant.                                                                          |
| `suppress-card-effects` | No fields. Suppress pending effects of the exact opposing committed card; requires an ability hook and a combat context.                                                                                                         |
| `for-each-fighter`      | `relation`: `friendly`, `enemy`, `any`; optional `role`: `main`, `ally`; nested `effects` bind each snapshot member as `chosen` in owner-selected order.                                                                         |
| `revive-ally`           | Optional `optional` (adds Skip) and `anchor` (defaults to `main`); choose one defeated owned ally and an empty space sharing the anchor’s zone.                                                                                  |
| `draw`                  | `count`, optional `target`; missing cards cause normal exhaustion damage.                                                                                                                                                        |
| `damage`, `heal`        | `amount`, optional `target`; emit their own before/after hooks. Healing caps at that fighter’s starting HP; no resurrection.                                                                                                     |
| `move`                  | `distance`, optional `target` and `throughEnemies`; owner chooses an unoccupied graph endpoint within that distance. Enemy traversal defaults to false.                                                                          |
| `push`, `pull`          | `distance`, optional `target`; owner chooses a path whose every step increases/decreases shortest graph distance from the owner. Friendly pieces permit traversal; enemy pieces block traversal; occupied endpoints are illegal. |
| `teleport`              | Optional `target`; `zone`: `any` (default) or `shared`; choose an empty destination, ignoring edges.                                                                                                                             |
| `discard`               | `count`, optional `target`; that player's private prompt requires exactly that many cards, capped by hand size.                                                                                                                  |
| `actions`               | Signed `amount`; changes the owner's remaining actions only during their own turn, floor zero. Does not undo an explicit end-turn.                                                                                               |
| `counter`               | `name`, signed `amount`; changes the owner's declared counter, clamped to its bounds.                                                                                                                                            |
| `status`                | `status`, optional `target`, `stacks` (1), `turns`; add capped stacks, optionally refresh duration.                                                                                                                              |
| `remove-status`         | `status`, optional `target`; remove every stack.                                                                                                                                                                                 |
| `modify`                | `field`: `attack` or `defense`, signed `amount` on `before-combat`; or `field: 'amount'` on `before-draw`, `before-damage`, `before-heal`. Values floor at zero.                                                                 |
| `cancel`                | Before hooks only; cancel the current draw/move/attack/defense/combat/damage/heal. Costs and committed cards stay spent. Canceled defense contributes zero base/status defense; other combat hooks still run.                    |
| `if`                    | `condition`, `then: Effect[]`, optional `else: Effect[]`.                                                                                                                                                                        |
| `choose-player`         | `relation`: `self`, `opponent` or `any`; optional `range`: `any`, `adjacent`, `zone` or `attack-range`; `effects`. Owner selects a living player; `chosen` resolves to that owner’s main fighter.                                |
| `choose-fighter`        | `relation`: `friendly`, `enemy` or `any`; optional `range` as above; `effects`. Select an exact living, placed piece bound as `chosen`.                                                                                          |
| `choose-option`         | `prompt`, `options: [{ id, label, effects }]`, optional `chooser` fighter reference; its owner selects one effect group. Effects keep their original owner and chosen binding.                                                   |

Movement choices include Stay; no legal destinations/targets means no prompt. Choices lock unrelated actions, validate the actor and offered options, and resume the same queue after reconnect. Selected moves are checked again against current paths and occupancy before application.

## Counters and statuses

Declare counters on each fighter definition with `counters: { energy: { initial: 0, max: 3 } }`. Counters and active statuses are public. Counter effects must name a counter declared by their fighter definition; absent counter values in conditions read zero.

Statuses are reusable entries in `Definitions.statuses` (add/export a content module and include `statuses` in `basic` in `packages/content/src/index.ts`):

```ts
focus: { id: 'focus', name: 'Focus', maxStacks: 2, modifiers: { attack: 1, movement: 1 } },
poison: {
  id: 'poison', name: 'Poison', maxStacks: 1,
  abilities: [{ id: 'tick', name: 'Poison', description: 'Take 1 damage at turn start.',
    trigger: 'turn-start', effects: [{ type: 'damage', amount: 1 }] }],
},
```

Apply with `{ type: 'status', status: 'focus', turns: 1 }`. Supported passive modifiers are `attack`, `defense`, `movement`, multiplied by stacks; status abilities fire once per event, regardless of stacks. Defense modifiers require a committed defense card. Duration counts affected-player turn endings, including the current turn if it is theirs; omit `turns` for persistence. Reapplying with `turns` replaces duration; omitting it preserves an existing duration. To scale a poison tick, define its effect explicitly; stacks alone do not multiply hooks.

## Resolution guarantees and boundaries

Passive order is fixed seat order → main then allies in instance order → fighter abilities → statuses in application order, with declaration order within each source. Combat card order and immediate/after-combat priority follow the timing rules above. Other hooks resolve passives before card abilities. Each ability's effects and their nested events finish before the next queued ability. Conditions use current state; sources are collected when the event dispatches. Movement/status changes do not retrospectively invalidate an attack's already validated range.

Commands are atomic: invalid commands and resolution loops reject without mutating the previous state. A cascade is capped at 1024 queue steps across choices, not reset by reconnecting. Definitions use strict schemas, safe IDs, bounded integer quantities (0–100, signed modifiers −100–100), at most 32 abilities/effects per list, and 5–100 cards per deck. Drawing caps at 100 per operation; damage caps at 1000. Definitions cannot contain functions or cycles. The server owns legality, choices, ordering and all hidden information; private hands, pre-reveal card-hook names and continuation tasks never enter opponents' payloads. Visible effects may reveal what a hidden card does, as ordinary game behavior.

Natural elimination permits death reactions and mutual defeat. Forfeits/timeouts bypass abilities, cancel affected combat/choices and cannot trigger death retaliation; a forfeited chooser's remaining effects are skipped. Turn progression and victory wait for normal pending reactions. Existing matches remain in memory only.

This vocabulary does not implement summons, teams, alternate victory rules, player-authored scripts or new board topology. A new primitive needs a typed effect/condition/hook, validation, an interpreter handler and tests; ordinary characters use definitions alone. There is no editor or marketplace yet. The engine modules under `packages/game/src/abilities/` separate vocabulary, validation, conditions, queue, choices, effects, positions and operations.

## Group movement and revival

`{ "type": "for-each-fighter", "relation": "friendly", "role": "ally", "effects": [{ "type": "move", "target": "chosen", "distance": 3 }] }` snapshots living, placed fighter IDs when execution begins. `relation` accepts `friendly`, `enemy` or `any`; optional `role` accepts `main` or `ally`. The acting owner selects the remaining fighters in any order. Each selected ID is consumed once, nested effects bind it as `chosen`, and ineligible fighters are skipped when the group resumes. Empty groups continue immediately. Nested groups preserve the surrounding binding.

Ordinary `move` effects accept optional `throughEnemies: true`. The serialized move operation carries the same policy into authoritative path validation. It permits crossing enemies and retains the prohibition on occupied endpoints. Push, pull, teleport and ordinary Maneuver do not gain this flag. Omitting it retains existing movement rules.

`{ "type": "revive-ally", "optional": true, "anchor": "main" }` offers the acting owner one defeated owned ally, followed by an empty destination sharing the anchor’s current zone. `anchor` accepts a fighter reference and defaults to `main`, a reference to the acting fighter’s owning main fighter even when an ally acts. The optional flag adds Skip to the ally selection. No eligible ally or empty destination means immediate continuation. Placement is revalidated before application. Revival restores the same instance ID and number at printed HP, clears statuses and resets counters to their printed initial values. Turn/match usage history stays intact. Main fighters and eliminated owners cannot revive. A public `revived` outcome carries the fighter and destination; clients show its arrival there without animating movement from its former position.

## Combat value replacement and private discard selection

`Value` additionally supports `{ card: "played" | "attack" | "defense" | "opposing", field: "value" | "boost" }`. These read printed card data; missing cards read zero. `opposing` is relative to the ability owner’s combat role. Reading BOOST does not pay/discard that card or trigger its effects.

`{ type: "set-combat-value", target?: PlayerRef, value: Value, mode?: "total" | "printed" }` runs at `before-combat`. The default replaces the resolved combat value; `printed` replaces only its printed component, preserving additive bonuses. Unavailable participants and declined defenses do nothing. Ordinary replacements and modifiers follow queue order (defender first).

A status may define `combatValue: { value: number, locked?: boolean }`. At reveal, status replacements follow base values, initial BOOST and modifiers. The first active lock overrides unlocked replacements and blocks subsequent setters, modifiers and BOOST adjustments for that combatant. Status lifetimes use ordinary owning-turn expiry. An already-resolved status survives later opposing-card suppression; it never changes printed BOOST or creates a defense card.

`draw.count` also accepts a `Value`, evaluated once at execution and bounded to 0–100. Use `{ event: "amount" }` at `after-combat` to draw resolved combat damage. Normal draw reactions, exhaustion and elimination still apply.

`{ type: "discard", target?: PlayerRef, chooser?: PlayerRef, count: number }` defaults to the affected owner choosing. With another chooser, that owner’s current hand is exposed only as private card options to the chooser. These options include `{ id, label, card }` for inspection; continuations stay server-private. Choices validate exact instances, survive JSON/reconnect, and enter public discard only when resolved. Empty hands skip.

`teleport.includeOrigin: true` includes its target’s current space when that space satisfies the placement restrictions. A placement there still runs placement movement hooks. Ordinary unanchored teleports continue to require an empty destination. `teleport` adds `optional?: boolean` (default true). `optional: false` offers only legal empty spaces, without Stay. An impossible placement skips; following effects still resolve. Destination operations retain authoritative occupancy validation.

## Deck, area and combat extensions

| Effect / condition           | Fields and behavior                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search-card`                | `card`: exact design ID, `zones`: deck/discard. Privately choose which pile to search first; continue to the others on a miss. Recover one instance to hand and shuffle whenever the deck was searched, including a miss.                                                                                                                                       |
| `inspect-deck`               | `count`, `take`: privately inspect up to count top cards, add up to take to hand, then choose the remaining order from top down. Short decks never cause exhaustion.                                                                                                                                                                                            |
| `set-health`                 | Positive `value`, optional `target`. Set a living fighter’s HP exactly, capped at printed maximum; does not invoke heal/damage hooks or resurrect defeated fighters. Emits the actual public health change.                                                                                                                                                     |
| `prevent-damage`             | Optional `target`; at `before-combat`, protect that fighter from all damage until the current combat finishes, including nested effect damage. Suppression before activation prevents it.                                                                                                                                                                       |
| `set-combat-value`           | Existing `value` and optional `target`, plus optional `mode`: `total` (default) or `printed`. Printed mode replaces only the printed card contribution, retaining BOOSTs/modifiers; total value locks still take precedence. Repeated printed replacements do not accumulate.                                                                                   |
| `area-damage`                | `range`: zone/any, `relation`: friendly/enemy/any, `amount`, optional `adjacent` and `onDefeat` effects. Choose an empty or occupied first space; with adjacent, choose one physical neighbor. Snapshot matching occupants, resolve normal damage/reactions, then run onDefeat once if this damage directly defeated anyone. Portals do not count as adjacency. |
| `changed-position` condition | Optional `target`; compare the fighter’s current space with its space before this seat-turn’s start hooks. Both positions must exist and differ; moving away and returning fails.                                                                                                                                                                               |

Deck operations and their card identities/continuations stay in private resolution state. Choices use the existing authoritative choose command and owner-only projection, with card inspection where appropriate. Searches/inspection are card transfers, not draw-hook events. The server supplies a fresh private shuffle seed at creation; its stream survives JSON recovery. Turn-start positions cover all fighters and are refreshed before the first post-deployment turn and every subsequent turn’s reactions.

## Protected effects and information choices

`CharacterDefinition.cardEffectProtection: { name, description, tags }` protects the owner’s committed cards with the listed MAIN/ALLY/BOTH tags from opposing `suppress-card-effects`. This covers either combat role and allied users without changing printed values, effect timing or pre-existing fighter/status abilities. It does not prevent value replacement or value ignoring. The roster and card inspector show its rule text.

`CardDefinition.faceUpDefense: true` makes a committed defense publicly observable during a suspended pre-reveal choice. The attack remains private to its owner. `predict-value` is restricted to `before-defense`; the defender chooses a number from the full 0–100 domain. The choice is private while pending and its confirmed prediction is public. `prediction-matches` compares that number with the committed attack’s printed value. It is a combat-frame value, preserved across reconnect, and never derived from private-card-dependent options. The resolved combat includes the prediction.

`ignore-combat-value` at `combat-reveal` or `before-combat` targets a combat participant and ignores their complete attack/defense value for this combat. It sets the value to zero and prevents later modifiers and replacements from restoring it, including when the opposing effects are protected from suppression. It is distinct from damage prevention, total replacement and printed-value replacement.

`inspect-hand` targets a fighter’s owning player and privately displays every current hand card to the effect owner; selecting any card acknowledges inspection without moving it. `public: true` explicitly reveals the cards to everyone and emits a `hand-revealed` outcome with public card data for persistent client review. Public snapshots may include `observation: { prompt, cards }`; ordinary private inspection and choice continuations never enter that field. Empty hands resolve without an input prompt.

`named-value-discard` first lets the effect owner name a number from 0–100, then offers only combat cards with that printed value to the affected owner. Action cards have no combat value and cannot match zero. The chosen card is discarded through ordinary lifecycle hooks; its printed BOOST then damages the affected owner’s main fighter, regardless of which fighter was chosen as the hand target. If there is no match, its entire hand is revealed publicly. The hand choices, target and BOOST continuation are private and JSON-serializable.

## Placement anchors and atomic exchanges

`teleport` may specify `anchor: PlayerRef` and `range: 'adjacent'` to choose a destination physically adjacent to a living anchor, including the target’s current space when it already qualifies. `optional: false` removes Stay and requires a legal placement when one exists. Both the initial choice and application validate adjacency, occupancy and anchor defeat; portals do not grant adjacency. With no legal destination, subsequent effects still resolve.

`swap` exchanges the acting fighter with `target: PlayerRef` atomically. Both must be living and placed. Both fighters receive normal before-move hooks before either changes position, then after-move hooks after the exchange. A cancellation, defeat or changed origin prevents both placements; failed receipts report zero distance. `onSuccess: Effect[]` runs after both movement reactions only when the exchange succeeded, preserving the source binding. Allies and other occupants are never displaced. Each outcome identifies the exact fighter and its origin/destination.

Spatial `relation` checks (adjacent, zone and attack-range) exclude defeated fighters, whose retained animation positions do not represent occupied spaces.

## Bonus attacks, defender replacement and discard recovery

`bonus-attack` (`name`, `value`) is an `after-combat` effect that schedules a separate, effectless attack after the current combat's card effects, passives and final attack/defense hooks. It costs no additional action or hand card. It retains the exact attacker, current defender and original card instance, even when movement has put them out of attack range. Either fighter's defeat prevents the bonus. Its own combat frame has fresh defense, suppression, BOOST opportunities and fighter/status hooks; the original attacking card's abilities and discard lifecycle do not repeat. Source BOOST remains available to card-value expressions, while attack-value expressions read the bonus's printed value. Only one effectless bonus is supported per combat; effects on a bonus attack are not currently authored. The public defense phase and combat receipt include `bonus: { name, value }`, allowing defenders to see the known second attack without disclosing another hand commitment.

The `ally` reference resolves the owner's sole ally instance, including when defeated, and is undefined for zero or multiple allies. Use groups/choices for repeated allies. `{ type: 'defeated', target }` tests the exact referenced instance. This lets named durable-sidekick rules express their living/defeated conditions without global flags or character-ID branches.

`replace-defender` (`target`) is restricted to `combat-reveal` and changes the current defender to a living, deployed fighter of the same owner. It retains the committed defense instance and recalculates defense modifiers/status replacements for the new fighter. Subsequent combat, opponent references and any bonus attack follow that replacement. Compose it with an atomic `swap`'s `onSuccess` effects when exchanging spaces is required; an interrupted/failed exchange does not change defenders. The MAIN/ALLY restriction is checked when the defense is committed, before any replacement.

`discard` may set `random: true` instead of a `chooser`. It selects distinct hand instances using the private serialized seeded stream, up to the available hand size, and runs each ordinary discard lifecycle exactly once. It opens no choice. `recover-card` privately offers prior discard instances and returns exactly one to the owner's hand. Cards committed to an unfinished combat are excluded, including the recovering card itself. Recovery is a transfer, with no exhaustion or deck shuffle. Its private choice and continuation survive JSON serialization.

`actions` may specify `target` to grant actions to another fighter's owner, only when that owner is currently taking their turn. `for-each-fighter` may specify `range: 'adjacent' | 'zone'`; its initial snapshot and each remaining member are filtered relative to the source fighter. Physical adjacency does not include movement-only portals. Existing group order, exact `chosen` binding and reconnect semantics apply.

## Computed effects, discard bonuses and attack replacement

`Value` supports `{ fighters: 'friendly' | 'enemy' | 'any', role?: 'main' | 'ally', range?: 'adjacent' | 'zone', anchor?: PlayerRef }`. It counts living, placed fighters once each. Ownership is relative to the effect owner; spatial range is measured from the referenced anchor (default `self`). Physical adjacency excludes portals. Use `anchor: 'chosen'` to count after a chosen fighter moves, or `anchor: 'opponent'` for combat bonuses near the exact opposing participant. `damage.amount`, `heal.amount` and `modify.amount` accept these and existing Value expressions, evaluated at execution; positive amounts are bounded to 0–1000.

`damage` may supply `onDamage: Effect[]`. These run only after positive resolved damage and its reactions, before releasing its operation frame. The continuation preserves the owner, chosen binding and card provenance; `{ event: 'amount' }` reads that exact resolved damage receipt. Prevention/cancellation or an unavailable victim yields no callback. Nested choices retain the receipt across JSON recovery.

`area-damage.range: 'adjacent'` skips space selection and snapshots matching occupants physically adjacent to the acting fighter. Existing zone/any selection behavior is unchanged. Optional `onDamage: Effect[]` runs once after all targets and reactions when their total resolved damage is positive. Its event amount is the aggregate; this supports healing after a complete group attack. `onDefeat` retains its direct-defeat semantics. Neither callback runs from suppressed source effects.

`discard` accepts `upTo?: boolean`, offering zero through `count` (bounded by available hand size); submitting zero requires no separate Skip option. It cannot combine with random selection. Optional `combatBonus: { field: 'attack' | 'defense', per: 'card' | 'boost' }` is restricted to `before-combat` and adds one per actual discard or that discarded instance’s explicit BOOST to the enclosing combat field. A random discard can grant the bonus to the source while discarding from another owner. Duplicate/missing instances grant nothing. Payments retain provenance and ordinary discard reactions; locks/ignored values still block value changes. Empty hands resolve without prompting.

`replace-attack` is restricted to `combat-reveal`. It returns a normal revealed attack commitment to its owning hand, privately displays that whole hand to the effect owner, then offers attack/versatile cards legal for the exact attacking fighter. Selecting the original is allowed. The operation changes the attack instance while retaining fighters, target, separately committed BOOSTs, statuses and combat identity. It drops the old attack’s queued immediate effects, recalculates attack contribution/modifiers/status locks, updates the public reveal, and schedules only the replacement attacking card’s immediate effects. Later timings/lifecycle use the replacement. Before-attack hooks, the defense and fighter passives do not repeat. Returning a card is a transfer, not a discard event. Effectless bonus attacks have no fresh physical card to return and are unchanged. Full hand data and continuation tasks remain private; accepted replacement becomes public through the revealed attack/discard.

Anchored `teleport` additionally accepts `allowDefeatedAnchor?: boolean` (default false). This permits an explicit rule to use a defeated fighter’s retained final position without treating it as a living occupant. The anchor must still have a position; occupancy and adjacency remain validated at both offer and application. Other placements retain the living-anchor requirement.

`choose-option.chooser` defaults to `self`. An explicit reference delegates only who receives the private decision; its effect continuations keep the original owner, frame, selected fighter and card provenance across JSON reconnects. `ignore-combat-value` also supports `combat-reveal` for immediate value ignoring; its ignored field remains zero through later modifiers/setters.

## Filtered recovery and conditional action return

`recover-card` accepts optional `cards: string[]`, a nonempty allowlist of existing card definition IDs. Omit it for unrestricted recovery. Only matching prior discards are offered privately; unfinished combat commitments remain excluded. Exact instance selections and their allowlist survive JSON continuations, and resolution rechecks the selected definition.

`damage.onDefeat` runs after damage and its reactions when that exact positive damage operation directly reduced a living fighter to zero HP. It composes with `onDamage` (which runs first), retains the original card provenance and chosen fighter, and exposes the damage receipt as its frame. A later reaction killing the target does not count; revival during an elimination reaction does not erase the recorded direct defeat. Prevention and zero damage never trigger it.

`return-played-card` returns the exact resolving **action** card instance from its owner's discard to hand. It follows provenance through nested damage/choices, marks the original card frame as returned, and suppresses its subsequent `card-discarded` event and reactions. Repeated returns are idempotent; it cannot retrieve another copy or an attack/defense commitment. It does not run draw hooks, draw from the deck or cause exhaustion. As with existing recovery/search, the owner receives a private card-movement receipt while public discard/hand counts update.

The reusable `attack-up` status grants +1 attack per stack (up to 100). A duration of one owner turn expires after turn-end hooks, before the next player acts. It does not modify defense; printed-value replacements preserve its additive bonus. Bruce Lee uses this for Nunchaku, including +2 from two copies in one turn.

## Board tokens and temporary removal

`CharacterDefinition.boardTokens: { id, name, count, linksMovement?, exclusive? }` creates stable public `GameState.boardTokens` objects with exact fighter `owner`, `kind`, numbered `name`, position and movement-link flag. Tokens are separate from fighters: no health, attacks, occupation, targeting or passive dispatch. They deploy after allies but before the first turn. Each owner's setup tokens occupy distinct empty spaces in its hero's zone; the ally matcher reserves sufficient token slots. Later token movement can share fighter spaces; `exclusive` prevents another token of the same kind on that destination, across all owners. The deployment matcher reserves exclusive token slots jointly. Natural main defeat and forfeit remove only that owner's tokens. Public projections include token identities/positions and omit all continuation data.

`choose-token` filters the owner's token kind, optionally at a referenced fighter, optionally excluding the previously chosen token. Its explicit `chooser` delegates both token and destination selection while retaining rule ownership. Nested effects carry a separate `chosenToken` and chooser binding, preserving `chosen` fighter references. `move-token` uses the selected token: optional `distance` counts normal movement connections (including passages) through all pieces; omitted distance offers every other board space. Bounded movement includes Stay; `optional` also permits Stay for unrestricted movement. `empty` requires a space without a fighter. `placeSelf` schedules ordinary fighter placement there after token movement. `for-each-token` snapshots the owner's matching tokens, lets the owner choose order and resolves each once. All choices/tasks are serializable and retain suppression provenance.

`on-token` tests a referenced fighter against the effect owner's tokens of the declared kind. `atTurnStart` reads the rule owner’s token positions and referenced fighter’s position from the start of the current seat turn, before any start-hook placement. This history survives token movement. `teleport.token` restricts destinations to the target fighter's owned tokens; ordinary occupancy, origin and mandatory/optional rules still apply.

Tokens with `linksMovement` connect their owner's token spaces for one ordinary movement point. The shared server/client path functions apply these links to Maneuver and effect movement. They never change physical attack adjacency or zones and are disabled for push/pull. Enemy fighters block traversal and occupied endpoints remain illegal.

`remove-until-next-turn` removes a living referenced fighter without defeat or player elimination and records its exact ID. It does not itself end a turn: compose with `end-turn` when printed rules require that. `end-turn` is allowed in direct action effects as well as after combat. At the next owning turn, position/token history records the initial off-board state, then removed living fighters must be placed on empty board spaces before other start hooks resolve. Restore choices and removed IDs survive JSON reconnect. Off-board fighters cannot act, occupy spaces, be board targets or take damage. At action settlement a living player with no board fighters becomes dormant: its passives, drawing, forced discards, hand inspection and hand-limit discards are disabled. Return placement clears dormancy before its other start hooks. Return placement emits a public `placed` receipt with a valid destination, so the client shows arrival without inventing a movement origin or defeat/revival.

`return-to-deck: { count }` privately selects hand instances sequentially in top-to-bottom order, excluding prior selections, then transfers the exact cards to the deck top. It neither discards nor draws. If fewer cards are available, it returns all available selected cards. Intermediate selection/order and card options remain private across reconnect.

`discard.onDecline` supplies a fallback for an optional one-card payment (`count: 1`, without `random`/`upTo`). The affected player may choose a hand instance or decline. An empty hand or ignored protected discard runs the fallback; a paid discard runs ordinary card/discard reactions without the fallback.

`lock-card-value` at `combat-reveal` sets the referenced participant's attack/defense to a fixed value, then prevents further card-origin modifiers, printed/total setters, discard bonuses and card-granted BOOSTs for that combat field. The other card's remaining effects continue. Fighter/status-origin abilities still work; previously committed character-granted BOOSTs are retained using their serialized origin, while card-granted BOOST values are removed; the pre-existing `ignore-combat-value` and locked status replacements retain their stronger semantics. Defender-first immediate ordering and suppression provenance apply normally. This supports rules that lock card-driven values without suppressing every opposing effect or fighter passive.

## Deck selection, ongoing schemes and combat extensions

A character may declare `deckSelection: { name, description, groups: [{ name, cards: [definition IDs] }] }`. The ordinary deck lists the complete supplied pool. Groups must contain disjoint, owned designs. The supplied pool must match every authored copy count. At setup each owner privately chooses one design per group; all copies of other designs are removed before the selected deck is shuffled and five opening cards are dealt. Existing instance IDs are preserved. Serializable choice tasks finish for every seat before ally deployment and game-start processing. No selected card identities, deck order or continuation data are projected to opponents.

`boost-combat` is a during-combat (`before-combat`) optional BOOST for the exact acting combatant, attacking or defending. It uses ordinary unrestricted hand payments, preserves the explicit printed BOOST, suppresses payment-card effects and runs owner discard reactions. Each fighter may pay once for this grant; two opposing cards can both grant it. Existing `boost-attack` grants retain their separate limits and cancellation behavior.

`lock-movement` with an optional `target` locks an exact living fighter through the current seat-turn. It blocks nonempty Maneuver/effect paths, push/pull, teleport/placement and atomic swaps. Stay remains legal. Locks are public IDs in `GameView.movementLocks`, allowing the same movement highlights as authoritative validation. They clear at turn transition, including active-player elimination/forfeit; there is no owner-turn status duration ambiguity.

`search-cards: { cards: [definition IDs], recycleOnDeck?: true }` offers exact eligible instances privately across deck and discard. It excludes unfinished combat commitments. A discard take does not shuffle. A deck take shuffles the remaining deck and may return the exact resolving action to that deck before shuffling, suppressing its pending discard event. An empty search offers no choice. It does not create new cards or expose options to other viewers.

Action cards may declare `ongoing: { preventEnemyActionGain?, optionalDiscardProtection?, discardUnlessAttacked? }`. Their normal effects resolve before they enter `Player.ongoing`, a public, separate card zone. Each owner has one ongoing scheme; activating a new one discards the previous exact instance and runs discard reactions. Eliminated owners provide no ongoing benefits. `preventEnemyActionGain` blocks positive action effects for all opposing owners; it leaves the normal two-action allotment intact. `optionalDiscardProtection` lets the affected owner ignore a discard effect before another player sees hand choices or a random discard consumes the seed. Declining protection resumes the exact serialized effect. It applies to named-value discard too; BOOST costs and mandatory hand-limit discards bypass it. `discardUnlessAttacked` expires at the end of an owner turn with no attack by any owned fighter, after end-step hooks and before the hand limit. Defending does not qualify.

`end-turn` in an action or at `after-combat` requests the end of the active turn. Remaining combat effects finish, but later positive action effects cannot reopen it. Normal end-step abilities, ongoing expiration, hand-limit choices and turn advancement still run. All additions use typed JSON data and shared operations rather than fighter-specific infrastructure branches.

## Exact-card discard continuations and starting spaces

`discard.onDiscard?: Effect[]` runs once for each card actually removed from the affected hand. It retains the original effect owner, chosen fighter and card provenance. Normal discard hooks finish first, including suspended private choices. Empty hands, skipped `upTo` payments and prevented discards produce no continuation. `{ card: 'selected', field: 'boost' | 'value' }` reads the exact receipt’s printed field in these nested effects. It returns zero outside a receipt. Receipts are serialized only within private resolution bindings and never projected to opponents or spectators. Independent discards bind independent cards; a nested continuation preserves its own receipt.

`{ type: 'discard-deck', target?: PlayerRef, count, onDiscard?: Effect[] }` publicly discards top cards in deck order without drawing or exhaustion. Each card’s normal discard reactions and exact-card continuation finish before the next card. The target identifies the affected owner through an exact fighter, including an allied piece. No available target or no remaining card is a no-op. Continuations use the same `selected` card Value and original combat timing/provenance. Two ordinary modifiers can express twice a BOOST without adding general arithmetic.

`recover-card.destination?: 'hand' | 'deck'` defaults to existing hand recovery. With `deck`, privately select a prior discarded exact instance, move it into the deck and shuffle with the private serialized random stream. Recovery filters and combat-commitment exclusion still apply. Deck recovery emits no draw and runs no draw/discard hooks. Compose with an optional ability or choice for optional recovery.

`teleport.starting?: true` restricts placement to the map’s spawn list for the current seat count. Ordinary occupancy, movement-lock, anchor/zone and optionality restrictions still apply. `includeOrigin: true` explicitly permits remaining on the current starting space; `optional: false` removes the generic Stay option. Both the offered destinations and the applied movement validate the starting-space restriction.

## Setup abilities, fighter roles and multiple effect choices

`game-start` runs once per seat in seat order after main fighters occupy their map starts, before opening hands, loadout selection, ally deployment, token placement or the first turn-start event. Each event binds that seat’s main fighter as actor/source and reaches owned fighter/status abilities under normal ownership/scope rules. Setup effects use the ordinary serializable queue and private choice projection; all opening hands remain empty until every setup event finishes. Non-selectable decks then deal their supplied first five cards unchanged; selectable pools retain their existing loadout selection and shuffle/deal. Opening deals emit no ordinary draw hooks. Setup does not spend an action or advance the turn.

`{ type: 'fighter-role', target?: PlayerRef, role: 'main' | 'ally' }` checks the exact referenced piece’s permanent role, defaulting to self. An unresolved reference is false. This is separate from `role`, which tests who owns a combat/event role.

`choose-option.count?: number` defaults to 1. When supplied, exactly that many distinct authored option IDs must be submitted together. Validation requires an integer from 1 through the available option count (at most 16). Normal choice validation rejects wrong counts, duplicate/unknown IDs, wrong owners and expired prompts without mutation. Effects execute in submitted option order; nested prompts suspend and resume the remainder with original ownership, chosen bindings and provenance intact. Options may have no effective result, such as healing at maximum health. Private continuations are never projected.

Reusable persistent `big` and `small` statuses provide respectively +2 attack-card value and +1 defense-card value through `before-combat` status abilities. SMALL requires an actual defense/versatile card; declining defense receives no bonus. They do not affect movement or map occupancy. Since these are fighter status abilities, card cancellation and card-only locks preserve them; final combat-value ignoring/locks continue to take precedence. Printed-value replacement preserves their additive contributions. Content composes mutually exclusive size flips with `has-status`, `remove-status` and `status`.

## Partial reveals, draw targets and ongoing movement

`draw-to: { count, target? }` computes `max(0, count - current hand size)` once and runs one ordinary draw operation for that shortfall. It neither repeatedly rechecks the hand nor avoids exhaustion; draw hooks see the ordinary operation and its actual draw receipt. Compose with an optional ability and a hand-size condition when the printed rule is optional or unavailable at/above the threshold.

`reveal-hand: { target?, count, discard }` lets the affected hand’s owner privately assemble up to `count` distinct exact card instances, one selection at a time. No partial selection is public. Once complete (or the hand is exhausted), it emits one public `hand-revealed` receipt containing only the selected subset. The effect owner then privately selects exactly `min(discard, revealed cards)` instances from that subset for ordinary discard; unselected hand cards are never offered. Ordinary ongoing discard protection is offered after the reveal and before the discard selection. The containing effect sequence resumes afterward, so subsequent draws occur even if discarding is waived. Selection, ownership and exact-card restrictions survive JSON reconnects. Empty hands require no selection.

`{ type: 'maneuvered', target? }` tests whether the referenced owner has taken a Maneuver action during the current seat-turn. Taking the action records history before its draw; Stay and Finish Maneuver retain it. Effect-driven movement does not set it. The history resets at turn advancement and is independent of position history.

`area-damage.range: 'own-zone'` offers only zone identifiers attached to the acting fighter’s current space. It snapshots all spaces in the selected zone and uses the normal area-damage path: one hit per eligible living placed fighter, relation filtering and existing aggregate receipts/continuations. A multizone origin offers distinct zones rather than their union.

Action-card `ongoing.movementValue` replaces the owning character’s base Maneuver movement while active; the shared value applies to main and allies, with fighter/status modifiers and Maneuver BOOST added normally. `movement(fighter, defs, state)` and `maneuverMovement` read this public state for rules and UI. `ongoing.discardUnlessEnemyInZone` discards at the owner’s end step only when no living placed opposing fighter shares any zone with the owner’s main fighter. It composes independently with existing attack upkeep and uses ordinary exact-instance discard reactions. One active ongoing scheme per owner remains the limit; activation follows direct scheme effects.

`lock-card-value.value` accepts a typed Value expression, including `{ card: 'opposing', field: 'value' }`. The lock blocks card-driven value changes while preserving character-granted BOOST and subsequent fighter/status abilities. It does not suppress the opposing card’s unrelated effects. Defender-first immediate ordering still decides effects which are suppressed before resolution.

## Hero identities, immediate ordering and sealed BOOST reveals

`CharacterDefinition.heroSelection: { name, description, mainName }` supports choosing between a character’s main identity and its single sidekick identity before game-start abilities, loadouts, opening hands and deployment. It requires exactly one sidekick and no board tokens. Fighter instance IDs and main/ally roles stay stable; `Fighter.definition` records the selected identity. Main and ally maximum health remain their role’s authored HP. `fighterDefinition` resolves the identity’s name, attack type, abilities and counters with that role health. `card.fighter` optionally restricts a card to an exact owned definition ID, in addition to `usableBy`. Renderer artwork follows the actual definition. Use a `fighter-role: main` condition for hero-only identity abilities.

`after-action` runs on the exact scheme actor after all direct effects and ongoing activation/discard hooks, before releasing the action frame and settling the action budget. It is a fighter/status hook, not a supported combat-card timing. Suspended choices preserve its place in the queue.

`boost-attack` also supports `combat-reveal`. A passive may set `orderWithCard: true` at that hook to let its owner choose its order with their immediate card abilities. Defender priority remains first; suppression is rechecked between selections. A replacement’s old immediate abilities are excluded. Optionality, costs and provenance remain those of the original ability.

`discard.optional: true` offers an all-or-nothing payment of its exact positive `count`. Insufficient hands offer no payment. `onComplete` resolves once only after all required actual discards and their reactions; it is separate from the per-card `onDiscard` receipt. Private payment counts survive JSON continuations. This mode cannot combine with random, `upTo` or `onDecline`. Ordinary discard protection still applies. `opponent-main` resolves the hero belonging to the exact opposing combat/event participant.

`choose-fighter.range: combat` restricts choices to the living, placed attacker and defender. `return-combat-card` at `after-combat` transfers the exact resolving combat commitment from its owner’s discard to hand; it cannot retrieve another copy, an action or an effectless bonus attack. Its reveal lifecycle has already resolved. `lock-card-value.value` accepts a typed `Value`, including the opposing card’s printed value.

An ongoing scheme may declare `boostBonus`, a nonnegative addition to its owner’s BOOST values. The shared `boostValue` helper computes this for payments, choice labels, Maneuver and typed card BOOST references. References and exact-card discard receipts retain their actual owning player. Combat commitments capture the paid amount for later public receipts, cancellation, card-value locks and replacement. Printed card definitions remain immutable.

`reveal-boost-draw` privately collects one exact hand card from every living nondormant player in seat order, treating empty hands as zero. No commitment, draw or reaction is disclosed/resolved before all commitments finish. It then publicly reveals the selected cards without transferring them, draws each card’s owner-adjusted BOOST amount through normal draw/exhaustion hooks, and compares the retained actual draw receipts. Each owner tied for the greatest positive actual draw count deals that many ability damage to their own hero. All commitments/receipts are private serializable tasks; projections expose only the current owner’s options and public reveal outcomes.

## Continuous ally state and alternate attacks

`allies-defeated` tests whether an owner has at least one ally and all owned allies are defeated, including off-board living allies as undefeated. Character `conditionalModifiers` declare a readable name/description, that fighter condition, and optional signed `attack`, `defense`, `movement` bonuses. Combat bonuses are evaluated after during-combat effects against current state, require a real card, survive card cancellation and card-only locks, and respect ignored values and total locks. `movement(fighter, defs, state)` and `maneuverMovement` use the same current-state modifiers in server and client.

Combat cards may declare `attackMode: { when: { type: 'allies-defeated' }, range?: 'any', faceUp?: boolean }`. The shared `canPlayAttack`, `attackModeAvailable` and `canAttackWithCard` helpers enforce the exact fighter tag, alternate defense-card eligibility, range, living participants, opposing owners and on-board positions. An attack command’s optional `faceUp: true` requires an available face-up mode. This public declaration is stored in the combat frame and visible through `committedCard`/observation before defense, including JSON reconnects and nested choices. Face-down play keeps ordinary range and secrecy. Neither intrinsic category permission nor completed targeting can be cancelled after declaration; the printed card category remains unchanged.

A combat card’s `effectsCannotBeCancelled: true` prevents suppression of that exact card. `card-has-hook` checks `{ card: 'opposing', hook }` against the opposing printed abilities, regardless of conditions or suppression; effectless bonus attacks have no printed hook. Fighter-count Values accept `exclude: PlayerRef` to omit the exact acting fighter while counting others around an anchor.

`defeat: { target, onDefeat? }` defeats a living referenced fighter directly through ordinary fighter lifecycle, bypassing damage prevention. Its continuation resolves only for an actual defeat, after death reactions, retaining card provenance and exact bindings. `choose-fighter.role` optionally limits choices to main/ally. `revive-ally.zone: 'any'` places a defeated owned ally in any empty map space; omission retains the existing anchor-zone semantics. Both selection and placement revalidate occupancy and retain serializable recovery.

`return-to-deck` accepts optional `target` and `random`. The random variant samples the affected owner’s hand without replacement using private seeded randomness and puts the sampled cards on top without public identities or discard/draw events. The ordinary variant retains ordered private selection for the affected player. `area-damage.range: 'adjacent-to-friendly'` snapshots the union of spaces physically adjacent to any living owned fighter, damages each matching fighter once, and needs no space or ordering choice. It can resolve a committed after-combat card even if its acting ally died.

Ongoing action property `preventMainAbilityDamage` prevents only ability damage to the owner’s main fighter while active. It does not stop combat, exhaustion, direct defeat, or damage to allies, and composes with existing activation, replacement and `discardUnlessAttacked` expiry.
