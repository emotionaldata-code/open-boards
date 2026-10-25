# Bigfoot

Imported from [UmDb: Bigfoot](https://unmatched.cards/umdb/decks/bigfoot), retrieved 2026-10-25 from its public [JSON endpoint](https://unmatched.cards/api/db/decks/bigfoot). The unmodified payload and retrieval timestamp are in [source.json](bigfoot/source.json); the complete clause, copy, tag, value, BOOST and source-image audit is in [inventory.json](bigfoot/inventory.json). UmDb provides no deck/card clarifications or separate version identifier for this payload.

Bigfoot has 16 HP, movement 3 and melee attacks. The Jackalope is one 6-HP melee ally. The deck preserves **30 cards across 11 designs**, all printed BOOSTs and all fighter restrictions.

| Design                     | Copies | Fighter   |       Value | BOOST | Rule mapping                                                                               |
| -------------------------- | -----: | --------- | ----------: | ----: | ------------------------------------------------------------------------------------------ |
| Skirmish                   |      3 | Either    | 4 versatile |     1 | Winner chooses self/opponent, then ordinary movement up to 2 after combat                  |
| Larger Than Life           |      3 | Bigfoot   |    6 attack |     3 | Printed attack; no additional effects                                                      |
| Crash Through the Trees    |      2 | Bigfoot   |      Scheme |     3 | Move self up to 5, through enemies                                                         |
| It's Just Your Imagination |      2 | Either    |   3 defense |     3 | Immediate opposing-card suppression                                                        |
| Savagery                   |      3 | Bigfoot   |    4 attack |     3 | After winning, adjacent area damage 1 with relation `any`                                  |
| Hoax                       |      3 | Either    | 4 versatile |     2 | After combat, move the exact playing fighter up to 5 through enemies                       |
| Jackalope Horns            |      3 | Jackalope |      Scheme |     2 | Move self up to 5 through enemies, then choose any adjacent fighter for 2 damage           |
| Disengage                  |      2 | Either    |    4 attack |     2 | After combat, mandatory placement in an empty space sharing a zone with self               |
| Momentous Shift            |      3 | Either    | 3 versatile |     1 | Before combat, replace printed value with 5 if this fighter changed space since turn start |
| Feint                      |      3 | Either    | 2 versatile |     2 | Immediate opposing-card suppression                                                        |
| Regroup                    |      3 | Either    | 1 versatile |     2 | After combat draw 2 if won, otherwise 1                                                    |

Loner by Nature uses a self-scoped `turn-end` passive, an enemy fighter count in Bigfoot's zone equal to zero, and an optional draw. It runs only at the owner's turn end. Any living opposing hero or ally sharing any of Bigfoot's zones blocks it. A private offer supports Skip and JSON continuation recovery. The ordinary hand limit follows end-turn abilities.

Savagery includes friendly Jackalope damage and every adjacent enemy; it excludes Bigfoot's own space. Jackalope Horns also permits friendly targets and checks adjacency **after** movement, including Stay. Its damage is mandatory when an eligible fighter exists. Hoax and the schemes can traverse opposing fighters but cannot end on occupied spaces. Disengage is placement, requires an empty destination and offers no Stay. Card cancellation preserves printed values and does not cancel Loner by Nature. A defeated Jackalope can finish committed draw effects for its surviving owner but cannot move itself.

## Shared game conventions and differences

No character rules are adapted or unsupported, and no engine extension is needed. Existing Open Boards combat-winner, movement, exhaustion, hand-limit and turn conventions apply. Scheme source `value: 2` denotes the scheme icon in UmDb; the engine stores action combat value 0 while the audit retains the raw source value. Explicit printed BOOST values remain intact. Source `ANY`, `BIGFOOT`, `JACKALOPE` map to `BOTH`, `MAIN`, `ALLY`.

## Original artwork

All delivered artwork is original code-native SVG composed for this import; no published card illustrations were copied or hotlinked. The source image URLs remain in the inventory for provenance only.

- Eleven distinct 320×200 cut-paper forest illustrations: `apps/client/public/cards/bigfoot/<source-card-slug>.svg`. Subjects include the two cryptids, broken trees, footprints, fog, antlers and a disappearing giant. Every design references its own local asset.
- Distinct Bigfoot and Jackalope portraits/miniatures: `apps/client/src/characters/art.ts`, keyed by `bigfoot` and `bigfoot-jackalope`. Bigfoot's sash and Jackalope's collar carry the owning seat color. Jackalope is excluded from the playable hero list.
- Muted forest/ochre palette, flavor profile and reusable compass/bolt ability cues are registered in the client character modules.

## Verification

Fixed-deck tests in `packages/content/src/characters/bigfoot.test.ts` audit the complete inventory and exercise end-turn ownership, optional draws, adjacent friendly damage, cancellation, exact movement recipients, card restrictions, changed-position values, winner-dependent draws and private JSON recovery. All 33 Bigfoot tests and five relevant browser scenarios pass. The full unit/integration run passes 526 tests across 40 files. Typecheck, lint, production builds and import-file formatting pass; repository-wide formatting reports only the pre-existing `apps/client/game-review.html`. See [verification notes](../verification.md#bigfoot-import-2026-10-25) for commands, browser coverage and artifact locations.
