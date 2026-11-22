# ADR 0118: A Showcase with live clips on Home and in New project

## Context

The user (2026-11-22): "you should show a showcase at the main page or new project on what is possible to make with a live clip of each, so new users may know where to start". The ROADMAP idea "Showcase for new users" (Post-1.0 Ideas) describes it.

A new user meets one of two screens:

- **Very easy's Home** ([ADR 0083](0083-very-easy-mode.md) D2). With no mod open it shows three buttons and the recent mods. With a mod open it shows 27 tiles ([ADR 0086](0086-surprise-me-random-mod.md) D8) and My things. It has no pictures of what the tiles make.
- **The New project dialog** (ADR 0020, ADR 0040), in Easy and Advanced. It is a list of starter titles.

The library has 186 examples that show finished things, but they are only reachable through Help > Examples, and only as text.

MSM can already draw a project in motion:

- **Try it** ([ADR 0085](0085-try-it-in-app-test-area.md)) renders lowered files with deepslate, the geo renderer and its own passes, over the deterministic `@msm/sim`.
- It runs at 43 to 52 frames a second at 320 by 180 under SwiftShader.
- Since [ADR 0092](0092-minecraft-style-art.md) it draws ground terrain and wood with MSM's own drawn art when the user has not extracted the game's pictures.

The facts are in `docs/PLAN-showcase.md` (W1–W18). The questions to measure are Z1–Z13 and the limits U1–U13.

We considered three ways to make the clips:

- **(a) Video files recorded in the game.** Ten clips would cost megabytes against a nearly full `app.asar` (29.8 of 32 MB). They would go stale with every version. They would show Mojang's textures, which MSM never ships (ADR 0011).
- **(b) Animated pictures made at build time from Try it.** These cost less, but still have to be shipped and still go stale. Without the user's jar they would only show drawn art, so they would look the same as (c) anyway.
- **(c) Clips drawn live in the app by Try it's renderer from each example's lowered files.** These cost no download and always match the running version. They show only MSM's art, or the user's own extracted pictures on their own machine.

We take (c).

## Decision

### D1 What and where

A **Showcase** is a gallery of cards headed **See what you can make**. Each card has four parts:

- a live clip;
- a title and one sentence in plain words;
- **Make this**;
- **See the example**.

The gallery appears in three places:

- **Very easy's Home with no mod open**, under the three buttons. This is where most new users land.
- **Home with a mod open**, between the Make tiles and My things. It is open while the mod has no things. After that it folds to a link, **Show what you can make**.
- **The New project dialog**, as a strip above the starter list.

There are two lighter entry points:

- the Examples gallery's detail pane plays the clip of a showcased example;
- the palette has "Showcase: see what you can make".

The empty editor area of Easy and Advanced is unchanged.

### D2 Live, never shipped as video

A clip is drawn while it plays:

- The renderer is one `TryItScene`, with Try it's `TryItCanvas`, used without change.
- The camera comes from the clip's script.
- The world comes from a `TryItArea` over the example's files. The example is built for the namespace `showcase` and lowered in memory with the project expanders, so Rules compile as they do on export.
- No picture, video or recorded frame is shipped.
- Vanilla blocks draw from the user's extracted jar when it is present, and otherwise from MSM's fallbacks: drawn terrain and wood, and one-colour cubes for the rest.

### D3 The list belongs to the app

The showcase list is `app/src/renderer/src/showcase/showcases.ts`, as Home's tiles are `components/home/tiles.ts`:

- It names library examples by id.
- It names Creator flows through Home's own `MakeTileAction`.
- A card whose example or flow is not offered on the target is hidden.

The examples stay in the library unchanged. A clip script is presentation, not content (app rule: no starter or example content in the app).

There is no plugin API change, so the plan can run beside vanilla parity 3 batch 2, which owns plugin API 1.20.0. A `showcases` contribution for plugins is deferred until a plugin asks. It could join the game modes plan's plugin API 1.21.0 if wanted.

### D4 The clip format

A clip is typed data, checked by `validateClip`. It has these fields:

| Field | What it holds |
|---|---|
| `id` | The clip's id. |
| `title`, `sentence` | The card's words. |
| `exampleId` | The library example it is drawn from. |
| `make` | A `MakeTileAction`, or `{ type: 'example' }`. |
| `ground` | `grid`, `flat`, or `quick` with its shape, trees and seed. |
| `setup` | Block states and spawns placed before the first frame. |
| `steps` | At ticks: the player actions of `@msm/sim` (`place`, `break`, `use`, `interact`, `useVehicle`, `move`, `tool`), or `set` (a block state the clip puts in place, never shown as a player action). |
| `camera` | Keys of eye, yaw and pitch, eased between them, yaw the short way round. |
| `captions` | Each with a start and an end. |
| `stillAt` | The time the still picture is taken. |
| `length` | At most 12 seconds. |

Ids in a clip are written relative to the example (`./elm_planks`).

### D5 Playback

- The clip player steps the area by simulation ticks from the clip's own time, never the wall clock. A slow machine plays a clip more slowly but never differently.
- Chances use "Run every time".
- At the end, the clip clears the area, sets it up again and starts over.
- Clips play no sound.
- Captions show over the picture. Rules clips may show the "What happened" lines of the rule they run as captions.
- Each example is lowered once per target in a session, when its card first needs it.

### D6 One clip at a time

At most one clip is live. It is chosen in this order:

