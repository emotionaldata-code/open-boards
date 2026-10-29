# Eight-character import verification — 2026-10-29

All eight requested dedicated agents used `gpt-6.1-sol` with high reasoning and the repository-local import-character workflow. They ran in waves because the runtime permits three child agents concurrently. All eight completed before the user’s **20:35 Europe/Rome** deadline; no agent required interruption.

The [selection audit](2026-10-29-import-selection.md) contains the original UmDb links, selection reasons and remaining catalog entries. Each import note below records the source snapshot, printed inventory, rule mapping, artwork provenance and character-specific checks.

| Import                                  | Copies | Printed designs | Selected original assets |
| --------------------------------------- | -----: | --------------: | -----------------------: |
| [Nikola Tesla](nikola-tesla.md)         |     30 |              11 |                       13 |
| [Harry Houdini](harry-houdini.md)       |     30 |              13 |                       17 |
| [Little Red Riding Hood](little-red.md) |     30 |              12 |                       16 |
| [Beowulf](beowulf.md)                   |     30 |              12 |                       16 |
| [Hamlet](hamlet.md)                     |     30 |              12 |                       16 |
| [Bloody Mary](bloody-mary.md)           |     30 |              13 |                       15 |
| [Jekyll & Hyde](jekyll-hyde.md)         |     30 |              13 |                       15 |
| [Golden Bat](golden-bat.md)             |     30 |              12 |                       14 |

The roster grows from **18 to 26 heroes**, retaining the original ordering and Medusa default. The additions supply **240 card copies**, **100 authored card entries representing 98 printed designs**, and **122 original Imagegen assets**: 98 card scenes plus portraits and transparent figures for twelve fighter identities. Little Red’s three Into the Woods symbols use separate rules entries with the same printed illustration, accounting for the two extra entries. The complete roster contains 335 entries with 333 unique illustrations; tests permit only that exact three-card artwork alias group.

No imported printed rule is knowingly omitted or intentionally rebalanced. Engine representation details, including scheme combat-value normalization and the existing shared game conventions, are recorded in each import note. Existing Italian translations were preserved; five incidental rewrites of shared strings were restored before the final browser rerun.

## Integrated checks

Verification used an isolated copy at `/tmp/open-boards-eight-verify-20261029`, a backend on port 2608 and a frontend on port 5208 with source watching disabled. Corrections were synchronized between runs. Concurrent bot/spectator work was preserved and included as it existed at snapshot time. Final source comparison found no runtime-source differences between the working tree and verified copy.

- TypeScript, global ESLint and both production builds pass. Build output retains the existing client chunk-size advisory.
- Global Prettier reports only `apps/client/src/animation/events.test.ts`, which was already flagged before this batch. Authored changes are formatted, and `git diff --check` passes.
- The unrestricted unit attempt was stopped after 300 seconds. A subsequent run explicitly excluding ten existing exhaustive deployment-matrix cases passes **1,311 tests in 95 files**, with those ten cases skipped. Their test definitions remain intact. This is not an unrestricted full-suite green result.
- The successful regression includes every imported source inventory, all raster metadata/hash/alpha checks, private choices and JSON recovery, existing character behavior, room/protocol checks, and seeded roster self-play. All thirteen tested pairings covering the 26 heroes finish, including Tesla/Houdini, Little Red/Beowulf, Hamlet/Bloody Mary and Jekyll/Golden Bat.
- The integrated browser run covering all eight imports passes **42 scenarios**. It checks every new card gallery and inspector on desktop/landscape phone, rule decisions, reconnects, keyboard interaction, both motion settings, four owner colors and shared figure textures. A final **44-scenario rerun passes** after restoring shared translations: the same 42 import scenarios plus both affected Arthur cases.
- Six focused localization, card-artwork and profile checks also pass after restoring those translations (`/tmp/batch-eight-final-copy-tests.log`).
- All **303 distinct browser scenarios** were executed across the full attempt, its continuation and focused retries. Latest results are **258 passed / 45 failed**. Eredin’s interrupted gallery was rerun successfully. The broader suite is not green; no new-character browser scenario remains failing.

## Remaining broader browser failures

These results remain explicit rather than being hidden by relaxed assertions. Failures include stale translated-copy expectations, existing canvas/audio/room UI synchronization, portal wording and other older socket flows. One cinematic invitation test hard-codes port 5173, while this isolated runner uses 5208.

| Existing scenario file            | Remaining failures |
| --------------------------------- | -----------------: |
| `tests/e2e/achilles.spec.ts`      |                  4 |
| `tests/e2e/cinematic.spec.ts`     |                  6 |
| `tests/e2e/dracula.spec.ts`       |                  2 |
| `tests/e2e/game-chrome.spec.ts`   |                  3 |
| `tests/e2e/invisible-man.spec.ts` |                  2 |
| `tests/e2e/matches.spec.ts`       |                 19 |
| `tests/e2e/the-genie.spec.ts`     |                  4 |
| `tests/e2e/utilities.spec.ts`     |                  5 |

## Evidence

- `/tmp/batch-eight-final-unit-verified.log`: 1,311 passing tests, ten excluded stress cases.
- `/tmp/batch-eight-full-unit.log`: unrestricted attempt, stopped at 300 seconds.
- `/tmp/batch-eight-final-typecheck.log`, `/tmp/batch-eight-final-lint.log`, `/tmp/batch-eight-final-format.log`.
- `/tmp/batch-eight-final-client-build.log`, `/tmp/batch-eight-final-server-build.log`.
- `/tmp/batch-eight-full-browser.log`, `/tmp/batch-eight-remaining-browser.log`, `/tmp/batch-eight-eredin-browser.log`.
- `/tmp/batch-eight-imports-browser.log`: 42 passing import scenarios.
- `/tmp/batch-eight-final-browser.log`: final 44-scenario passing rerun.
- `/tmp/batch-eight-browser-results.json`: latest result for each of the 303 distinct scenarios.
- `/tmp/open-boards-eight-browser/final/`: final reviewed desktop/phone screenshots; the `full/`, `remaining/` and `eredin-retry/` sibling folders preserve broader evidence.

No commit or deployment was made. The isolated verification processes were stopped after checks; unrelated development processes and workspace changes were preserved.
