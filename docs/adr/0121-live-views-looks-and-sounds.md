# ADR 0121: Live views 3, looks and sounds

## Context

The second follow-up batch of "Everything visible live" ([ADR 0119](0119-live-worldgen-preview.md) D1). The audit [`docs/LIVE-VIEW-AUDIT.md`](../LIVE-VIEW-AUDIT.md) gives it 30 kinds: `minecraft:sounds`, fonts, vanilla-style particles, post effects, waypoint styles, shaders, jukebox songs, banner patterns, painting variants, trim materials and patterns, the seven mob variants, the four sound variants, instruments, timelines and world clocks, pot patterns, the sulfur cube archetype, `msm:potion`, `msm:creative_tab` and `msm:villager_type`. It also notes that no sound can be heard anywhere in the editor: Try it plays a project sound only when the simulation fires its event, and a vanilla sound is a caption.

Facts at 505d7c3 (3F1–3F12 in [`docs/PLAN-live-views.md`](../PLAN-live-views.md)): Try it has a Web Audio player for Ogg Vorbis bytes; the jar extraction keeps only block and item textures; the art generator states that vanilla mob texture layouts are "not MSM's to know"; `minecraft:shader` is a raw, unchecked file. Two facts are to be verified by the spike B619: vanilla sound files are not in the client jar but in the launcher's asset store, and vanilla mob shapes are code, so no file holds a body to draw.

The machinery (the `live_view` route, the registry, the frame, the fidelity levels, the bundle route for the Creator and the AI review) is [ADR 0120](0120-live-views-data.md)'s and is used unchanged.

## Decision

### D1 Scope

Every one of the 30 kinds gets a live view, in the place listed in the plan's batch 3 table. `msm:effect` (which has a view) gains its corner frame and swirl colour; My things gains cards for particles and sounds.

### D2 A Play button everywhere a sound is picked or defined

- One shared `audio/` module in the renderer (the player moved out of Try it, which then uses it) and one `SoundPlayButton`.
- The button resolves an event through the project's `sounds.json`, then vanilla's; picks a file by weight as the data says; plays at the event's volume and pitch. One sound at a time.
- It is placed in the sounds form, in every Sounds section and sound picker of the Studios, Rules and the Creator, and in the views of jukebox songs, instruments, sound variants, damage types and the sulfur cube. A test walks the sound pickers and fails when one has no button.
- A sound is heard flat: no distance, category volume or echo.

### D3 Vanilla sounds and looks come from the user's own Minecraft files

- Vanilla sound files and `sounds.json` are read from the asset store of the user's own Minecraft folder, found through the install `@msm/interop` already knows, on demand through IPC. They are not copied into MSM's cache and never leave the machine. Without a set-up folder the button is off for vanilla ids, with the set-up link; project sounds always play.
- The jar extraction ([ADR 0011](0011-client-jar-asset-extraction.md)) is extended to the texture folders these views read (entity, painting, banner and shield patterns, trims and palettes, pot patterns, GUI sprites, particle, font) and to shader and post effect files. As ever: never committed, bundled, exported, written into a project or sent to the AI helper.

### D4 Stand-in bodies