1. the card under the mouse or keyboard focus;
2. otherwise, the first card fully in view (`IntersectionObserver`).

No clip plays while the window is hidden or out of focus. Every other card shows its still. Clips always draw with Smaller picture at 320 by 180. Moving the live clip unmounts the old canvas, and Try it's canvas then loses its WebGL context. **Pause clips** stops all of them.

### D7 Stills

Before a card's clip has played once in the session, the card shows a **drawn still**: up to three of the example's own pictures, scaled by whole numbers on a tint taken from the first. Once the clip has played, the frame at `stillAt` is taken from the canvas right after it is drawn and replaces the drawn still for the rest of the session. Stills are kept in memory only. Nothing is written to disk.

### D8 Reduced motion and the setting

A card never plays by itself in two cases:

- when the system asks for reduced motion (`prefers-reduced-motion: reduce`);
- when the new setting **Play showcase clips** is off (it is on by default).

In those cases the card shows its still, and its play button plays the clip once.

### D9 Without WebGL

No clip is mounted. Every card shows its drawn still, its sentence and its buttons, with the line "This computer cannot show moving pictures here."

### D10 Make this and See the example

**Make this** opens the clip's Creator flow:

- In the New project dialog, it selects the flow's starter and goes on to its wizard.
- On Home with no mod open, it asks for the mod's name (prefilled, for example "Elm Mod"), makes the mod, then opens the flow, as Surprise me does.

**See the example** opens the example:

- as a new mod when none is open;
- otherwise it copies the example into the open mod, as the Examples gallery does.

The Rules card uses **See the example** as its main button, because an empty Rule book teaches nothing.

### D11 Honest clips

- Every clip carries a **Preview** tag.
- Captions say what happens only in the game ("Tame it with sweet berries in the game").
- No clip pretends a mob does more than wander.
- No clip shows a screen.

ADR 0085 D7's rule holds: a clip cannot pass for the game.

### D12 The first ten

The first ten cards, each with the example it is drawn from:

| Card | Example |
|---|---|
| A set of wood | `example_msm_wood_set` |
| A pet | `example_msm_tameable_pet` |
| Plants that grow | `example_msm_crop` |
| A machine | `example_msm_ore_crusher` |
| A vehicle | `example_msm_vehicle` |
| A portal | `example_msm_sky_portal` |
| Sparkles | `example_msm_firefly_jar` |
| A trader | `example_msm_roadside_merchant` |
| A liquid of your own | `example_msm_fluid` |
| Rules: a lucky block | `example_msm_rules` |

The spares and the clip outlines are in the plan's table. Skyblock, One block and the other game modes join through the game modes plan (its B557 and B558).

### D13 Budgets, and the go or no-go

The showcase's own code stays within 0.1 MB, and the stop lines stay 31 MB for `app.asar` and 17.5 MB for the renderer. B565 measures under SwiftShader and decides what happens next:

| Measure | Go | No-go, and what follows |
|---|---|---|
| Mount to first frame | 1.5 s or less (up to 3 s accepted) | Above 3 s: the default becomes "play on click" |
| Frame rate at 320 by 180 | 24 fps or more | Below 15 fps: the default becomes "play on click" |
| 50 mounts and unmounts | No context warning, and memory back within 20 MB | A missing seam goes to reserve B573 |

A missing seam in Try it or the sim, such as taking a still, keeping a clip silent, placing the player or driving a vehicle, goes to reserve B573. That reserve runs only after vanilla parity 3's B540 has merged.

### D14 Tests

- `showcases.test.ts` plays every clip on both targets in Vitest. It checks four things:
  - each example and flow exists;
  - nothing logs a problem;
  - each step gives its expected line;
  - the subject is in the camera's view at `stillAt`.
- Gallery tests cover D6 to D9 with fake observers and media queries.
- The e2e spec `showcase-path` checks five things:
  - one canvas at a time;
  - a drawn picture of more than one colour;
  - Make this into the Creator;
  - reduced motion;
  - no WebGL.

## Consequences

- New users see what MSM makes before they type a name, and one click takes them to the flow that makes it.
- No download size is added, and clips cannot go stale: a changed example changes its clip, and the tests play every clip in CI.
- Home and the New project dialog gain a lazy chunk and one live WebGL context at most. A machine with a blocked GPU sees drawn stills: ADR 0085 D12's open question 3 applies here too.
- The showcase reads Try it and the sim without changing them. Their public members become a contract that `tryit-contract.test.ts` watches.
- Third-party plugins cannot add cards until a contribution point exists (D3).
- `tiles.ts` and `showcases.ts` are both app-side lists of library ids, so a flow renamed in the library must be renamed in both. Tests on both lists fail on an unknown id.

## Status

Proposed (2026-11-22). Plan: `docs/PLAN-showcase.md`, briefs B565–B573. Vetoable defaults:

- the gallery on both Home states and in the New project dialog, not in Easy and Advanced's empty editor area;
- the list in the app, not a plugin contribution;
- the ten cards and their order;
- the Rules card opening the example rather than the Rule book;
- one live clip: hover or focus first, else the first card in view, playing by itself;
- silent clips;
- the **Preview** tag;
- stills kept in memory only;
- the setting **Play showcase clips**, on by default;
- the fold of the Home section once a mod has things;
- the Examples gallery's detail pane playing clips;
- running beside vanilla parity 3 batch 2.
