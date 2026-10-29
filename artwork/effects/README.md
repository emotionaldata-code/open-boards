# Tabletop effects

Generated with the built-in ImageGen tool. `tabletop-vfx.png` is the original RGBA master;
`apps/client/public/effects/tabletop-vfx.webp` is the 1024 × 1024 runtime atlas (alpha preserved).
Four columns × four rows, 256 × 256 pixels per frame, no gutter. Rows are impact, healing,
selection ring and parry; frames run left to right. No character artwork or gameplay rules changed.

`apps/client/src/animation/sprites.ts` defines the typed clips, display size, anchor offset and
duration. The existing presentation clock drives playback; there is no independent ticker.
Atlas textures are shared and preloaded by the board. Each effect destroys only its own sprite.
Late loads cannot resurrect cancelled effects. Existing procedural effects cover failed loads;
reduced motion skips the sprite overlays and retains the existing readable feedback.

Normalize the master using the repository's existing Sharp dependency:

```sh
node --input-type=module -e 'import sharp from "sharp"; await sharp("artwork/effects/tabletop-vfx.png").resize(1024,1024).webp({quality:90,alphaQuality:100}).toFile("apps/client/public/effects/tabletop-vfx.webp")'
```

## Generation prompt

Use case: stylized-concept. Asset type: production 2D game VFX spritesheet for Open Boards, a dark fantasy illustrated tabletop card dueling game. Primary request: one transparent 1024x1024 PNG atlas with exactly 4 columns and 4 rows of equally sized 256x256 cells, no spacing. Each row is a separate four-frame left-to-right one-shot animation with a fixed center at the exact center of every cell, all artwork entirely within its cell with 24px clear padding. Row 1: ivory and warm gold sword impact spark, small bright contact, sharp expanding starburst, fragment scatter, faint dying embers. Row 2: mint green healing motes, gathering dots, ascending luminous soft leaves, sparkling bloom, fading dots. Row 3: warm gold magical selection ring viewed from above, small arc, forming fine circle, full runic circle with tiny sparks, dissolving circle. Row 4: pale blue shield parry impact, small central gleam, crisp angular light shards, wider scattered light fragments, fading particles. Style: polished hand-painted fantasy game effects, crisp luminous brushwork with transparent negative space, restrained elegant cinematic palette suited to parchment cards and dark green arena. Constraints: genuine transparent alpha background; absolutely no text, numbers, grid lines, borders, characters, objects or checkerboard painted into image; no cropping; maintain identical alignment frame to frame. Sheet must read as 16 separate animation frames, never one continuous composition.
