---
name: refresh-character-art
description: Produce and integrate original portraits, transparent board figures and card scenes for an existing Open Boards character while preserving rules and identity. Supplies the same visual workflow to new character imports.
---

# Refresh character artwork

Keep this skill repository-local. Preserve existing workspace changes; keep artwork work in presentation/tooling without changing game rules, types, commands, protocol or persistence.

## Inventory and identity

Read the bundle, import notes, `apps/client/src/artwork/`, `characters/CharacterPortrait.tsx`, `cards/CardArtwork.tsx` and `board/figures.ts`. Count distinct designs rather than copies: supply hero/ally portraits and transparent figures plus one scene per design. Repeated allies share pixels and use board-generated numbers.

Read [art direction](references/art-direction.md), the single shared style source for refreshes and imports. Preserve recognizable equipment, species and silhouette. Source artwork informs subject matter; public availability does not imply redistribution permission.

## Production

Use integrated Codex Imagegen by default, one call per final asset, without mandatory API keys or external services. Generate and inspect hero/ally portraits first, then reuse them as identity references for figures and card scenes. Request actual transparency for figures; inspect anatomy, identity, composition, alpha and unwanted text before integration.

Keep selected originals intact under `artwork/characters/<id>/masters/`, identity references under `references/`, exact prompts in `prompts.json`, and tool/date/source attribution in `provenance.json`. Copy project assets from the generator's output directory into the repository. Record generation failures truthfully; do not substitute unrelated imagery.

Source images use Git LFS and are skipped on clone by default. Follow [source artwork storage](../../../docs/artwork-storage.md): install LFS before adding originals, and explicitly fetch the relevant character's sources before inspecting references or running preparation. Keep prompts/provenance/recipes and generated public WebPs in regular Git. Originals stay out of deployment builds.

## Preparation and integration

Author `sources.json` following Medusa: `id`, `kind`, `source`, normalized `focal`; cards add `card`, tokens add normalized `anchor` and board `scale`. Focal coordinates control responsive UI crops. Token preprocessing centers the trimmed figure on a transparent 512 canvas; tune anchor/scale against the existing approximately 128px apparent height.

Run `pnpm artwork:prepare <id>`. Sharp writes hashed WebP derivatives to `apps/client/public/artwork/<id>/`, updates the client manifest and sets canonical card `art.image` to its largest derivative. Sizes: cards 320/640/1280 at 8:5, square portraits 256/512/1024, transparent tokens 512. No artificial master enlargement: the script omits oversized variants; regenerate insufficient masters when all requested sizes are needed. No generation during build/play.

Register portrait/token IDs in `artwork/assets.ts`. Use shared `ArtworkImage` and texture loading with no character-specific renderer branches. Keep pedestal, owner color, numbers, selection and animations separate. Retain SVG fallback for unmigrated fighters and failed loads. Importing still owns source/rule verification, profiles, marks and roster registration.

## Verification

Verify coverage, canonical paths, hashes, bytes, dimensions and real alpha. Repeated preparation should preserve manifest and filenames. Maintain tests for mixed SVG/raster cards, shared pending/resolved textures, failed loads and destruction during loading.

Review all scenes, portraits and figures in real desktop and landscape-phone UI, including all four owner colors, numbered allies, selection, movement, defeat/revival, reduced motion and mixed SVG/raster matches. Inspect requested variants, transferred bytes and participating texture counts. Check browser errors/missing assets. Run typecheck, lint, format check, tests, build and the full browser suite for shared UI changes; report actual failures separately. Preserve unrelated work. Deployment requires a deployment request.
