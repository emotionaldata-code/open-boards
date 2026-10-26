# Medusa import

Status: **playable**. The active bundle is `packages/content/src/characters/medusa.json`: 30 cards across 11 designs, 16-HP ranged Medusa (movement 3) and three numbered 1-HP melee Harpies. The [source inventory](drafts/medusa/inventory.json) remains a historical audit; its candidate/gap fields describe the engine before this implementation.

## Sources and corrected text

- Requested [UmDb deck](https://unmatched.cards/umdb/decks/medusa), edition **Battle of Legends, Volume One**.
- [Public JSON](https://unmatched.cards/api/db/decks/medusa), retrieved **2026-10-25T10:31:37.429Z**. The unmodified snapshot remains in temporary working storage; its SHA-256 is recorded in the inventory. The source declares no deck notes, card notes or deck-card notes and exposes no revision identifier.
- All 11 linked card scans were downloaded to temporary storage and visually inspected. Each source-image URL is preserved in the inventory. Published artwork is reference material only and is not included in this repository.
- The API adds reflective-artwork and physical-mirror exceptions to the special ability; adds mirror/reflected-damage clauses to Gaze of Stone; and adds mirror and Titania clauses to A Momentary Glance. The two card scans contain none of these additions. Their printed rules instead damage the opposing fighter after a win and a selected fighter in Medusa's zone, respectively.
- The standard turn-start ability is corroborated by the [Medusa rules reference](https://www.the-unmatched.club/rules/medusa). The publisher's [Volume One rulebook](https://restorationgames.com/wp-content/uploads/2019/07/UM-Battle_of_Legends_vol1_Rules-two-page.pdf) was downloaded and text-inspected: its character-card example confirms the standard special, 16 HP, movement 3, ranged attack and three melee Harpies.

The user requested removal of these API additions. The local inventory now uses the printed card rules and standard turn-start ability. Its `sourceCorrections` records the three corrected fields and their basis; the raw upstream snapshot and its SHA-256 remain unchanged for provenance. The public unmatched.cards API has not been modified. These source discrepancies are resolved for this import and no longer block it.

## Rule mapping

- Petrifying gaze: optional main-only `turn-start` → enemy fighter selection in Medusa’s zone → 1 damage.
- Dash (3, BOTH, versatile 3, BOOST 1): after combat move the acting fighter up to 3.
- Gaze of Stone (3, MAIN, attack 2, BOOST 4): after a win deal 8 damage to the opposing fighter.
- A Momentary Glance (2, MAIN, action, BOOST 4): choose any exact fighter in Medusa’s zone and deal 2. Includes Medusa and friendly Harpies.
- Hiss and Slither (3, MAIN, defense 4, BOOST 3): the opposing owner privately discards 1 after combat.
- The Hounds of Mighty Zeus (2, ALLY, versatile 4, BOOST 3): `for-each-fighter(friendly, ally)` → normal movement of each `chosen` Harpy up to 3. A defeated committed Harpy still resolves the card for its living owner.
- Clutching Claws (3, ALLY, versatile 3, BOOST 2): opposing owner privately discards 1 after combat, in either role, including after the acting Harpy’s defeat.
- Winged Frenzy (2, BOTH, action, BOOST 2): iterate all living owned fighters, move `chosen` up to 3 with `throughEnemies`, then optionally `revive-ally` anchored to `main`. Medusa’s position after movement determines placement even when a Harpy plays it.
- Second Shot (3, MAIN, attack 3, BOOST 3): `before-combat` → existing `boost-attack`. The owner privately selects payment or Skip; payment is discarded publicly.
- Snipe (3, BOTH, versatile 3, BOOST 1): draw 1 after combat.
- Feint (3, BOTH, versatile 2, BOOST 2): `combat-reveal` → `suppress-card-effects`. Defender resolves first; suppression follows the opposing card instance through nested effects and continuations. Printed values and fighter/status passives remain.
- Regroup (3, BOTH, versatile 1, BOOST 2): after combat draw 2 on a win, otherwise 1, with exclusive branches.

All rules are JSON data using reusable engine operations. No infrastructure branches on Medusa or card IDs. Both schemes have engine combat value 0; their source value 2 remains audit metadata only. Revival restores the same numbered instance at printed HP, clears statuses and resets initial counters while preserving usage history. Occupied destinations stay illegal. Empty groups and impossible revival placements continue.

## Base-game conventions

The import retains the project’s five-card opening hand, seven-card hand limit, two shared actions, discard at reveal, map/portals, free-for-all seats, exhaustion and elimination semantics. It does not introduce teams or claim full Unmatched compatibility. The three previously corrected source fields remain as printed; no other card text is adapted.

## Original artwork and presentation

The cinematic raster pilot (2026-10-26) supplies fifteen original images generated with Codex’s integrated Imagegen: Medusa/Harpy portraits, two transparent full-body figures and eleven dedicated card scenes. Selected masters, identity references, exact prompts and SHA-256 provenance are retained under [`artwork/characters/medusa/`](../../artwork/characters/medusa/). No published card pixels are redistributed. Run `pnpm artwork:prepare medusa` to reproduce hashed WebP derivatives and the presentation manifest; only derivatives are served from `apps/client/public/artwork/medusa/`. Cards retain canonical `art.image` references.

The original 2026-10-25 SVGs in `apps/client/public/cards/medusa/` and figure paths in `apps/client/src/characters/art.ts` remain available. Unmigrated figures and failed raster loads use the SVG path. Owner color is rendered on a separate base; stable Harpy numbering, selection and movement/revival effects remain independent of image pixels. Profile and ability marks stay separate from engine rules. Artwork production and future migrations use the repository-local [refresh-character-art skill](../../.agents/skills/refresh-character-art/SKILL.md).

## Verification

Fixed-deck tests cover the passive and every design, both combat roles where legal, defeated Harpy after-combat effects, Feint versus BOOST/Gaze/Hounds/Feint, movement ordering, moved-main revival placement and stable identities. Primitive tests cover suppression of lifecycle hooks/nested continuations, preserved values/passives, traversal/occupied endpoints, reaction deaths, optional/impossible revival, status/counter reset and subsequent defeat. Choice tests cover JSON recovery, owner-only projections and atomic forged/stale/duplicate rejection. Room tests reconnect during group, movement, ally-selection and placement choices. All 650 two/four-seat roster combinations complete legal deployment with the full ally counts. Browser and repository check results are recorded in `docs/verification.md`.
