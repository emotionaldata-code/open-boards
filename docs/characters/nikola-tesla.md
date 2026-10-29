# Nikola Tesla import

Source: [UmDb Nikola Tesla](https://unmatched.cards/umdb/decks/nikola-tesla), fetched 2026-10-29 with the repository's source helper. Edition: **Unmatched Adventures — Tales to Amaze**. The raw source snapshot remains at `/tmp/nikola-tesla.source.json`; the maintained [printed inventory](nikola-tesla/inventory.json) records every design, quantity, restriction, BOOST and source clause.

Tesla is a solo **14-HP ranged** hero with movement **2**, **30 cards across 11 designs**, and no sidekick. Every card is restricted to Tesla. The source has no card/deck notes or source corrections.

## Rules mapping

The two interchangeable coils are a public bounded `coils` counter, initially 1 and capped at 2. Charging both adds up to the cap; charging one adds one. Private authored choices offer only affordable discharge amounts and subtract the payment before resolving its effects. A cancelled card never offers its discharge choice. The two-coil option includes the one-coil effect where the source says “Also”; “Instead” options replace the earlier effect.

Electrical Overflow charges one at owner turn end. At owner turn start, two charged coils damage each adjacent enemy and let Tesla's owner move that fighter up to one space through ordinary movement choices. Overflow does not discharge the coils. Stable fighter groups retain exact recipients through JSON recovery.

| Design                  | Copies | Rule mapping                                                                                                                                                                                   |
| ----------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7 Hertz                 |      3 | After combat, optional one/two-coil payment grants one action; two also draws one.                                                                                                             |
| The Alternating Current |      2 | After combat, charge both or, with both charged, discharge both and heal Tesla 2.                                                                                                              |
| Death Ray               |      3 | During combat, one/two coils replace the printed card value with 5/7.                                                                                                                          |
| Fully Charged           |      2 | Charge both, then gain one action.                                                                                                                                                             |
| Intense Experimentation |      3 | After combat, select the replacement draw amount before drawing: one normally, two for one coil, three plus one Tesla healing for two.                                                         |
| Kinetic Induction       |      3 | After combat, charge one; a combat win charges both instead.                                                                                                                                   |
| Lightning Storm         |      3 | After combat, one/two coils damage each enemy sharing any Tesla zone for 1/2. Each physical fighter is hit once.                                                                               |
| Polyphase Coils         |      3 | Immediate one-coil cancellation; two also ignore the opposing card's value. Defender-first immediate priority remains authoritative.                                                           |
| Remote Control          |      2 | Move every opposing fighter up to two, in Tesla's owner's chosen order, then gain one action.                                                                                                  |
| Repulsion Blast         |      3 | Move the exact opposing combatant first; optional one/two coils then move Tesla; two also makes that opponent discard one random card.                                                         |
| X-Ray Radiation         |      3 | Publicly reveal the exact opposing top-deck instance before the discharge choice. One coil discards that exact card; two also add its owner-adjusted BOOST to Tesla's attack or defense value. |

`reveal-top-card` and `discard-selected-card` are reusable declarative effects. The reveal exposes no other deck card, survives JSON reconnects as a public observation for its frame, and binds the exact instance/player privately for nested continuations. Discard reactions resolve before the successful exact-card receipt. If the revealed card has left its deck, neither another card nor a BOOST receipt is substituted. An empty deck reveals nothing but still resolves the authored continuation; no invented card/value is created. These operations do not draw, shuffle or trigger exhaustion.

## Conventions and differences

There are no intentional changes to printed cards, quantities, stats, BOOSTs, restrictions or coil effects. Separate physical coil markers are represented by their equivalent charged count. Ordinary Open Boards conventions still apply: two actions, initial hand five, hand limit seven and no automatic reshuffle. The import does not claim to reproduce unrelated cooperative Tales to Amaze rules.

## Original artwork

The portrait, transparent full-body board figure and all eleven distinct card scenes were generated with integrated Imagegen in the repository's cinematic illustrated realism direction. The portrait establishes a consistent late-Victorian inventor identity; it is reused as the reference for the other assets. Source card imagery was neither downloaded nor redistributed. Selected originals, exact prompts, sources, hashes and generation provenance live under `artwork/characters/nikola-tesla/`; browser derivatives use the normal artwork manifest and owner-colored board pedestal.

## Verification

The fixed-deck Tesla suite verifies every inventory entry, charge bounds, optional payment affordability, cancellation, each card's behavior, start/end timing, exact fighter recipients, private choices and JSON reconnects. Neutral reveal tests cover public observation, absence of unrelated private card exposure, illegal commands without mutation, decline/empty-deck behavior, exact-instance revalidation and successful receipts. Aggregate build/browser verification is recorded by the parent import task.

Tesla-specific verification on 2026-10-29 passed **31 fixed-deck/neutral rule tests**, **one artwork integrity test**, and **four focused browser scenarios**: the full eleven-card desktop/phone raster gallery, two reduced/full-motion X-Ray reconnect flows and one four-owner-color shared-texture review. Typecheck, scoped ESLint, scoped Prettier and `git diff --check` pass. Desktop/landscape-phone screenshots were visually reviewed, including the loaded transparent figures; no Tesla page errors or missing artwork were observed. Browser artifacts are in `/tmp/nikola-tesla-e2e/`, `/tmp/nikola-tesla-e2e-final/` and `/tmp/nikola-tesla-colors-e2e/`; the complete art contact sheet is `/tmp/tesla-all-art-review.png`. Full repository test/build/browser runs are owned by the aggregate import task and are not claimed by this focused result.
