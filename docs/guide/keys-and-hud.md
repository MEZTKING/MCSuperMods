# Keys and the screen

Your mod can add **keys of its own** and **things on the screen**. A key appears in Minecraft's **Controls** screen like any other and, when a player presses it, makes things happen: a dash, a spell, a flare. An on-screen element is a bar, a row of icons or a number: mana, stamina, a score, the player's coordinates, a vehicle's fuel.

Both need the **Fabric mod jar**. A vanilla pack leaves them out and says so ([Limits](#limits)). Rules can use both: **When the player presses a key** and **Show a number on screen** ([Rules](rules.md#vehicles-keys-and-the-screen)). Vehicles use them too ([Vehicles](vehicles.md)).

## Make a key

- **Add element** (Ctrl+N), then a template under **Controls and HUD**: `msm_key_bind_dash` (key Z) or `msm_key_bind_ability` (key K), then the **Key bind Studio**; or
- use the example **Controls: a dash ability** in **Help → Examples…**.

Very easy mode shows no key by itself: make one by choosing the rule **When the player presses a key** in [Rules](rules.md), which asks **Press the key you want**.

### The Key bind Studio

- **Name and group**: **Name** (what Controls shows), **Group** (the heading in Controls) and **Group name**. Keys in the same group share one group name; the Studio offers **Use “…”** when other keys of the group call it something else.
- **Default key**: the key in words. **Press a key** takes the next key or mouse button you press; Esc stops listening; **No key** leaves it unbound, so the player chooses. A key the game cannot use says so and keeps listening. A warning names a vanilla control already on that key.
- **When it works**: **Always**, **On foot**, **In a vehicle** or **While driving** (with **Which vehicle**: any vehicle or one of yours).
- **Timing**: the wait between presses and, for a held key, how often it repeats, in ticks (20 ticks are a second).
- **Events**: **When pressed**, **While held** and **When let go**, the same events editor as blocks and items. A tap is a press and a release.

The key runs its events as the player who pressed it, with the permissions an item's events have. A key can also run a function (`run_function`); the Studio shows the information `controls.key-runs-function` so you remember who can press it.

### Keys that clash

The Studio warns when your default key is a vanilla control's key (Controls shows a clash in red). In Minecraft 26.3 **G is "Quick actions"**, so a key on G warns as a clash. A vanilla control that is part of an F3 combination does not count. The four vehicle keys are also checked: a project that has a vehicle and a key on **R**, **V**, **H** or **Left Alt** gets a warning.

### The vehicle keys

Worlds with at least one vehicle add four keys under **MSM Vehicles**: **R** fires the first weapon, **V** fires the second, **H** is the horn and **Left Alt** descends. They are not yours to change in the project; players rebind them in **Controls** like any key.

## Make something on the screen

- **Add element** (Ctrl+N) and a template under **Controls and HUD**: `msm_hud_mana_bar`, `msm_hud_stamina_bar`, `msm_hud_coordinates` or `msm_hud_score_counter`, then the **HUD Studio**; or
- the example **Controls: a dash ability** shows a charge bar that a key empties.

### The HUD Studio

The **Preview** comes first: a drawn 16:9 screen with an outlined hotbar and status rows, at GUI scale 2, 3 or 4, with every element of your project placed as the game would place it. **Preview value** sets the value of the element you edit, and **Riding a vehicle** shows vehicle-only elements.

- **What it looks like**: **Bar**, **Row of icons**, **Text** or **Number**. A number is text that shows just the value. Changing the look drops fields only another look uses, in one undo step.
- **What it shows** (**Comes from**): set by rules, scripts and actions; saved data (which includes Rules counters); a score; the player's stat (health, food, air, armour, level, x, y, z); or the vehicle's stat (fuel, health, ammunition, speed, reload). Bars and icons take **Full amount** or **Use another value**.
- **Where on screen**: a picture of nine spots plus **Above the hotbar**, the order within a spot, **Move right**, **Move down**, and a bar's width and height. Elements in one spot stack by order, then by id.
- **Colours and pictures**: text, colour and shadow; the filled and empty colours or pictures; the full, half and empty icons and what each is worth (at most 20 icons). A picture the project lacks shows a warning.
- **When it shows**: always, only when a value is set, in a vehicle, or while driving (with **Which vehicle**); **Starts hidden** keeps it away until a rule or script shows it.

### Show and change it from events

The events editor offers **Show a HUD element**, **Hide a HUD element** and **Set a HUD element's value** (a number; text goes in Raw JSON), with a picker over your project's elements. Rules has **Show on screen**, **Hide from the screen** and **Show a number on screen** ([Rules](rules.md#vehicles-keys-and-the-screen)); scripts have `player.showHud`, `hideHud` and `setHud` ([Scripting](scripting.md#vehicles-keys-and-the-screen-from-scripts)).

### The vehicle dashboard

A vehicle shows its riders a small dashboard of health, fuel, and ammunition and reload for each weapon, drawn in the bottom right. Switch it off in the Vehicle Studio to draw your own with elements that read the vehicle's stats.

## Limits

| What | In plain words |
|---|---|
| **New keys and elements need a restart** | Key mappings and the HUD list are read when Minecraft starts. A new key, element or vehicle makes **Play** say **Restart needed**; values and events reload. If the two sides disagree about the list of elements, the game ignores the screen updates and logs one warning. |
| **Keys do nothing inside screens or with chat open** | That is how Minecraft handles keys. Releases are still sent, so a held key stops. |
| **A key is a button for every player** | Anyone may press it as often as the rate limit allows (20 presses a second, bursts of 40; the rest are dropped, never kicked). Use cooldowns, and the **When it works** rule, for anything strong. |
| **Not in vanilla packs** | A vanilla pack export leaves keys and elements out and lists them as information. |
| **Not in a Java project** | The [Java eject](eject.md) leaves them out and warns once for each. |
| **No scripts on the player's side** | Every key goes to the server; nothing runs in the player's own game. |
| **No mouse wheel, no combinations** | A key is one key or one mouse button. Players can still add modifiers in Controls. |
| **Vanilla parts of the screen stay** | You cannot hide or move vanilla's bars, only add your own. |
| **Simple elements only** | Bars, icons and text; no animation except a bar's fill, nothing that follows a mob, no per-player layouts, no items or entities drawn. |
| **Text is plain** | Vanilla language keys in HUD text are not translated. |
| **Elements can sit under join pop-ups** | The layer draws under toasts, so a top-right element can be covered for a moment. |
| **Looks are in-game checks** | The Studio's picture follows the same layout rules, but text widths may differ by a few pixels. Check in Minecraft. |
