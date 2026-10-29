# Darth Vader

Imported from [TedWatson’s Darth Vader (She-Hulk reskin, Star Wars)](https://unmatched.cards/decks/2v3B/versions/5v1oF3oZ), exact version `5v1oF3oZ` (labelled “Initial version”), retrieved 2026-10-26 through the public `/api/decks/5v1oF3oZ` endpoint. The response confirms `family_id: 2v3B` and `version_id: 5v1oF3oZ`. The source has no deck notes or supplemental rule cards. [Unmodified payload and provenance](darth-vader/source.json) and [printed inventory](darth-vader/inventory.json) retain every source clause and image URL.

Vader has **20 HP, movement 2, melee attacks, no sidekicks, and 30 cards across 12 designs**. Every card is restricted to Vader (`MAIN`). All quantities and explicit BOOSTs are preserved. Source `defence` becomes `defense`; schemes use engine `action` and value zero (source value is null). No printed rule has been dropped or adapted.

| Design                 | Copies | Value | BOOST | Rule mapping                                                                                                                                             |
| ---------------------- | -----: | ----: | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark Lord’s Presence   |      3 |     1 |     2 | Immediate opposing-card suppression; during combat, replace the printed value with 4 only when attacking.                                                |
| Inner Conflict         |      3 |     2 |     1 | After combat, the winner’s opponent chooses draw/discard for both owners. When Vader loses, Vader chooses. Each owner makes their own discard selection. |
| Surrounded by Fear     |      3 |     4 |     1 | On winning, snapshot all living adjacent fighters, regardless of owner, and damage each by 1. Vader is not adjacent to himself.                          |
| There is No Escape     |      3 |     3 |     1 | At immediate timing, lock an adjacent opposing fighter against movement and placement for the remainder of the active turn.                              |
| All Too Easy           |      2 |     5 |     2 | After dealing at least 2 combat damage, make two seeded random opposing-hand discards, or as many as remain.                                             |
| By the Emperor’s Will  |      3 |     4 |     2 | Optional, win-gated private prior-discard selection; shuffle the chosen exact instance into the owner’s deck.                                            |
| I Have You Now         |      2 |     3 |     3 | During combat, offer a private action payment only when at least one action remains; spend one to replace the card value with 9.                         |
| Form V Mastery         |      3 |     0 |     2 | During combat, publicly discard the opposing owner’s top deck card, resolve its discard reactions, then add its exact BOOST twice to defense.            |
| Power of the Dark Side |      2 |     2 |     2 | After combat, draw the resolved combat damage received, including zero.                                                                                  |
| Hunt Down and Destroy  |      2 |     — |     1 | Move Vader up to 4 through enemies; after movement, refund one action if any living opposing fighter is adjacent.                                        |
| Meditation Chamber     |      2 |     — |     1 | Mandatory placement on an unoccupied starting space (including Vader’s current starting space), then draw one and gain one action.                       |
| Unstoppable            |      2 |     — |     2 | Draw two, then heal two, respecting exhaustion, elimination and maximum HP.                                                                              |

**Force Grip** offers a zero-or-one card payment at each Vader turn start. On an actual discard, its exact card becomes a private serializable receipt; ordinary discard reactions finish before Vader chooses any living fighter in his current zone. This includes Vader himself and opposing sidekicks. Damage uses the paid card’s printed BOOST. Skipping never opens a target choice. Zero BOOST remains a legal payment. No attack BOOST permission is implied.

## Shared semantics and clarifications

The application retains its existing two-action turn, five-card opening hand, seven-card limit, exhaustion, map passages and free-for-all conventions. Each opponent means the owner/exact fighter in that combat; arbitrary opponents are not substituted. Winning follows the existing Unmatched convention: an attacker wins by dealing combat damage; a defender wins by taking none. Defender-first immediate timing governs cancellation. Suppression cancels card effects without removing printed values or fighter abilities.

Resolving combat commitments remain unavailable to discard recovery until combat finishes, so By the Emperor’s Will cannot recycle itself or the current defense. Empty deck discards neither draw nor cause exhaustion. Starting-space placement uses the map’s starts for the current two/four-seat game: printed starts in head-to-head play, and the existing custom four-seat starts in free-for-all. Occupancy and movement locks are checked both when offering and when applying placement. A movement lock lasts through the active turn even when applied while Vader is defending; it blocks movement, pushes, swaps and placement through the existing shared movement rules. Defeat, forfeit and temporary board removal continue to use their separate fighter lifecycle rules.

The new reusable vocabulary is `discard.onDiscard`, `discard-deck`, the `selected` card Value, `recover-card.destination: "deck"`, and `teleport.starting`. It is documented in [engine.md](../engine.md). Private receipt/choice continuations are absent from opponent and spectator projections and survive JSON reconnects. No character IDs appear in engine dispatch.

## Artwork

The 2026-10-29 refresh supplies an original cinematic painted portrait, a genuinely transparent full-body board figure, and twelve distinct card scenes. At the user’s request, the set uses broader space-fantasy imagery: an original unmasked human commander with a charcoal hooded cloak, weathered graphite armor and a plain steel sword, staged in blue-and-amber orbital environments. This is a deliberate visual adaptation, rather than a reproduction of Vader’s helmeted likeness. Character naming, card titles, quantities and rules are unchanged.

Selected, unmodified masters and the shared commander reference live under `artwork/characters/darth-vader/`; exact prompts, source paths, SHA-256 hashes, earlier rejected attempts and successful generations are retained in `prompts.json`, `provenance.json`, `generation-log.json` and `sources.json`. Sources use Git LFS. `pnpm artwork:prepare darth-vader` generates the hashed public WebPs, manifest entries and canonical card image paths. The shared portrait and board renderers use the registered raster assets, retaining the existing SVG fallback. No third-party card imagery is redistributed or hotlinked.

## Verification

The broader artwork refresh passed 26 focused unit tests and nine browser checks, including every card in desktop and landscape-phone inspectors, all four owner colors, numbered allies in a mixed match, normal/reduced motion, movement, defeat/revival and failed-raster SVG fallback. Master/source equality, hashes, dimensions, real alpha, transparent prepared token edges and deterministic preparation were verified. Typecheck, lint and build passed. Scoped formatting passed; the repository-wide check reports the unrelated existing `apps/client/src/animation/events.test.ts`. Details are retained in [artwork verification](../../artwork/characters/darth-vader/verification.json).

Fixed-deck tests cover all twelve source designs, exact source quantities and restrictions, friendly/self/numbered-ally targets, timing/cancellation, action availability, random discards, starting-space placement, death before recovery, private projection, forged/stale/wrong-owner choices and JSON continuation recovery. Neutral fixtures independently cover exact-card receipts through suspended reactions, deck discard order, strict validation, deterministic shuffle and placement revalidation. Browser and repository check results are recorded in [verification.md](../verification.md).
