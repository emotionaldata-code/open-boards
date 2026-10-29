# Source artwork storage

Source images under `artwork/` use Git LFS, with their existing paths preserved. `.gitattributes` covers PNG, JPEG, WebP, PSD and TIFF sources. Prompts, provenance, generation logs, crop settings and preparation recipes remain ordinary Git files. Browser-ready derivatives in `apps/client/public/artwork/` also remain ordinary Git files: running, testing and building the game needs no source-image download. `.dockerignore` excludes the entire source directory from builds.

## Editing artwork

Install [Git LFS](https://git-lfs.com/) and enable it for this checkout:

```bash
git lfs install --local
# Download sources for the character you are editing; override the default exclusion.
git lfs pull --include="artwork/characters/medusa/**" --exclude=""
pnpm artwork:prepare medusa
```

For maps, use `--include="artwork/maps/king-solomons-mine/**"`. To download all sources, use `git lfs pull --include="artwork/**" --exclude=""`. To automatically download all artwork on future checkouts in an artist's clone, override the repository default with `git config --local lfs.fetchexclude ""`.

Keep selected originals unmodified. Add new source images, their prompts/provenance/recipes and generated derivatives together. `git add` stores matching source images as small LFS pointers while retaining the full images locally. `git lfs ls-files` lists them. The LFS pre-push hook uploads their contents before the Git push; do not bypass it. Every contributor who adds source images must have LFS installed. The remote needs enough LFS storage for the sources.

The repository's `.lfsconfig` skips automatic source downloads by default, including in deployment clones. A skipped source is a small text pointer until explicitly fetched. Fetch the relevant sources before preparing artwork or using them as generation references. Code, content, prompts and the game remain usable without fetching originals.

## Existing history and deployment

The initial conversion changes the current source files to LFS pointers without rewriting published commits. Old commits still contain their original Git blobs. Merely adding attributes or deleting local files cannot remove those historical blobs. Use shallow deployment clones (for example `GIT_LFS_SKIP_SMUDGE=1 git clone --depth=1 --single-branch --branch deploy/open-board <repository>`). Configure checkout options in the deployment provider; application runtime variables take effect after checkout and cannot control it.

Removing sources from historical commits requires a separate, coordinated [Git LFS history migration](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-migrate.adoc): back up the repository, agree on affected branches/tags, migrate the source-image patterns, upload and verify all LFS objects, and validate builds from a fresh clone before publishing rewritten refs. Commit IDs change, branch protection may need coordination, and collaborators/deployment checkouts must be replaced or resynchronized. This setup does not rewrite or force-push existing history.
