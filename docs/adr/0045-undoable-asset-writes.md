# ADR 0045: Undoable asset byte writes (command effects)

## Context

The command stack ([DESIGN §4](../DESIGN.md#command-stack-and-undo)) records Immer patches of the project document only; asset bytes live outside it. Asset removal is undoable because the session watches asset records: a record that disappears moves its bytes to `.msm/trash/<ns>/<path>`, and one that reappears moves them back ([ADR 0012](0012-save-deletes-only-loaded-files.md)). Replacing the bytes of an asset whose record stays has no record change to watch. So the Creator's "Update <flow>" ([ADR 0043](0043-creator-guided-flows.md) D4), which rewrites untouched textures after a colour change, wrote the bytes before the changeset like an asset import: one Undo restored the elements but left the new texture bytes (B184). The AI helper's Apply ([ADR 0041](0041-ai-helper.md) D5) only creates assets, which the record rule already covers.

## Decision

- `@msm/core`: a `ProjectCommand` may carry `effects` (`CommandEffect { type, data? }`), side effects outside the document. The stack never performs them: it stores them in the history entry and hands them to subscribers in `CommandEvent.effects` with every `execute`, `undo` and `redo` (empty for `reset`). Hosts perform them in order on execute and redo and revert them in reverse order on undo. A command whose recipe changes nothing is still recorded when it carries effects (an undo step that makes the project dirty). Coalesced commands merge their effects. Core still knows nothing about bytes: asset commands change only `Asset` records.
- App session: `applyChangeset(items, label, { writes })` takes bytes to write over asset files. Before the command it validates each write as an asset import does (refusing the whole Apply on a bad one), keeps the current bytes in `.msm/undo/<token>/before` (absent when there was no file) and the new ones in `.msm/undo/<token>/after`, and skips writes equal to the current bytes. One command carries the changeset's commands and one `app.asset-write` effect per write. The session's command listener writes `after` to the live file on execute and redo, and on undo writes `before` back or removes the file; the work is queued with the trash moves, and `applyChangeset` resolves once the bytes are in place.
- Created assets keep the record rule (bytes written first, trashed on undo, restored on redo); replaced assets use effects. The two never touch the same path in one command.
- `applyCreatorPlan` passes the plan's writes to `applyChangeset` instead of importing them first, so "Update <flow>" is one undo step for elements and files.
- `.msm/undo/` is emptied with `.msm/trash/` when a project is opened or created, never on save. Entries dropped from the history (undo limit, a new command after undo) leave their stored bytes until then.

## Consequences

- One Undo after a Creator Update restores the elements and the old texture bytes; Redo writes the new ones again.
- Any later byte-replacing feature (for example a texture editor) can use the same effect instead of a non-undoable write.
- Deleting `.msm/` loses at most the undo of asset removals and replacements, as before.
- A failed restore or write surfaces as an `assets.trash-failed` warning, like a failed trash move.

## Status

Accepted (2026-11-05). Implemented by B193; shipped in 0.7.0 (2026-11-06).
