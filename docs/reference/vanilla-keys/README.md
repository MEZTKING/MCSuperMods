# Vanilla key bindings (B406 dumps)

Dumped on 2026-11-14 by the B406 spike (`docs/PLAN-vehicles-and-client.md`) in the running client, headless on Linux, for
26.3 and 26.4-snapshot-7 (Fabric Loader reports `26.4-alpha.7`). They are the source of `TargetFacts.controls` (ADR 0088
D9, brief B410); nothing reads them at build time.

- `keyNames`: every valid `InputConstants` name: the `KEY_*` and `MOUSE_BUTTON_*` constants, plus every keyboard code from
  0 to 400 that has a name, plus `key.keyboard.unknown` (unbound). Equal on both versions (255 names).
- `keyNamesFromInputConstants`: the constants only (122 names).
- `keyboardNamesByCode0to400`, `mouseNamesByCode0to10`: the name of each code. Keyboard codes are USB HID usage ids (SDL
  scancodes: 4 is `a`), not GLFW key codes; mouse codes start at 1 (`key.mouse.left`), 0 is not a button.
- `vanillaKeys`: each vanilla control (category in the `minecraft` namespace) to its default key; `vanillaCategories`
  their categories. Most `key.debug.*` controls are vanilla's F3 combinations (`key.debug.modifier` is F3); the spike
  did not measure whether they also take the plain key, so a conflict check should treat them apart. The only difference between the versions: 26.3 `key.socialInteractions` (P) is 26.4 `key.otherPlayers` (P).
- `nonVanillaMappings`: the spike's own two test keys; ignore them.
