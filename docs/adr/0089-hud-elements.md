# ADR 0089: HUD elements driven by synced values

## Context

Projects can show feedback only through what the server can send: chat, the action bar, titles, boss bars and sounds (coverage audit L2, L3). Vehicles need a dashboard (fuel, health, ammunition, reload, speed), and the research of 2026-11-14 (`popular-mods.md`, section 3, rank 3) finds HUD bars and numbers behind about seven popular ideas beyond vehicles: mana bars, stamina, ammunition counters, coordinates, armour gauges. Vanilla data packs fake them with action bar text and the icon font.

Facts read on 2026-11-14 (fact table V9 to V11 in [ADR 0090](0090-vehicles.md)'s findings):

- Fabric's `HudElementRegistry` (`addFirst`, `addLast`, `attachElementBefore`, `attachElementAfter`, `removeElement`, `replaceElement`) and `VanillaHudElements` (`HOTBAR`, `HEALTH_BAR`, `FOOD_BAR`, `MOUNT_HEALTH`, `BOSS_BAR`, `SCOREBOARD`, `SUBTITLES` and the rest) are the same on both versions.
- **`HudElement` differs.** On 26.3 (rendering 27.2.0) it is `extractRenderState(GuiGraphicsExtractor, DeltaTracker)`; on 26.4-snapshot-7 (rendering 29.1.1) it extends `Updatable` with `update(DeltaTracker)` and `extractRenderState(GuiGraphicsExtractor)`. Registration therefore goes behind a seam.
- Vanilla sends a client the scores of displayed objectives only (verify at implementation); script data (ADR 0062) and vehicle state (ADR 0090) never reach the client by themselves.
- `ClientGameTestContext.assertScreenshotContains` finds a template picture inside a screenshot on both versions, so a headless test can check that a HUD element is drawn where its anchor says.

## Decision

- **D1 A definition kind `msm:hud`.** `msm/<ns>/hud/<path>.json`, one element per file:

  ```
  struct HudDefinition {
    format: 1,
    type: ("text" | "bar" | "icons"),
    anchor?: ("top_left" | "top" | "top_right" | "left" | "center" | "right" | "bottom_left" | "bottom" | "bottom_right" | "above_hotbar"),  // default above_hotbar
    offset?: [int] @ 2,                // GUI pixels from the anchor; default [0, 0]
    order?: int,                       // within an anchor, lower first; then by id
    value: HudValue,                   // what it shows (D2)
    max?: (float | HudValue),          // bars and icons; default 20
    show?: ("always" | "when_set" | "in_vehicle" | "driving"),  // default when_set
    vehicle?: #[id="vehicle"] string,  // with in_vehicle or driving
    starts_hidden?: boolean,           // default false; scripts and Rules show it
    // text
    text?: string,                     // with {value} and {max}; a lang key when it contains no space and resolves; default "{value}"
    color?: string,                    // #rrggbb; default #ffffff
    shadow?: boolean,                  // default true
    // bar
    size?: [int] @ 2,                  // GUI pixels; default [81, 5] (a vanilla bar's width)
    fill_color?: string, back_color?: string,   // default #e0c040 and #202020
    sprite?: #[id="texture"] string, back_sprite?: #[id="texture"] string,  // GUI sprites instead of colours
    // icons
    icon?: #[id="texture"] string, half_icon?: #[id="texture"] string, empty_icon?: #[id="texture"] string,  // a row of up to 20, as hearts
    per_icon?: float,                  // value per full icon; default 2 (as hearts)
  }
  ```

  Sprites are ordinary project GUI sprites (`assets/<ns>/textures/gui/sprites/hud/...`); MSM never ships Mojang's HUD art.
- **D2 Values.** `HudValue` is one of: `{ "source": "data", "scope": "player" | "world", "namespace", "key" }` (script data of ADR 0062, which is also where Rules counters live, so a Rules counter can be shown); `{ "source": "score", "objective", "holder"?: "@s" | name }`; `{ "source": "vehicle", "stat": "fuel" | "health" | "ammo" | "speed" | "reload", "weapon"? }` (ADR 0090; the vehicle the viewer rides); `{ "source": "player", "stat": "health" | "food" | "air" | "armor" | "level" | "x" | "y" | "z" }` (read on the client, never synced); `{ "source": "set" }` (only what a script or a Rules step sets, D6). Text values may be strings; bars and icons take numbers and draw nothing for text.
- **D3 Sync.** The server computes, per player, the values of every HUD element whose source is not `player`, every `update_ticks` (a runtime constant of 5, a quarter second) and when a script or Rules sets one, and sends only the changes in one `msm_runtime:hud_v1` payload: `{ values: [ { index: varint, number?: double, text?: string (at most 256 characters), visible?: boolean } ] }`, at most 64 entries per payload. `index` is the element's position in the sorted list of HUD ids, which both sides read from the same definitions at initialisation; the payload also carries a 32-bit hash of that list, and a client whose list differs ignores HUD payloads and logs one warning (limit V5, in [ADR 0090](0090-vehicles.md)'s findings). Values are dropped when the player leaves; a respawn or dimension change resends all.
- **D4 Drawing.** One runtime HUD layer, `msm_runtime:hud`, attached before `VanillaHudElements.CHAT` (so chat stays on top; verify at implementation that this places it above the hotbar and status bars), draws every visible element in anchor and order. Layout is a pure class (`client/hud/HudLayout`, JUnit-tested) from the GUI's scaled width and height: anchors at the screen's edges and centre; `above_hotbar` sits above the hotbar and vanilla's status bars and stacks upwards. Elements are hidden while the debug screen or a full-screen menu hides the vanilla HUD (vanilla's own rule for HUD layers; verify). Registration and the draw call's signature sit behind the seam `client/HudRegistration` in `src/mc/<mc>/java` (D1's fact).
- **D5 Vehicles' built-in dashboard.** A vehicle shows, to its riders only, a built-in dashboard (health bar, fuel bar, ammunition and reload per weapon), drawn by the same layer from vehicle synched data with no payload; `hud: false` in the vehicle definition turns it off so a project can draw its own with `msm:hud` elements and `source: vehicle`.
- **D6 Actions.** Three new format actions: `show_hud { hud }`, `hide_hud { hud }` and `set_hud { hud, value: number | string }` (the viewer is the event's player; without a player they do nothing and log once). They work from any event, so Rules uses them as plain steps without a script.
- **D7 Rules.** Steps "Show <HUD> on screen", "Hide <HUD>" and "Set <HUD> to <value>" (a number, a text or any Rules value), a value "the vehicle's fuel / health / ammunition" for rules on vehicles, and the Very easy wording "Show a number on screen" with an inline bar or text choice that creates the HUD element for the user.
- **D8 Script API 1.5.** `Player.showHud(id)`, `hideHud(id)`, `setHud(id, value)`; events `key.pressed` and `key.released` (ADR 0088 D6); vehicle members and events (ADR 0090 D11): `Entity.vehicle`, `Entity.passengers`, `Entity.isVehicle`, `Vehicle` members `fuel`, `setFuel`, `damage`, `setDamage`, `ammo(weapon)`, `setAmmo(weapon, n)`, `driver`, and events `vehicle.mounted`, `vehicle.dismounted`, `vehicle.fired`, `vehicle.destroyed`. Members are labelled with the release that ships them, decided at close (HANDOFF lesson).
- **D9 App.** `msm:hud` lives in `@msm/plugin-controls` (ADR 0088 D8). Validators: unknown vehicle, `vehicle` without `in_vehicle` or `driving`, a bar or icons with a text-only source, a `score` objective that no project file creates (info), a missing sprite (reported by the app, as missing particle frames are). The HUD Studio previews the layout on an MSM-drawn 16:9 screen with an outlined hotbar (no Mojang art), at GUI scales 2, 3 and 4.
- **D10 Not in this batch (limits).** Hiding or moving vanilla HUD parts (Fabric's `replaceElement` makes it possible; it is a follow-up once someone asks); HUD elements that follow an entity in the world (name-tag style); animations other than a bar's fill; per-player layouts; drawing items or entities in the HUD; HUD in vanilla packs (the action bar and boss bars remain the vanilla way).

## Consequences

- Projects get gauges and counters without scripts; Rules and scripts can drive them.
- The runtime gains a second payload and one seam on the client.
- New HUD elements need a restart (their index list is read at initialisation); their values and visibility change live.

## Findings from implementation

Recorded at close (B432, 2026-11-15) from B406 (38250d2), B409 (ae740fc), B413 (e7111c3), B416 (a5f99cc), B420 (185e7c5), B420a (2f00b14), B421 (ab22dda), B424 (74d70df), B424a (6507159), B426 (77008c4), B427 (371cca6) and B429 (2f5acdd). The fact table (V1–V24; V9–V11 are this ADR's), S1–S12 and the limits V1–V17 are in [ADR 0090](0090-vehicles.md)'s findings. Unreleased; awaiting the user's in-game checks.

- **Spike answer S8** (B406). The HUD seam works on both versions: on 26.3 a `HudElementRegistry` lambda with `extractRenderState(GuiGraphicsExtractor, DeltaTracker)`, on 26.4 a `HudElement` with `update` and `extractRenderState(GuiGraphicsExtractor)`, both in `client/HudRegistration` under `src/mc/<mc>/java`.
- **D1 format as built** (B409, B413). `controls.mcdoc` (`::msm::controls`: `HudCommon`, `HudValue` dispatched on `source`: `data`, `score`, `vehicle`, `player`, `set`). The kind `msm:hud` (folder `hud`, default `{ format: 1, type: 'bar', value: { source: 'set' } }`) lowers to `msm/<ns>/hud/<path>.json` with no lang; validators check `#rrggbb` colours and `icon` for `icons`. The HUD Studio's "Number" look is stored as `type: text` without `text` (B420).
- **D3 protocol as built** (B411, B416). `HudPayload(int hash, List<Value> values)` with at most 64 values, `Value(index, Optional<Double> number, Optional<String> text, Optional<Boolean> visible)` and text at most 256 characters. Slot i is element i in the ids sorted as strings, slot count+i is its computed max, and an empty entry clears; the hash is `String.join("\n", ids).hashCode()`. `HudSync` sends every 5 ticks and at the end of a tick that changed a value, and resends everything on respawn and dimension change. A value's max counts as 20 until known.
- **D4 drawing as built** (B416). One layer `msm_runtime:hud` (`MsmHudLayer`), laid out by the pure `HudLayout`: GUI size `ceil(window / scale)`; margin 2, gap 2, `above_hotbar` 52, text height 9, icons 9 wide on a step of 8 and at most 20; elements stack by `order`, then id; bar fill `round(w · clamp(v / max))`; numbers formatted as JavaScript's `Number(v.toFixed(2)).toString()`. The rules are pinned by `fixtures/hud-layout/golden.json` (with a README), read by JUnit, by the HUD Studio's `studios/controls/hud-layout.ts` (45 tests) and by Try it. Visibility: an override from an action, else not `starts_hidden`, and `show` (`always`, `when_set`, `in_vehicle`, `driving` with `vehicle`); a bar or icons with a text value draw nothing. Finding: the layer draws under toasts, so `top_right` can be covered by join toasts (open). Whether the layer hides with the debug screen was not recorded separately.
- **D5 dashboard as built** (B416). `VehicleDashboard` takes rows in `bottom_right` as `msm_runtime:dashboard/<n>`; `reload` is `max(0, readyAt - gameTime)`, `speed` blocks a second to one decimal, `health` the max minus the damage taken.
- **D6 actions as built** (B409, B416, B420a). `show_hud { hud }`, `hide_hud { hud }`, `set_hud { hud, value }`; `HudServer.show`, `hide` and `set(player, id, double | String)` return false for unknown ids. The shared events editor gained "Show / Hide a HUD element" and "Set a HUD element's value" (numbers only; text stays in Raw JSON) with a picker over the project's HUD elements, and the app warns `controls.hud-picture-missing` for a missing sprite (`session/hud-pictures.ts`).
- **D7 Rules as built** (B424, B424a). Steps `show_hud` "Show on screen", `hide_hud` "Hide from the screen" and `set_hud` "Show a number on screen" (plain steps), code `rules.unknown-hud`; a Rules counter shows through an `msm:hud` element `{ source: 'data', scope: 'player', namespace, key: 'rules.counter.<name>' }`. The HUD menu offers "Make a new on-screen number" (`{ format: 1, type: 'text', value: { source: 'set' } }` at `<book ns>:number`, `number_2`, ..., one undo step with the rule).
- **D8 amendments** (B421). Script API 1.5, labelled "Since runtime 1.5.1" (snapshot `test/fixtures/previous/script-api-v1-1.8.0.json`): `Player.showHud`, `hideHud`, `setHud(id, number | string)` (false for unknown ids); `Entity.vehicle`, `passengers`, `isVehicle`, `asVehicle()`; `Vehicle extends Entity` with `fuel`/`setFuel`, **`damageTaken`/`setDamageTaken` in place of `damage`/`setDamage`** (`Entity.damage()` already exists; at or above the max it destroys through `VehicleHealth.destroy`), `ammo`/`setAmmo` (weapon id or index; unknown is a `RangeError`) and `driver`; events `key.pressed` and `key.released` (project keys only), `vehicle.mounted`, `vehicle.dismounted`, `vehicle.fired` and `vehicle.destroyed` (which comes before each `vehicle.dismounted`). `MsmScriptApi15GameTest` 9.
- **D9 as built** (B413, B420). Templates `msm_hud_mana_bar`, `msm_hud_stamina_bar`, `msm_hud_coordinates`, `msm_hud_score_counter`. The HUD Studio previews the layout on an MSM-drawn screen through the same golden as the runtime.
- **Tests.** `MsmHudGameTest` (10), JUnit `HudParserTest`, `HudLayoutTest`, `HudLayoutGoldenTest`; the HUD half of `MsmControlsClientGameTest` finds a bar and a text at their anchors on both versions; parity reads the HUD sync from `hud_v1` bytes; e2e `controls-path` (the Mana bar preview, "Show a number on screen" 25).
- **Open follow-ups.** The layer under toasts; the HUD validator does not re-run when a function changes (the objective info can be stale); `fixtures/hud-layout` is not a Gradle test input; the HUD picker in the events editor has no test id; in Try it, vanilla lang keys in HUD text are not resolved and dashboard weapon rows show no ammunition count. D10's list stands.

## Status

Accepted with findings at close B432 (2026-11-15; unreleased, awaiting the user's in-game checks), with the defaults below; the user may still veto them. Vetoable defaults: one file per element and the three types (D1); the five sources and Rules counters through script data (D2); the five-tick update, index plus hash in the payload and 64 entries (D3); one layer, the ten anchors and `above_hotbar` as the default (D4); the built-in vehicle dashboard, on by default (D5); the action names `show_hud`, `hide_hud`, `set_hud` (D6); the Rules and Very easy wording "Show on screen", "Hide from the screen", "Show a number on screen" (D7); the Script API names, with `damageTaken` and `setDamageTaken` for a vehicle's damage (D8); the MSM-drawn layout preview (D9); leaving vanilla HUD parts alone (D10).
