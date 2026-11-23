# ADR 0129: Home shows everything, varied ideas, and drawing on Minecraft's own textures

## Context

The user looked at 1.5.7's Home on 2026-11-23 and asked:

- "most of these are similar": the More ideas cards (ADR 0128) are nearly all the same shape. Surprise me (ADR 0086) always starts from a material slot (an ore or a gear set) and adds two to four extras from 18 flow recipes, so card after card is "a set of tools and armour, with its ore, ..." under one of ten theme words (Moss Mod, Frost Mod, Frost Mod again). One of the three pictures on a card (the Moss card's middle one) is drawn smoothed, not pixel for pixel.
- "also add the option to import and draw on the minecraft textures itself."
- "add much more examples, you should be showing everything we can make in the front page, and then display it as if its a professional application".

The library has 82 starters (70 Creator flows), 215 examples and 309 templates; Home shows 13 Showcase cards, the Make something tiles and More ideas. Vanilla textures are read at run time from the user's own client jar into the extraction cache (ADR 0011) and never shipped.

## Decision

**D1 Home shows everything that can be made.** Below the start actions, Home has a gallery of every Creator flow and starter, grouped as the Creator groups them (Blocks, Items and gear, Mobs, Plants, Magic, Machines and storage, Vehicles and keys, Worlds, Games, Rules, Sounds and looks, Data and packs), each card with a picture (its example's clip or drawn still, else the flow's drawn picture), its title, one sentence and **Make this** (and **See the example** where one exists). A group shows one row and **Show all N**; a bar of group chips jumps between groups; the search bar heads it. The Showcase's thirteen cards become the gallery's first row, **Featured**. The gallery is generated from the library's own starters and flows, so a new flow appears on Home by itself; a test fails when a flow has no card.

**D2 An example for every flow.** Every Creator flow and starter gets at least one library example (with its showcase clip where the flow makes something visible), so every gallery card can show a real thing being made. Examples are content in `@msm/plugin-library` (ADR 0020), checked by its tests and mirrored in `examples/`.

**D3 Varied ideas.** More ideas draws each card's lead from all flows, weighted so no group dominates; neighbouring cards never share a lead flow or theme; a card's name comes from its lead thing ("Frost Wolf", "Ember Kart", "Moss Ruins"), not only the theme word. Surprise me's generator keeps its seeds pure and repeatable; the material-first rule stays for the **Surprise me** button only. Every picture on a card is drawn at whole-pixel scale with `image-rendering: pixelated`.

**D4 Draw on Minecraft's own textures.** Wherever a texture is made or edited (New texture, the texture painter, the Block, Item, Mob and Particle Studios' picture fields, Draw…), **Start from a Minecraft texture** opens a picker of the textures in the user's own Minecraft (by name, with search and folders: blocks, items, mobs, particles, GUI), and the chosen picture opens in the painter as the start of the user's own texture. **Change how Minecraft looks** (a Home tile and a Resource Pack Studio action) picks a Minecraft texture, opens it in the painter and saves the result as a resource pack override at the same path, so the game shows the user's version. The picture comes from the user's own jar at that moment; MSM ships none (golden rule), and the exported pack holds only what the user made. Without the Minecraft folder set up, the options say so and offer the set-up.

**D5 A professional look.** Home and the gallery follow one visual system: a header with the product name and the start actions, a consistent card grid (same picture ratio, title, sentence, actions), spacing and type scale from the app's tokens, hover and focus states, skeletons while pictures load, and no layout shift. Screenshots at device scale 2 are part of each brief's report.

## Consequences

- Home grows long; the gallery's pictures load lazily as they come near the view and at most one clip plays (ADR 0118's rule).
- The library grows by one example per flow without one; goldens and the community repo follow.
- First paint must not grow beyond the gallery's code shell (ADR 0126 D4 stop lines).
- Vetoable defaults: the group order, one row per group with Show all, Featured first, the idea naming, Change how Minecraft looks as a Home tile.

## Status

Accepted (2026-11-23, the user's requests on Home; the defaults above are vetoable).
