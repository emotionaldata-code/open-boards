# Dracula

Imported from [UmDb’s Dracula deck](https://unmatched.cards/umdb/decks/dracula), **Cobble & Fog**, retrieved **2026-10-25** from its [public JSON endpoint](https://unmatched.cards/api/db/decks/dracula). The payload contains no deck/card clarification notes or revision identifier. The maintained [source inventory](dracula/inventory.json) records every printed clause, quantity, value, BOOST, tag and source image URL. The raw response was retrieved with the repository skill’s fetch helper into temporary storage.

Dracula has **13 HP**, **movement 2**, melee attacks and **three 1-HP melee Sisters**. All **30 cards across 13 designs** retain their printed quantities, BOOSTs and eligible fighters. Scheme values are normalized to zero because schemes have no combat value in this engine; the API’s placeholder value of 1 is retained separately in the inventory.

| Design                | Copies | Fighter | Value | BOOST | Implementation                                                                                   |
| --------------------- | -----: | ------- | ----: | ----: | ------------------------------------------------------------------------------------------------ |
| Feint                 |      3 | BOTH    |     2 |     2 | Immediate opposing-card suppression                                                              |
| Dash                  |      3 | BOTH    |     3 |     1 | After combat, move the playing fighter up to 3                                                   |
| Exploit               |      2 | BOTH    |     4 |     1 | After combat, draw for the playing owner                                                         |
| Ambush                |      2 | BOTH    |     2 |     3 | During combat, seeded random opposing discard; add its explicit BOOST                            |
| Feeding Frenzy        |      2 | MAIN    |     2 |     3 | Add one per living owned Sister sharing the exact opposing fighter’s zone                        |
| Beastform             |      2 | MAIN    |     6 |     4 | Private selection of zero through all remaining hand cards; add one per actual payment           |
| Do My Bidding         |      2 | MAIN    |     3 |     3 | Immediately return the attack, privately inspect the whole hand, then choose a legal replacement |
| Look Into My Eyes     |      2 | MAIN    |     1 |     2 | Add the opposing attack card’s BOOST to defense                                                  |
| Mistform              |      2 | MAIN    |     — |     2 | Place Dracula at an empty destination; gain one action                                           |
| Prey Upon             |      2 | MAIN    |     — |     4 | Damage every adjacent enemy, then heal by the total resolved damage                              |
| Baptism of Blood      |      2 | MAIN    |     — |     2 | Heal Dracula by two; restore a defeated numbered Sister in Dracula’s current zone                |
| Thirst for Sustenance |      3 | ALLY    |     3 |     3 | On winning, place Dracula adjacent to the exact opposing fighter’s space                         |
| Ravening Seduction    |      3 | ALLY    |     — |     2 | Choose any living fighter, move it up to two, then damage it per adjacent living owned Sister    |

## Rule mapping and timing

**Bloodthirsty** is an optional `turn-start` ability. Its `choose-fighter` uses `relation: any`, physical adjacency and an exact fighter ID: a friendly Sister is a legal victim. Its `damage.onDamage` continuation draws only after positive resolved damage, including defeat reactions. Prevented/cancelled damage grants no draw. Skipping and an empty target set continue the turn normally.

**Computed effects** use a serializable fighter-count expression, with relation relative to the acting owner and a separate spatial anchor. Feeding Frenzy uses the opposing fighter as its zone anchor; Ravening uses the moved fighter as its adjacency anchor after movement and its reactions. Each living owned Sister is counted once even at a multizone junction. Opposing and defeated Sisters never count. Movement allows Stay and follows normal blockers; Ravening can damage a friendly fighter or the playing Sister herself.

**Discard bonuses** are attached to the exact discard tasks, using the enclosing combat frame. Ambush selects one random hand instance through the existing private seeded stream, then adds its printed BOOST. Beastform offers zero through the available hand size, accepts each instance only once and grants one point per actual discard. Both are cancelled by a prior Feint; no payment happens when their effects are suppressed. Nested discard reactions suspend and resume without losing or duplicating payments. Combat locks and final value ignoring retain priority.

**Do My Bidding** transfers the original commitment from discard to hand without generating a new discard event. The whole opposing hand is visible only to Dracula during inspection. A second private prompt offers attack/versatile instances usable by the exact attacking fighter; neither fighter nor target changes. Choosing the returned original is legal. The selected card alone receives immediate, during-combat, after-combat and played/discarded effects; queued immediate effects of the returned card are removed. Before-attack commitments do not repeat. A newly chosen Feint resolves immediately and cannot undo the already completed replacement. Arthur’s separately paid BOOST remains committed and cannot be chosen from the hand. Defending-card effects and fighter passives do not repeat.

**Prey Upon** reuses area damage with an adjacent-to-source mode. It snapshots all opposing adjacent fighters, applies ordinary damage/prevention/death reactions, then heals once by the sum of positive resolved damage. Friendly fighters and movement-only portal neighbors are excluded. Healing caps at Dracula’s printed HP and cannot resurrect him.

**Placement** is mandatory when a legal space exists; impossible placements skip rather than stall. Mistform never moves a Sister and may place Dracula in his current space. Baptism restores the chosen original Sister ID/number at full printed HP, clears statuses/counters and preserves usage history. It still heals when no Sister can return. Thirst moves the owning main fighter, not the Sister that played it. Its explicit `allowDefeatedAnchor` permits placement beside the opposing fighter’s retained final position after a winning lethal attack; ordinary anchored placement still requires a living anchor. Destinations remain authoritative and occupancy-checked at both offer and application.

## Shared game conventions

No deck-specific balance adaptations or source-text corrections were made. This is an Open Boards import, using the shared five-card initial hand, two actions, seven-card hand limit, exhaustion and free-for-all ownership rules. Main-fighter defeat removes its allies. Victory settles after pending reactions and may result in mutual defeat; Bloodthirsty followed by lethal exhaustion follows that existing convention. Schemes follow the engine’s existing card lifecycle. There is no promise of compatibility with every tabletop ruling for characters outside the registered roster.

The existing engine represents Achilles’s second attack as an **effectless bonus without a fresh physical card**. Do My Bidding therefore leaves that bonus attack unchanged: there is no new attack-card commitment to return. Its printed defense still applies. This follows the existing bonus representation, rather than inventing a card or returning the already resolved first attack.

## Original artwork

All delivered imagery is original local vector art, authored for this import in the existing cut-paper style. No published source artwork is copied or hotlinked. The source image URLs remain in the audit for reference/provenance only.

- Thirteen separate 320×200 SVG illustrations: `apps/client/public/cards/dracula/<source-slug>.svg`, referenced individually by the bundle. Subjects include a nocturnal feint, fog flight, a blade at the chapel window, a lantern ambush, three Sisters, the beast, puppet strings, a hypnotic gaze, mist at the crypt, feeding, a blood chalice, the Sister’s summons and a closing circle.
- Dracula and Sister portraits/miniatures: original paths in `apps/client/src/characters/art.ts`. Both have visible garments in every owner color. Repeated Sisters use stable numbered board labels.
- Palette: plum ground `#302535`, pale ink `#d4bcb2`, muted crimson `#ba716f`. Reusable flame/blade marks communicate Bloodthirsty and the Sisters’ attacks.

## Verification

Fixed-deck tests cover the complete source inventory and restrictions, cancellation, computed counts, private/reconnect choices, exact recipients, attack replacement (including Feint and Arthur), prevention-sensitive healing, allied victims, Sister revival, lethal anchors, movement and all supported roster deployments at full ally counts. Room tests restore six distinct private workflows and reject forged, stale, wrong-owner and duplicate changes. Neutral engine tests cover the reusable expressions, damage receipts, discard bonuses, replacement and seeded recovery independently of Dracula.

Final check results and browser artifacts are recorded in [verification.md](../verification.md).