- For the seven variant mobs, the villager and the sulfur cube MSM draws its own **stand-in bodies**: geo models written by MSM from what the game shows (client GameTest screenshots of MSM's own test textures) and from the layout of the user's texture files. They are labelled **About right** and do not animate beyond turning.
- Mojang's Bedrock geometry files are Mojang's assets and are not read or used.
- Where the spike finds a body cannot be learned well enough, that view shows the texture sheet flat with its parts named, and says so.
- Reserve B646: the runtime's dev mode writes the real part boxes, obtained through the game's own accessors on the user's machine, to the managed instance, where the app reads them like a save. Never shipped.

### D5 Paintings, banners, trims and pots on MSM's own shapes

A wall and frame, a banner and a shield, and a pot are MSM's shapes; trims are drawn on the existing armour figure, the material's palette applied to the pattern's picture as the data names them. The user picks the dye colour, the armour and the counterpart (a material for a pattern, a pattern for a material).

### D6 Fonts

A line the user types is drawn with the font at GUI scales 1 to 4. Bitmap, space and reference providers are exact from their pictures; TrueType providers are drawn by the browser (about right); a provider the view cannot draw is named.

### D7 Potions, creative tabs, particle sprites, waypoint styles, day strips

- A potion shows its four bottles in its colour (vanilla's pictures from the jar, MSM's drawn bottle without it).
- A creative tab shows its page: the icon on the tab and the items in their order. It is MSM's drawing.
- `minecraft:particle` plays its sprites as the Particle Studio plays its own; a waypoint style shows its icon at each distance.
- Timelines and world clocks show a day strip of the values they set. The sky itself is not drawn.

### D8 Shaders and post effects: where WebGL allows, and a stated limit elsewhere

- The app draws with WebGL 2; the game's shaders target desktop OpenGL. A shader is put through a small, mechanical translation (the version line, precision, includes resolved from the jar, uniform blocks) and compiled.
- Where it compiles, a shader runs on a test picture and a post effect on a still frame of Try it, labelled About right.
- Where it does not, the view shows the compiler's lines against the user's code, the pass chain as a diagram, and "the effect itself is only in the game". Nothing is rewritten by guesswork and nothing is drawn that the shader did not produce.
- How far "where it compiles" reaches is the spike's 3S8 and 3S9. If the share is too small to be useful, the views are the diagram and the compile check only, and that is the recorded limit (3L6).

### D9 Without WebGL, and reduced motion

Bodies and shapes fall back to flat pictures; sounds still play; turning bodies stand still under reduced motion, as the Showcase's stills do ([ADR 0118](0118-showcase-with-live-clips.md) D7–D9).

### D10 The Creator's flows

Music disc, Goat horn, Banner pattern, Armour trim, Pot pattern, Creative tab, Villager look and Mob skin show their result in the Creator's Live tab through ADR 0120 D7's registry. No new mechanism.

### D11 Order and budgets

After the game modes plan closes (B562). Views follow an edit in 150 ms plus 250 ms; a sound starts within 200 ms of the press for a project sound (draft; B619 sets both and the number for vanilla sounds). Code budget 0.4 MB of renderer output (ADR 0120 D10).

## Alternatives considered

- **Ship a few vanilla sounds or textures for the previews.** Rejected: never bundle Mojang assets.
- **Copy vanilla sounds into MSM's cache.** Not needed: they are already loose files on the user's disk; reading in place keeps one copy.
- **Bodies from Mojang's Bedrock geometry.** Rejected: Mojang's assets, and not the Java shapes.
- **Show variants only as flat textures.** Kept as the fallback; a body is what the user asked to see.
- **Run shaders through a full OpenGL-to-WebGL translator.** A new, large dependency against a full size budget; rejected in favour of the mechanical translation and a stated limit.
- **Leave shaders exempt.** Rejected: a shader changes what a player sees, so the rule applies; the compile check alone is already worth having.

## Consequences

- Sound becomes part of editing everywhere, not only of Try it.
- The app reads a second place in the user's Minecraft folder (the asset store), through one new reader.
- MSM takes on a set of stand-in bodies to keep in step with new variants; the target says which variants exist.
- The cache grows by more texture folders; users re-extract once.
- A new `audio/` folder, a looks area under `liveviews/`, an e2e spec, guide text.

## Status

Proposed (2026-11-22). The working plan is [`docs/PLAN-live-views.md`](../PLAN-live-views.md) (batch 3, B619–B633; fact table 3F1–3F12, spike questions 3S1–3S12, limits 3L1–3L12); nothing after its wave 0 starts before the spike B619 has reported. Decided by the orchestrator under the user's rule and open to the user's veto: reading vanilla sounds in place from the user's Minecraft folder (D3); stand-in bodies as the default and exact bodies only by the reserve (D4); shaders and post effects shown only where they compile, with the compile check and diagram elsewhere (D8); running after the game modes plan (D11).
