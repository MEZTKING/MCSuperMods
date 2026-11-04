# ADR 0012: Save deletes only files it loaded (SaveManifest); save is never blocked

## Context

DESIGN [Open Question 9](../DESIGN.md#18-open-questions): load skips element files that fail to parse or validate, and save deletes `content/**/*.json` files it did not write. Saving after a failed load could therefore delete the skipped files. Phase 0 mitigated this by refusing to save while error-severity problems exist, which also blocks saving whenever the user has any schema error, contrary to "errors block export, never save" ([Error surfacing](../DESIGN.md#8-editors-and-ux)).

## Decision

- `loadProject` returns a `SaveManifest`: the element file paths it actually loaded.
- `saveProject(fs, project, registry, { manifest })` writes the planned files and deletes only paths that are in the manifest and no longer planned (removed or moved elements). It never deletes a file it did not load.
- `saveProject` returns the new manifest, which the session keeps for the next save.
- Files that load skipped (invalid JSON, invalid shape, duplicate id) stay on disk. They remain error problems, carrying `Problem.file`, until the user fixes or deletes them. They no longer block saving.
- The IR types are unchanged. `.msm/` and asset bytes are untouched by save, as before. Removing an asset moves its bytes to `.msm/trash/<ns>/<path>` so that undo restores them; the trash is emptied when a project is opened or created, never on save.
- The Phase 0 "refuse to save" block is removed from core and the app.

## Consequences

- Saving can never destroy a file the user has not seen in the app.
- A newly created element can be planned at the same path as a skipped file; save then writes over that file. The app warns first: the session reports a `project.overwrites-skipped-file` warning on that element, suggesting a rename.
- Saving is always possible, so schema errors never trap unsaved work.
- Resolves DESIGN Open Question 9.

## Status

Accepted (2026-11-04). Implemented in Phase 1 (core `SaveManifest`, session save and overwrite warning).
