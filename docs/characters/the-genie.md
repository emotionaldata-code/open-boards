# The Genie

The Genie is playable with all **30 cards across 12 designs**, 16 HP, ranged attacks, movement 3 and no allies. Every card is `MAIN`. The user authorized the reusable extensions on 2026-10-25; no printed rule, quantity, combat value or BOOST value has been adapted.

## Source and provenance

The [UmDb deck](https://unmatched.cards/umdb/decks/the-genie) and its [public JSON](https://unmatched.cards/api/db/decks/the-genie) were retrieved on **2026-10-25T11:25:34.423Z**. Edition: **Houdini vs. The Genie**. The API exposes no revision identifier. The unmodified [source snapshot](drafts/the-genie/source.json) retains retrieval metadata; its SHA-256 is recorded in the [complete inventory](drafts/the-genie/inventory.json).

All twelve source scans were visually inspected against the JSON. Their rules, quantities, values and BOOST values agree. The scan title “I Grant You… Death” is punctuated differently from the API’s “I Grant You Death”; the API name is retained. A scheme’s null combat value maps to engine value zero. Source notes credit designer Adil M. Geresu and the design contest; the API supplies no card or deck-card clarifications. All notes and image URLs remain in the inventory. Source artwork is not redistributed.

## Complete rule mapping

| Design                        | Copies | Value / BOOST   | Declarative rule                                                                                                                                                                                |
| ----------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your Wish is My Command       | 2      | Attack 3 / 1    | After a win, optionally pay exactly two cards, then gain one action. Hand-size guard prevents partial payment.                                                                                  |
| Wishing For More Wishes       | 3      | Versatile 3 / 2 | After combat, opposing owner draws one and resolves reactions before this owner draws three.                                                                                                    |
| Three Wishes                  | 3      | Scheme / 3      | Gain one action, then choose draw five, values fixed at four until turn end, or each opposing owner discards two. Enemy-main iteration reaches each owner once, including when they own allies. |
| This is No Parlor Trick       | 2      | Versatile 1 / 2 | During combat, replace the opposing committed value with that exact card’s printed BOOST. An absent defense remains zero.                                                                       |
| Prisoner’s Torment            | 2      | Defense 1 / 2   | After combat, draw the resolved combat damage taken, with ordinary exhaustion. Incidental effect damage does not increase the count.                                                            |
| I’ve Made Sultans Out of Less | 2      | Versatile 2 / 1 | After combat, the acting owner privately sees the opposing hand and selects one exact instance for discard. Empty hands skip automatically.                                                     |
| Imprisoned Wrath              | 2      | Attack 3 / 1    | Optionally pay exactly two cards, then deal two to an adjacent enemy fighter of any opponent.                                                                                                   |
| I Grant You Death             | 3      | Versatile 2 / 1 | Optionally deal one to any adjacent fighter, including a friendly ally.                                                                                                                         |
| I Am Freed                    | 2      | Attack 3 / 2    | Mandatory teleport into an empty space, then deal one to every fighter adjacent to the new position, including friendly pieces.                                                                 |
| Back In The Lamp              | 3      | Defense 0 / 1   | Defender-first immediate healing for four, capped at starting HP, before combat damage.                                                                                                         |
| Careful What You Wish For     | 3      | Attack 4 / 2    | After a loss, deal one to a chosen adjacent enemy fighter, which need not be the combat opponent.                                                                                               |
| Feint                         | 3      | Versatile 2 / 1 | Immediately suppress pending opposing-card effects, preserving printed values, passives and already-resolved effects.                                                                           |

**Infinite Power:** optional turn-start ability, guarded by `hand >= 1`; discard exactly one before gaining one action. Skip retains the normal two actions. All player operations affect the fighter’s owner; physical effects target exact fighter instances.

## Shared engine extensions

The bundle uses small serializable hooks with no character/card-name branches:

- `set-combat-value` replaces a selected combatant’s value during `before-combat`. `Value` can read a committed card’s printed `value` or `boost`, including `card: "opposing"` in either role. Parlor Trick uses the resolved-value replacement; other content can replace only the printed component with `mode: "printed"`.
- `StatusDefinition.combatValue` supplies a continuing replacement and optional lock. Three Wishes applies the reusable `fixed-four` status for one owning turn. Status replacements run after initial modifiers/BOOST; a lock blocks further replacement, additive modifiers and BOOST adjustments. Locks take precedence over unlocked replacements. Ordinary unlocked effects resolve in defender-first timing order. A later Feint cannot remove an already-resolved scheme/status. Printed BOOST values remain unchanged, and a declined defense never acquires a card value.
- `draw.count` accepts a bounded `Value`, evaluated once when the effect executes and clamped to 0–100. Torment reads the combat frame’s resolved `amount`; damage prevention/reduction is reflected. Defeated owners cannot draw. Existing draw hooks and exhaustion remain in force.
- `discard.chooser` separates the private chooser from the affected owner. Cross-owner choices carry card identity and definition only in that chooser’s projection, allowing full artwork/rules inspection. The queue retains exact-instance discard tasks privately. Existing authority, stale/duplicate validation, JSON recovery and room reconnect apply without a new command.
- `teleport.optional: false` removes Stay while preserving legal empty destinations, occupancy validation and recovery. No legal destination skips that impossible placement; subsequent effects continue. Existing teleport remains optional by default.

The shared engine still controls private information and validates commands. Content, engine rules, transport projection and presentation remain separate.

## Original artwork and registration

The 2026-10-26 refresh installs fourteen original cinematic illustrations: a hero portrait, a genuinely transparent board figure and one scene for each of the twelve designs. The Genie retains blue-green skin, an ivory turban, gold ornaments and a smoke lower body. Identity references, untouched PNG masters, [exact prompts](../../artwork/characters/the-genie/prompts.json), [crop and board placement settings](../../artwork/characters/the-genie/sources.json), and [generation provenance with master hashes](../../artwork/characters/the-genie/provenance.json) are retained under `artwork/characters/the-genie/`. Codex integrated Imagegen generated each asset separately using the portrait as the identity reference; no source scan pixels were reused. No ally art is required.

`pnpm artwork:prepare the-genie` produces forty hashed WebP files under `apps/client/public/artwork/the-genie/`: 320/640/1280 card widths, 256/512/1024 square portraits and one transparent 512-pixel figure. All variants total 4,006,314 bytes. The figure uses a 0.27 scale and bottom anchor, preserving the existing approximately 128-pixel apparent height; the shared renderer supplies pedestals, owner colors, selection and animation. The existing original SVG illustrations and miniature remain available as fallbacks. Repeated preparation preserves the manifest and filenames. Only card `art.image` paths changed in the canonical bundle; rules, quantities and values are unchanged.

The full bundle is registered in `packages/content/src/characters.ts`; profile, miniature, ability mark and value-lock status visual are registered in the client. Cards share the existing hand, gallery and inspector. Cross-owner private choices reuse those same card components, including keyboard-accessible inspection.

## Verification

The fixed-deck suite checks the complete source inventory and snapshot hash, every design, payments and Skip, both versatile roles, exact fighter restrictions, all attacking-card Feint interactions, lock/setter/modifier/BOOST precedence, expiry, exhaustion, lethal damage, private projections, forged/duplicate choices and JSON recovery. Room tests restore both hand selection and mandatory placement across disconnect/reconnect with unchanged continuations.

Browser scenarios exercise the production engine and private projections on desktop and landscape phone with reduced and full motion: scheme choice, private hand artwork and inspector, keyboard activation, recovery at each prompt, mandatory placement and post-placement damage. The roster scenario checks every illustration and its inspector.

Verification on 2026-10-25:

- **35 Genie tests pass**: 33 source/rules cases and two real room-reconnect cases. Rechecked after the concurrent shared-engine changes.
- Typecheck, ESLint and client/server production builds pass. The builds report upstream Zod annotation notices and a client chunk-size notice.
- An earlier complete unit/integration run passed **283 tests**. A later run passed **284 of 285**; the sole failure was a missing `cards/achilles/battle-frenzy.svg` from another concurrent import. No Achilles files were changed by this task.
- A full 29-scenario browser run was attempted on isolated ports. Live edits to shared engine files reloaded its sessions and temporarily imported `./hand` before that module existed. The run was stopped after 4 passes, 3 failures and 1 interrupted case; 21 did not run. This is **not** a clean full-suite result. Artifacts are in `/tmp/open-boards-genie-complete/`.
- Prettier passed before further concurrent changes. The final global formatting check reports in-progress shared/import files; those unrelated edits were left untouched. Genie-specific files are formatted.

**All four focused Genie browser scenarios pass** in one final run (23.7 seconds): both motion settings, real-socket selection/reload/payment, and all twelve gallery/inspector designs on desktop and landscape phone. No missing Genie assets, page errors or viewport overflow were detected. Reviewed final artifacts are in `/tmp/open-boards-genie-final/`; the standalone owner-color preview is in `drafts/the-genie/art/the-genie-owners.svg`. The isolated client disabled file watching for that final run to prevent other tasks’ live edits from reloading test sessions.

The import retains the project’s opening hand, hand limit, exhaustion, elimination, reveal/discard timing, portals and free-for-all conventions. It does not claim complete Unmatched compatibility. No publishing or deployment was requested.

## Artwork refresh verification — 2026-10-26

All fourteen untouched masters and their prompt references were checked against provenance hashes. Derivative checks cover full design coverage, canonical paths, encoded byte counts, SHA-256 filename hashes, WebP dimensions and real token alpha (0–255). Preparation is repeatable with the final focal settings. The board figure is 129.6 pixels tall before board scaling and transfers 74,246 bytes once across four owners.

Desktop (1440×1000) and landscape-phone (844×390) screenshots were reviewed for every card scene, the portrait and the figure. The raster-gallery review requested twelve 320-pixel card previews and twelve 640-pixel inspectors, plus portrait variants: 26 Genie image requests and 1,350,668 encoded bytes. Both motion modes cover selection, movement, defeat and revival across all four owner colors. Shared checks retain numbered allies, mixed SVG/raster rendering, failed-load fallbacks, shared pending/resolved textures and destruction during loading. The Genie has no allies; revival is exercised as a renderer lifecycle check, not an additional Genie rule.

Verification results:

- Full unit/integration suite: **715 tests pass across 54 files**. The focused Genie/artwork/texture/figure subset also passes all **46 tests**.
- **15 distinct focused browser scenarios pass**, verified through the combined artwork/gameplay run and a focused rerun of the final inspector scenario. This covers all four Genie gameplay/gallery scenarios, the Genie raster gallery and both figure lifecycle motion settings, plus the shared artwork checks. Test selectors follow the current board-based choices and inline phone roster. The inspector test checks its actual viewport bounds while allowing the landing page to scroll vertically.
- Final typecheck, ESLint, formatting and client/server builds pass. A transient typecheck failure in concurrently edited engine files was resolved by that work; no engine files were changed for the artwork refresh. Builds retain upstream Zod annotation and client bundle-size notices.
- No missing Genie images or browser errors were detected. Final browser artifacts are under `/tmp/open-boards-genie-art-complete/` and `/tmp/open-boards-genie-inspector-final/`; crop-review artifacts are under `/tmp/open-boards-genie-art-final/`.

The refresh changes presentation assets, their registration and artwork verification only. No deployment was performed.
