# Robin Hood import

Imported from [UmDb: Robin Hood](https://unmatched.cards/umdb/decks/robin-hood), public API `/api/db/decks/robin-hood`, retrieved 2026-10-25 at 21:23:03 UTC. Edition: **Robin Hood vs. Bigfoot**. The source has no deck/card clarifications or version number. The [maintained inventory](robin-hood/inventory.json) records all source clauses, values, explicit BOOSTs, quantities, fighter tags and image references. The unmodified retrieval snapshot is `/tmp/robin-hood.source.json` during import; runtime content has no dependency on it.

Robin has **13 HP, movement 2 and ranged attacks**, with **four 1-HP melee Outlaws**. All **30 cards across 11 designs** are preserved. `ROBIN` maps to MAIN, `OUTLAW` to ALLY and `ANY` to BOTH. Hit and Run belongs to Robin and every Outlaw: only the attacking piece receives the optional movement after attack. Stay declines movement without an extra prompt. After-combat card effects finish first; Feint cannot cancel fighter passives.

| Card                  | Copies | User | Value / BOOST | Rule mapping                                                                                                                                                                                    |
| --------------------- | -----: | ---- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ambush                |      2 | BOTH | 2 / 3         | During combat: seeded random opponent discard; add its explicit BOOST to attack. Empty hand adds zero.                                                                                          |
| A Hunter's Eye        |      3 | MAIN | 5 / 4         | Printed attack only.                                                                                                                                                                            |
| Steal From the Rich   |      3 | MAIN | scheme / 3    | Draw once, select an opponent, then privately delegate the choice to that opponent. They discard a chosen hand card or let Robin draw again. An empty hand automatically yields the extra draw. |
| Disarming Shot        |      2 | MAIN | 4 / 3         | After combat: draw resolved combat damage using `draw.count: { event: "amount" }`, before Hit and Run.                                                                                          |
| Piercing Shot         |      2 | MAIN | 2 / 3         | After combat: draw 2.                                                                                                                                                                           |
| Defenders of Sherwood |      2 | BOTH | 3 / 2         | After combat: draw 1, then mandatory defeated-ally selection/placement in Robin's current zone, if possible. Any numbered Outlaw can return, including the card's defeated defender.            |
| Highway Robbery       |      4 | ALLY | 2 / 2         | Immediately: suppress the exact opposing card's effects and ignore its entire defense value. Defender-first Feint cancels both effects.                                                         |
| Snark                 |      3 | BOTH | 3 / 1         | After combat: test current adjacency of the exact participants, then draw 1 if adjacent.                                                                                                        |
| Wily Fighting         |      3 | BOTH | 3 / 1         | After combat: snapshot adjacent enemies; choose their damage order through the existing fighter-group operation. Resolve all hits before retreat.                                               |
| Feint                 |      3 | BOTH | 2 / 2         | Defender-first immediate opposing-card suppression.                                                                                                                                             |
| Regroup               |      3 | BOTH | 1 / 2         | After combat: draw 2 on a win, otherwise 1; blocked attacks count as defensive wins.                                                                                                            |

## Reusable capabilities

`choose-option.chooser` accepts a fighter reference. Its owning player receives the private prompt, while effects retain the original owner, frame, selected fighter and card provenance. This lets Steal From the Rich hand the decision to its selected opponent without changing who draws or which hand discards. JSON continuations and ordinary authoritative choice commands are unchanged.

`ignore-combat-value` now supports `combat-reveal` in addition to `before-combat`, preserving Highway Robbery's printed immediate timing. Later modifiers/setters cannot restore an ignored value; defender-first suppression and named-card protection continue to use the existing rules.

## Shared rules and differences

No card or special was adapted or omitted. As for other imported decks, the application uses its existing five-card opening hand, two actions, seven-card hand limit, exhaustion, multiplayer elimination, graph movement and map. Action cards normalize their non-combat engine value to 0 (the source export lists 2 for Steal From the Rich); that raw value is retained in the inventory, and its BOOST remains 3. Source cards do not grant their effects while merely in a hand or discard pile. Original card artwork is replaced by original local illustrations. These are application conventions, not a claim of complete Unmatched rules equivalence.

## Original artwork

All assets are original code-native SVG cut-paper illustrations, authored for this import. Source card images were inspected for identity and themes; no published illustration was copied or redistributed. Robin's feathered cap, bow and owner-colored tunic distinguish him from the hooded, axe-bearing Outlaws. Both figures use visible owner colors in `apps/client/src/characters/art.ts` and share the existing portrait/miniature renderer. Four repeated Outlaws retain stable numbered labels.

Every design has a distinct 320×200 SVG under `apps/client/public/cards/robin-hood/`: `ambush.svg`, `a-hunter-s-eye.svg`, `steal-from-the-rich.svg`, `disarming-shot.svg`, `piercing-shot.svg`, `defenders-of-sherwood.svg`, `highway-robbery.svg`, `snark.svg`, `wily-fighting.svg`, `feint.svg`, and `regroup.svg`. Forest silhouettes, bows, fallen weapons, a purse, defenders and a campfire supply separate compositions. No remote image references or executable SVG content are used.

## Verification

The import has 29 fixed-deck/content tests, four room reconnect tests and two neutral engine tests. The complete suite passed 539 unit/integration tests. Seven relevant browser scenarios pass across desktop and landscape phone: all five deterministic Robin flows, the full roster/card gallery and four-seat actual-socket deployment/reconnect with sixteen Outlaws. Original artwork, owner colors, numbered allies, printed card crops/inspectors, keyboard/touch controls and reduced/full motion were reviewed. See [verification notes](../verification.md#robin-hood-import-2026-10-25) for artifacts and broader-suite results.
