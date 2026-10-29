# Hamlet

Imported from [UmDb’s Hamlet deck](https://unmatched.cards/umdb/decks/hamlet), retrieved **2026-10-29 at 17:17:28 UTC**, from the Slings & Arrows set. The unmodified API payload and retrieval provenance are preserved in [source.json](hamlet/source.json); [inventory.json](hamlet/inventory.json) records every printed value, BOOST, copy count, eligible fighter and timed clause. The source contains no additional deck/card notes.

Hamlet has **15 HP**, movement **2** and melee attacks. **Rosencrantz & Guildenstern** are one shared **6-HP melee ally**, represented by one board figure depicting both courtiers. The full **30-card deck across 12 designs** preserves every source restriction and effect. No intentional rules adaptations or unsupported source rules remain.

| Design                       | Copies | Value | BOOST | Fighter |
| ---------------------------- | -----: | ----: | ----: | ------- |
| Cruel To Be Kind             |      2 |     2 |     4 | Hamlet  |
| Uncertain Doom               |      3 |     2 |     3 | Any     |
| To Sleep, Perchance To Dream |      3 |     3 |     2 | Any     |
| The Readiness Is All         |      2 |     2 |     2 | Any     |
| The Play's The Thing         |      3 |     3 |     2 | Any     |
| Blood Will Have Blood        |      3 |     2 |     1 | Hamlet  |
| Outrageous Fortune           |      2 |     1 |     2 | Hamlet  |
| Maddening Insight            |      2 |     0 |     1 | Any     |
| The Rest Is Silence          |      2 |     2 |     3 | Hamlet  |
| Nothing Either Good Or Bad   |      3 |     2 |     1 | Any     |
| Method In The Madness        |      3 |     — |     3 | Hamlet  |
| The Ghost                    |      2 |     — |     1 | Hamlet  |

## Rule mapping and clarifications

The Question opens a mandatory private owner choice at each own turn start, after normal deployment. `not-to-be` is a public binary counter: **0 means TO BE**, **1 means NOT TO BE**. Selecting NOT TO BE creates an exact friendly-fighter choice and deals 2 ability damage to that fighter, including defeating the courtiers if necessary. The mode persists through opposing turns until the next own turn choice. TO BE modifies the shared Maneuver draw once using `draw-reason: maneuver`; it does not increase ordinary effect draws or draw for each moving ally. NOT TO BE modifies only Hamlet’s attack value, preserving card cancellation independence and leaving ally attacks unchanged.

Cruel To Be Kind offers the ordinary private combat BOOST during combat. Uncertain Doom ignores an opposing versatile defense’s entire value. To Sleep, Perchance To Dream moves the opposing fighter up to applied combat damage after a win; after a loss its healing always targets Hamlet, including when the courtiers played the card. The Readiness Is All chooses either living combat participant, places that exact fighter on any legal empty space (including its current space), then locks its movement through the current seat turn; the lock applies to normal movement, placement and swaps.

The Play’s The Thing discards one random opposing hand instance. On a win, Hamlet heals for that exact instance’s BOOST; an empty hand creates no receipt and no healing. Blood Will Have Blood checks positive applied damage to Hamlet anywhere in the current seat turn, including damage from NOT TO BE or the resolving combat. Prevented/zero damage and health missing from a previous turn do not qualify.

Outrageous Fortune publicly discards the exact top-deck card and adds its BOOST to the relevant combat value. Losing automatically returns that same instance if it remains in the owner’s settled discard; other discards and duplicate copies cannot be substituted. Empty decks do not produce a discard, bonus or recovery. Maddening Insight sets its printed defense value from the remaining hand and lets the opposing owner select a card to discard after a win. The Rest Is Silence finishes the active turn after combat; Nothing Either Good Or Bad damages the opposing combatant only when its attack was versatile.

Method In The Madness privately selects any number of hand cards, preserves the selected order on the deck bottom, then privately chooses a draw count from zero through the number actually returned. Its extra action resolves after that draw and ordinary exhaustion applies. The Ghost chooses between healing Hamlet or placing him within his current zone and gaining an action. Choosing the current space is permitted.

Combat ties use the shared Unmatched convention: the defender wins. Defeated fighters cannot be chosen for placement or healed back into play. Multiplayer “opponent” means the exact opposing combat owner; modes, hands and action budgets remain per owner. All choices, selected card receipts and movement locks serialize through JSON reconnects. New engine operations and conditions are documented in [the engine guide](../engine.md).

## Artwork

Original integrated Imagegen artwork uses a black-clad Renaissance Danish prince with a burgundy sash, silver embroidery and rapier. Rosencrantz is an auburn-bearded ochre-clad courtier; Guildenstern is a tall clean-shaven green-clad courtier. They share one ally asset while retaining two readable human silhouettes. Cinematic illustrated realism, cold castle light and restrained burgundy/teal coloring follow the repository’s shared direction. No modern adaptation design or source image is redistributed.

All **16 selected originals** (two portraits, two transparent figures and twelve card scenes), identity references, exact prompts, source recipes and generation provenance are retained under `artwork/characters/hamlet/`. **44 hashed WebPs total 3,497,472 bytes** under `apps/client/public/artwork/hamlet/`; build and gameplay never invoke generation. Eighteen integrated Imagegen calls succeeded: two unselected ally-token compositions clipped a boot toe, so the final square composition uses both complete figures with clear margins. The provenance records those quality iterations separately from generation failures (none).

## Verification

**80 focused tests across eight files pass**, including 26 fixed-deck Hamlet cases, seven neutral reusable-operation cases, localization coverage and shared discard/recovery/movement regressions. The final log is `/tmp/hamlet-final-rules.log`. TypeScript checking passed before the concurrent Bloody Mary vocabulary edit, and scoped ESLint passes; authored files are formatted and `git diff --check` passes. The final shared-checkout TypeScript retry reports `conditions.ts:170` accessing `of` on the concurrently widened `actions | action-number` value; this was reported to its owner for aggregate verification.

**Five focused browser scenarios pass**: all twelve card illustrations and inspectors on desktop and landscape phone, The Question and exact ally payment across JSON reconnect under both motion settings, optional private hand cycling on phone, and shared hero/ally textures across all four owner colors. The final ally-token composition also passes a separate current-source figure rerun; desktop/phone screenshots were visually inspected. Art masters and derivatives pass SHA-256, dimensions, bytes, canonical-path, real-alpha and transparent-token-edge checks. Consecutive preparations preserve all 16 manifest entries and 44 WebPs byte-for-byte. Screenshots are under `/tmp/hamlet-browser-final/` and `/tmp/hamlet-final-figures/`; the master contact sheet is `/tmp/hamlet-art-review.jpg`. No artwork errors or missing requests were observed.

Broad suites and production builds are coordinated by the parent import task because other imports and unrelated agent/spectator work share this checkout. No full-suite green result or deployment is claimed by this focused handoff.
