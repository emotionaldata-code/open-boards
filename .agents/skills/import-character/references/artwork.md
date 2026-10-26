# Artwork and browser identity

Use the repository-local [refresh-character-art skill](../../refresh-character-art/SKILL.md) for portraits, transparent board figures, every card scene, integrated Imagegen, provenance, derivatives and visual verification. Its [art direction](../../refresh-character-art/references/art-direction.md) is the shared style source for refreshes and imports.

Source retrieval and rule fidelity remain owned by `import-character`. Supply `art.scene` for each card as a procedural fallback even with raster `art.image`. The preparation script writes canonical local image URLs; no remote hotlinks. Bundle paths accept letters, digits, `/`, `_`, `-` with `.svg`, `.webp`, `.png`, `.jpg` extensions.

Register hero/ally portraits and figures in `apps/client/src/artwork/assets.ts`. Existing `characters/art.ts` supplies the SVG fallback, with viewBox `-78 -158 156 168`, feet near y=0 and Pixi-compatible paths. Keep `illustratedCharacters` limited to playable heroes, excluding every ally ID. A generic fallback does not count as finished artwork.

Add `profiles[heroId]` with role, summary, tactic, accent and ground, and suitable reusable hero/ally marks in `characters/marks.ts`. Repeated allies share pixels and use board-generated numbers. Record generated, user-provided or licensed asset origins in import notes. Public source artwork is not automatically licensed for redistribution.
