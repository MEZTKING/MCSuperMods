# ADR 0053: Missing features and the Wishlist

## Context

The AI helper met a request MSM cannot do (a launcher that pushes the player; scripts had no velocity call, now ADR 0052) and quietly built a weaker version. The user asked for a way to make, and to suggest, things MSM usually cannot make. Letting the helper write and compile its own runtime Java inside the app was ruled out: it needs a JDK on the user's machine, is hard to make safe and breaks between Minecraft versions.

## Decision

- **D1 Protocol.** The system prompt tells the helper, when a request cannot be built exactly: try MSM's other routes first (the `msm:components` passthrough, data pack functions and commands, a script, the Java project export), propose the closest working version, say plainly what it does not do, and record the gap.
- **D2 Tool.** `note_missing_feature` (group `note`, last in the catalogue) takes `title`, `request`, `missing` and optional `builtInstead`. The app's executor adds the entry to the project's Wishlist (one open entry per title, merged) and answers with the number of open wishes.
- **D3 Wishlist.** `msm.wishlist.json` next to the project file (format 1, sorted keys; at most 500 entries, done ones dropped first), outside the undo history. Help > Wishlist… and the palette open a dialog: open and done wishes, a tick to mark one done, remove, "Add your own", and "Copy N open" that puts a plain-text list on the clipboard to send to the MSM developers. Features land in later MSM versions; the Java project export stays the way to have one immediately.

## Consequences

- "It cannot do that yet" becomes a recorded, reviewable request instead of a silent compromise, and survives closing the app.
- The prompt and catalogue change once (a new tool), which costs one cache miss on the first request after updating.

## Status

Accepted (2026-11-08) on the user's request ("Do all 3").
