# ADR 0131: One toolbar row, and Settings over the open dialog

## Context

ADR 0130 kept one toolbar, but it is the expert one: about 24 controls in two rows (`app/src/renderer/src/components/Toolbar.tsx`). Settings shares the single open-dialog state in `App.tsx`, so opening it from inside the painter, New texture or the Creator closes that dialog and loses what was in it. The user, after 1.5.8 (2026-11-23): "after publishing you can fix the rest of the problems ask fable for support"; the plan is `docs/PLAN-one-mode-rest.md`.

## Decision

- **D1** The toolbar is one row: Home, Undo, Redo, Save, Try it, Play, Share my mod, the search field, AI helper, Help and a **More** menu. Everything else the toolbar had is in More; the native menus hold the same things in the same words. Every shortcut stays.
- **D2** Save stays in the row and is accented while there are unsaved changes (there is no autosave).
- **D3** Play's status shows in the row only when it needs the user or a game is running; Reload only while it can be used.
- **D4** The row never wraps: below 1200 px Try it and Share my mod show icons, below 1000 px the search field is a button.
- **D5** Settings has its own state and opens over any open dialog, which stays as it was.

## Consequences

The e2e specs reach moved actions through one helper; the guide and the AI prompt's app map follow; ADR 0130 D4's "one toolbar" line now points here.

## Status

Accepted (2026-11-23, the orchestrator's plan on the user's word; D1 to D5 are vetoable defaults: whether mods should save by themselves, and a Make something button in the row, are asked of the user).
