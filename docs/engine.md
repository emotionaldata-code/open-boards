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
| `choose-option`         | `prompt`, `options: [{ id, label, effects }]`; owner selects one effect group.                                                                                                                                                   |

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

`teleport` adds `optional?: boolean` (default true). `optional: false` offers only legal empty spaces, without Stay. An impossible placement skips; following effects still resolve. Destination operations retain authoritative occupancy validation.

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
