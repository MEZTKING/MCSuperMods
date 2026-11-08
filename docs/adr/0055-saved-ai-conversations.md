# ADR 0055: Saved AI helper conversations

## Context

AI helper conversations live only in memory, one per project, and are gone when the app closes (ADR 0041). The user asked whether the helper keeps what was typed; it does not, and losing a long build conversation on every restart is a real cost.

## Decision

- **D1 Where.** Main saves each project's conversation to `<msmHome>/ai-history/<sha256 of the project root, 40 hex>.json` (`app/src/main/ai/ai-history.ts`), never inside the project, so sharing a project does not share its conversation. Writes are atomic; a damaged or foreign file reads as none.
- **D2 What.** `{ format: 1, root, savedAt, model, messages, transcript }`: the API history main keeps (`messages`) and the panel's transcript as the renderer serialised it (`transcript`, a string main does not read). Unapplied proposals are not kept.
- **D3 Size.** At most 16 MB (`AI_HISTORY_MAX_BYTES`). Larger records drop sent pictures first (a short text note stays in their place), then the oldest turns, starting the history at a user message; a record that still does not fit is not saved.
- **D4 When.** The renderer saves after each finished answer (`ai:saveHistory`); opening a project restores its conversation once (`ai:loadHistory`), with a notice; **New conversation** forgets it (`ai:forgetHistory`).
- **D5 Switch.** `AiSettings.remember` (optional; missing means yes). Settings > "AI helper": "Remember conversations (saved on this computer)". Off: nothing is saved or loaded.

## Consequences

- A conversation survives restarts on the same computer; moving a project folder starts a new one (the key is the root path).
- The saved file holds what the user typed and the model's answers in plain JSON on their own disk; the API key is never in it.

## Status

Proposed (2026-11-08). Main-side store and `AiService.saveHistory`/`loadHistory`/`forgetHistory` are implemented and unit-tested; the IPC, renderer and Settings parts are not yet (see HANDOFF).
