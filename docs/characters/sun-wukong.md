# Sun Wukong

Imported from [UmDb](https://unmatched.cards/umdb/decks/sun-wukong), retrieved 2026-10-29. Edition: **Battle of Legends, Volume Two**. The [source inventory](sun-wukong/inventory.json) retains the unmodified deck payload, API URL, retrieval timestamp, notes and all printed clauses.

Sun Wukong has **17 HP, movement 2, melee attacks**, and **three 1-HP melee Clones**. His **30-card deck contains 12 designs**. Every card has the printed ANY restriction (`BOTH`), and preserves its quantity, combat value and explicit BOOST. Scheme combat values normalize from null to zero.

| Design              | Copies |       Value | BOOST | Rule mapping                                                                                                                                |
| ------------------- | -----: | ----------: | ----: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Infinite Strikes    |      3 |    2 attack |     2 | During combat count other living owned fighters physically adjacent to the opponent; gain one action after combat.                          |
| Ruyi Jingo Bang     |      3 |    0 attack |     3 | After a defended attack, schedule effectless Tricked You (4), retaining the exact combatants and source BOOST. Versatile defense qualifies. |
| Taunting Laughter   |      3 |    3 attack |     2 | Immediate opponent-owned optional discard; decline ignores the opposing value. Payment remains available without a defense.                 |
| Ox Form             |      2 |    7 attack |     2 | Intrinsically uncancellable; during combat the opponent may BOOST an actual defense card.                                                   |
| 72 Transformations  |      3 | 2 versatile |     2 | After combat privately recover an Ox Form, Tortoise Form or Phoenix Form from prior discards.                                               |
| Sly Monkey          |      4 | 2 versatile |     3 | Only the main fighter places itself in an empty current-zone space, then summons a Clone in its vacated space.                              |
| Wily Fighting       |      3 | 3 versatile |     1 | After combat, one ability damage to each physically adjacent enemy fighter.                                                                 |
| Bewilderment        |      2 |   0 defense |     2 | Prevent damage for the combat; optionally place the exact acting fighter in any space afterward.                                            |
| Golden Chain Mail   |      2 |   4 defense |     2 | During combat redirect damage to the opposing fighter, retaining combat damage and defender victory.                                        |
| Tortoise Form       |      2 |   5 defense |     2 | During combat grant the attacker a separate optional BOOST.                                                                                 |
| Fiery Eyes That See |      2 |      scheme |     1 | Choose an opposing player, privately select an exact hand card for their deck bottom, then each owner draws one.                            |
| Phoenix Form        |      1 |      scheme |     1 | Heal the owning main fighter once per living board Clone, even when a Clone plays the scheme.                                               |

The turn-start optional summon pays one damage after choosing a legal adjacent empty destination. The Clone pool retains three stable numbered instances. Reserve Clones must be used before relocating living Clones; when all three are on the board, any one may be relocated. Defeated/reserve instances restore printed health and reset physical state without resetting usage history. No Clones deploy at setup.

## Clarifications and shared conventions

The [publisher rulebook](https://restorationgames.com/wp-content/uploads/2021/11/UM-Battle_of_Legends_vol2_Rules-two-page.pdf), pages 16–17, supplies the reserve-first/all-on-board summoning and bonus-attack rules. The [endorsed rulings archive](https://docs.google.com/document/d/13b-FbPq_vuqcc3IokeHvQ2ctJaDNZZuUaZmt4uft5h0/edit), exported and checked 2026-10-29, clarifies Sly Monkey's movement-before-summoning order and failure when there is no empty destination, additive BOOST grants, defender victory under Golden Chain Mail, and Taunting Laughter's optional payment without a defense. Ruyi's source spelling “Jingo” is retained; the archive uses “Jingu”. The generic Bewilderment source note refers to Merlin's version and does not restrict this ANY card to Wukong.

No printed rule is omitted and no balance adaptation was requested. Open Boards retains its shared five-card opening hand, two-action turns, seven-card hand limit, exhaustion, and free-for-all conventions; teams are not implemented. Source data and artwork remain outside engine Definitions. New operations are reusable and contain no character/card ID branches.

## Original artwork

Sixteen original assets were generated with **integrated Codex Imagegen on 2026-10-29**: two portraits, two truly transparent figures, and twelve separate card illustrations. The hero portrait established the identity; the Clone portrait, figures and scenes use portrait references. No source deck artwork is redistributed. All calls succeeded.

Selected originals, identity references, exact prompts, source paths and attribution are under `artwork/characters/sun-wukong/`. `sources.json` supplies crops, token anchors and scale. `pnpm artwork:prepare sun-wukong` creates 44 responsive hashed WebP derivatives (5,474,504 bytes), registers their manifest and sets canonical card URLs. PNG sources use Git LFS. Browser assets remain ordinary Git files. The current client uses raster registration for both identities; the concurrently removed SVG fallback registry was preserved as removed.

## Verification

The final focused regression run passes **88 tests across six files**, including all 26 fixed-deck import cases and 13 neutral summoning/redirection cases. Coverage includes source quantities and clauses, reserve setup and full ally counts in two/four-seat rosters, exact recipients, additive opponent BOOSTs, cancellation, damage redirection and combat victory, nested damage/movement reactions before Clone selection, private projections, forged/wrong-owner rejection and JSON recovery. Existing token, loadout/ongoing, hero-selection BOOST and bonus-combat tests pass in the same run (`/tmp/wukong-final-regression.log`).

**Eight relevant browser scenarios are verified** against current source: seven gallery, four-owner-color and deterministic rules/reconnect cases pass in `/tmp/wukong-verified-browser.log`; the real socket scenario passes separately in `/tmp/wukong-socket-verified.log`. The socket test waits for the authoritative revision before reloading, then restores the Clone selection and shared Maneuver on a landscape phone. Both motion settings, keyboard controls, all twelve card inspectors, dedicated portraits/figures, numbered Clones and owner colors were reviewed. All sixteen original scenes/figures were visually inspected. No Wukong artwork errors or missing requests were observed. Screenshots are under `/tmp/wukong-verified-browser/` and `/tmp/wukong-socket-verified/`.

All sixteen masters match generator outputs and recorded SHA-256 hashes. Derivative hashes, sizes, dimensions, alpha and canonical card paths pass the asset audit. Repeated preparation preserves all sixteen entries and 44 variants, and all 264 pre-existing manifest entries remain unchanged. Typecheck, ESLint, production client/server builds, scoped formatting and whitespace checks pass. Global Prettier reports the unrelated `apps/client/src/animation/events.test.ts` and concurrent `packages/content/src/characters/sinbad.json`; these were preserved.

The full repository checks were attempted and are **not globally green**. The unfiltered unit run (`/tmp/wukong-full-tests2.log`) reports 1,016 passed / 17 failed and five worker timeout errors. It overlapped final rule/fixture edits, includes superseded Wukong fixture failures, concurrent Sinbad artwork/localization/Leap Away failures, and exhaustive Geralt/Medusa deployment timeouts. Fresh focused runs above verify the final Wukong implementation. A separate Geralt deployment audit passes after giving enlarged-roster loops a longer limit and periodic event-loop yields (`/tmp/wukong-geralt-deployment-final.log`). Reserve-aware assertions retain full source ally counts.

The full browser attempt ran all **259 scenarios: 150 passed / 109 failed** (`/tmp/wukong-full-browser-parallel.log`). A managed test server shut down when an overlapping focused run ended, causing later connection failures. All 109 failed cases were retried against a persistent server: **63 passed / 46 failed** (`/tmp/wukong-browser-retry.log`). Remaining failures include stale English assertions against Italian UI, concurrent Sinbad flows and socket registration/server-unavailable cases. Wukong's socket scenario passes against a fresh isolated server with unchanged limits, as recorded above. No full-suite green result is claimed.

The broader fresh unit snapshot excluding ten long deployment audits passes **1,022 tests**, with one localization failure for concurrent Sinbad strings (`Sinbad` and `Draw 3 cards.`). Its log is `/tmp/wukong-current-unit.log`; final verification details are also recorded in `docs/verification.md`. No deployment was performed.
