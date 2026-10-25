# King Arthur

**Playable:** all 30 copies across 16 designs, an 18-HP melee Arthur with movement 2 and one 7-HP ranged Merlin. The [complete inventory](drafts/king-arthur/inventory.json) preserves the printed values, BOOST values, restrictions, rule text and source notes. The user authorized the reusable engine extensions on 2026-10-25.

## Source and clarifications

- Requested [UmDb deck](https://unmatched.cards/umdb/decks/king-arthur), **Battle of Legends, Volume One**.
- [Public JSON](https://unmatched.cards/api/db/decks/king-arthur), retrieved **2026-10-25T11:25:53.923Z**. The endpoint exposes no revision identifier. The unmodified snapshot is in temporary working storage at `/tmp/king-arthur.source.json`; its SHA-256 is recorded in the inventory.
- All 16 linked card scans were downloaded to temporary storage and visually inspected against the text and values. Their URLs are retained in the inventory; no published scans are redistributed.
- The deck note says cancellation only counts if a card effect is actually cancelled. **Excalibur has no effects**, so cancelling it cannot remove Arthur's special BOOST.
- Bewilderment's shared API wording says “your fighter”; its card note and Merlin scan say **Merlin**. Both refer to the exact acting ally here. Its damage prevention and its optional after-combat placement are separate clauses.
- Schemes retain their printed source value 2 in the audit; their engine category would be `action` with combat value 0. Their printed BOOST remains 2.

## Declarative rules

| Design               | Copies | Rule mapping                                                                                                                                                                           |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skirmish             | 3      | After winning, choose the acting fighter or combat opponent; move that exact fighter up to 2.                                                                                          |
| Noble Sacrifice      | 3      | During combat, `boost-attack` with a separate `card` grant; combines with the special.                                                                                                 |
| Excalibur            | 1      | Printed 6, no effects. Suppression cannot remove the special BOOST.                                                                                                                    |
| The Aid of Morgana   | 1      | After combat draw 2.                                                                                                                                                                   |
| Divine Intervention  | 2      | After combat move Arthur up to 5.                                                                                                                                                      |
| The Holy Grail       | 1      | After combat, living Arthur at 1–4 HP uses `set-health` to become exactly 8.                                                                                                           |
| The Lady of the Lake | 1      | `search-card` retrieves Excalibur from deck/discard. Choose the first pile; continue on a miss. Shuffle only if the deck was searched.                                                 |
| Prophecy             | 1      | `inspect-deck`: privately inspect up to 4, select up to 2 for hand, order the remainder from top down.                                                                                 |
| Bewilderment         | 2      | `prevent-damage` protects Merlin throughout combat; afterward optionally teleport to an empty space.                                                                                   |
| Aid the Chosen One   | 1      | After winning draw 2.                                                                                                                                                                  |
| Restless Spirits     | 1      | `area-damage`: choose a space in Merlin’s zone and one physical adjacent space; deal 2 to opposing occupants; draw once if that damage directly defeats a fighter.                     |
| Command the Storms   | 2      | Existing `for-each-fighter` with relation `any`, then move each `chosen` fighter up to 3 in the owner’s chosen order.                                                                  |
| Swift Strike         | 2      | After combat move the acting fighter up to 4.                                                                                                                                          |
| Momentous Shift      | 3      | `changed-position` compares the acting fighter with its current seat-turn starting space; `set-combat-value` in `printed` mode replaces 3 with 5 while retaining BOOSTs and modifiers. |
| Feint                | 3      | Defender-first immediate `suppress-card-effects`.                                                                                                                                      |
| Regroup              | 3      | After combat draw 2 on a win, otherwise 1.                                                                                                                                             |

Arthur’s `before-attack` grant privately commits a payment with `cancelWithCard: true`. Noble Sacrifice grants a second during-combat payment. Each grant permits one successful payment, including a zero BOOST. Payments ignore their own effects; ordinary fighter/status discard reactions still run. Suppression requires pending effects, so effectless cards and effects already resolved cannot cancel the special’s bonus. Public combat results list both payments and their applied bonuses, including zero for a cancelled payment.

The engine separates payment handling (`attack-boost.ts`), private deck operations (`deck.ts`), area selection and defeat attribution (`area.ts`), combat protection/health (`combat-effects.ts`) and combat value replacement (`combat-values.ts`). The vocabulary, validation and queue remain shared. No engine code checks Arthur’s or his cards’ IDs.

Turn positions are captured for every fighter before turn-start reactions. Moving away and back does not qualify for Momentous Shift. Searches and inspections add cards without invoking draw hooks or exhaustion. Shuffle state is private, seeded by the server and serialized with the match; reconnects resume exactly the same choices and ordering. Restless Spirits counts only its own direct damage defeats, excluding unrelated reactions and allies removed by a main fighter’s elimination.

## Original artwork

All 16 card illustrations under `apps/client/public/cards/king-arthur/` and both figures in `apps/client/src/characters/art.ts` are original code-native SVG artwork authored on 2026-10-25. The [source artwork gallery](drafts/king-arthur/art/preview.html) retains the original draft assets and four-owner-color previews. No published scans, traced paths, external fonts or network assets are redistributed.

Arthur’s silhouette has a crown, sword, armor and owner-colored mantle/shield. Merlin has a pointed hat, beard, staff and owner-colored sash. Both use the established cut-paper style and figure viewBox, support all four owner colors, and have registered ability marks. Merlin remains an ally-only figure; only Arthur appears in the playable roster.

## Compatibility and verification

No printed card clause, restriction or quantity is omitted. Schemes use the engine’s action category and combat value 0; their source value 2 remains in the audit. The import retains Open Boards’ five-card opening hand, seven-card hand limit, two shared actions, free-for-all ownership, maps/portals and elimination/exhaustion rules. This is a character import, not a claim of full Unmatched compatibility.

Focused fixed-deck tests cover the complete inventory, all restrictions, independent BOOST payments, Feint and Excalibur, pending versus resolved effects, exact health setting, deck/discard recovery and deterministic shuffling, private inspection and ordering with 0–4 cards, damage prevention/expiry, exact area targets and defeat attribution, turn-start history, movement/draw effects and forfeit cleanup. Room tests disconnect/reconnect at every new private choice stage and reject forged responses. The roster deployment test includes all two/four-seat combinations at full ally counts.

Browser tests exercise original card art and inspectors, numbered Merlin figures, keyboard and touch controls, reload recovery at each private stage and both attack BOOSTs at desktop and landscape-phone sizes, with reduced and full motion. Final suite results are recorded in [verification notes](../verification.md).
