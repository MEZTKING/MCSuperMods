# ADR 0052: Velocity in scripts and a launch action

## Context

The user built a launcher with the AI helper; it could only move the player in many small teleports because MSM scripts have no way to set an entity's motion and events have no push action. A real push is what slime blocks, wind charges and knockback do: the server sets the entity's motion and tells the client, which then moves smoothly.

## Decision

- **D1 Script API.** `Entity` gains `velocity` and `look` (read-only `Pos` values: the motion in blocks per tick and the unit look vector) and `setVelocity(x, y, z)` and `addVelocity(x, y, z)`. Additive to script API v1 (`script-api-v1.json` first, then `ScriptEntity`; the contract test ties them).
- **D2 Action.** `launch` (`action.mcdoc`): `strength` (0 to 10 blocks per tick) along `direction` (`look`, the default; `horizontal`; `up`), plus `up` (-10 to 10), `add` (add to the motion instead of replacing it) and `target` (`self` or `other`, as `apply_effect`). The Events editor offers it as "Launch (push)" (`add` stays in Raw JSON), and the Java project eject writes it as `Actions.launch`.
- **D3 Runtime.** One helper, `events/Motion`, sets the motion with each component clamped to ±10 and sets `hurtMarked`, so the server sends the motion to the client (what moves a player). Runtimes older than this one reject `launch` as an unknown action type.

## Consequences

- Jump pads, dashes, grappling-style pulls and knock-ups are a single action or one line of script, and move smoothly.
- Fall damage still applies after a high launch; a slow-falling `apply_effect` in the same event softens it.

## Status

Accepted (2026-11-08) on the user's request; the runtime part is compiled and checked by CI (no JDK in the session container).
