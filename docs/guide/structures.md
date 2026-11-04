# Structures

This guide shows how to bring a structure you built in Minecraft into MCSuperMods, wire its jigsaw blocks into template pools, make it generate in the world and export it again as `.nbt` or `.schem`. It assumes you know the basics from [Getting started](getting-started.md).

A data pack structure has four parts, each an element in your project:

| Part | Element kind | Sidebar group | What it does |
|---|---|---|---|
| Structure template | structure template | **Structures** | The blocks of one piece, saved as `data/<namespace>/structure/<path>.nbt` |
| Template pool | `template_pool` | **Worldgen** | A weighted list of pieces a jigsaw block can pick from |
| Structure | `structure` | **Worldgen** | The jigsaw structure: its start pool, size, biomes and terrain fitting |
| Structure set | `structure_set` | **Worldgen** | How often and how far apart the structure generates |

A biome tag (in the **Tags** group) says which biomes the structure may start in.

The quickest way to see all of this working is the **Jigsaw village-style structure** starter: click the arrow next to **New** and choose **New from starter…**, then pick it under Themed content. It makes a small hamlet of a hut, streets and lamp posts that generates in every vanilla forest. **Custom biome with a jigsaw structure** adds the same hamlet to a custom biome (see [Worldgen](worldgen.md)).

## Ids are unique across kinds

Every element in a project has its own id, whatever its kind. In Minecraft a structure and its structure set may share a name, because they live in different folders, but in MCSuperMods they cannot. The starters therefore give linked elements different ids: the structure `hamlet` and its structure set `hamlets`, the configured feature `amber_tree` and its placed feature `amber_tree_placed`.

Some templates start a link pointing at the new element's own id (a structure set's structure, for example). Their description says so: after creating the element, point that field at the real element.

## Import a structure

1. Build the piece in a Minecraft world and save it with a structure block (see [Jigsaw blocks in the game](#jigsaw-blocks-in-the-game) below). The game writes it to `saves/<world>/generated/<namespace>/structure/<name>.nbt`.
2. In MCSuperMods choose **File → Import Structure…**. The **Import structure** dialog lists the **Supported files**: structure templates (`.nbt`) and Sponge schematics (`.schem`, as written by WorldEdit and other tools).
3. Choose the **Namespace**, then **Choose files…** and pick one or more files.

Each file becomes a structure template named after the file (lower case, spaces as `_`), listed under **Structures**. A file whose element already exists is skipped; one undo removes the whole import. A file saved by a newer game than the project's target gets the `structures.newer-data-version` note in **Problems**.

To update a template after rebuilding it in the game, select it and choose **Replace from file…** in the Structure Studio. The element keeps its id, so pools that use it keep working; one undo restores the old blocks.

## The Structure Studio

Select a structure template to open the Structure Studio. The **Preview** tab of the dock shows the template in 3D (with your vanilla assets extracted; blocks without a model are drawn with a checker texture).

- The summary shows the **Size**, the number of **Blocks**, the **Palette entries** and the **Jigsaw blocks**.
- **Palette** lists every block state with how many times it is used.
- **Jigsaw blocks** has one card per jigsaw block: **Pool** (with whether the pool is In project, Vanilla or Missing), **Name**, **Target**, **Final state**, **Joint**, **Placement priority** and **Selection priority**.
- **Export structures (.nbt)…** and **Export structures (.schem)…** export every structure template in the project, as described in [Export structures](#export-structures).
- **Advanced (all fields)** shows the whole element as a form.

Blocks themselves cannot be edited in MCSuperMods: change them in the game and use **Replace from file…**. Only the first palette is read when a file has several random palettes.

## Jigsaw blocks in the game

A jigsaw structure is made of pieces joined at jigsaw blocks. A jigsaw block in one piece (the opening) asks a template pool for a piece, and joins it at a jigsaw block of that piece whose name matches.

1. In a creative world with cheats, run `/give @s minecraft:jigsaw` and `/give @s minecraft:structure_block`.
2. Build the piece. Place a jigsaw block where another piece should attach, its front facing out of the piece.
3. In the jigsaw block's screen set the target pool (`<namespace>:<pool>`), its name, the target name (the name of the jigsaw block in the next piece that it should join), what it turns into once placed (often air or the block around it) and the joint type (rollable or aligned, for upward or downward facing jigsaws).
4. Put a structure block in Save mode at a corner, give the structure a name such as `<namespace>:village/hut`, size it around the piece (at most 48 blocks per axis; Detect helps) and save.

You can also leave these fields blank in the game and fill them in the Structure Studio's **Jigsaw blocks** cards after importing: **Pool** is the target pool, **Name** this jigsaw's name, **Target** the name it asks for, **Final state** what it turns into, and **Joint** the joint type.

## Pools and connections

Select a template pool to open the Template Pool Studio.

- **Fallback pool** is used when a piece does not fit or the structure has reached its size limit. Terminator pools (small pieces that open no further jigsaws) make good fallbacks.
- **Pieces** lists the pool's elements. Each has a **Weight** (how likely it is picked), an **Element type** (a single structure template, a list, a feature or the empty element), the **Location** of the structure template, its **Processors** (a processor list, for example one that mosses some cobblestone) and its **Projection** (`rigid` keeps the piece's shape, `terrain_matching` follows the ground, as paths do). Use **Add piece**, the move buttons and remove to change the list.
- **Connections** shows, for every jigsaw block in the pool's pieces from your project, the pool it asks for (In project, Vanilla or Missing) and whether that pool has a piece with a jigsaw of the right name: "<target> found", "No jigsaw named <target>", or "Not checked" when the pool is a vanilla one.
- **Used by** lists the structures that start with this pool and the pools whose pieces point their jigsaws at it; select an id to go there.
- **Advanced (all fields)** shows the whole element as a form.

The **Problems** tab warns about the same things: `structures.jigsaw-target-missing` when no piece of the target pool has a jigsaw of that name, and `structures.pool-empty` when a pool has no pieces and no fallback.

## Make a structure generate

A structure generates only when all of these are in place:

1. A **structure** whose start pool is your first pool. Use the **Jigsaw structure** template under **Add element** (category Structures) and set its start pool, its biomes (a biome tag such as `#<namespace>:has_structure/<name>`), its size (how many jigsaw steps away pieces may be) and the terrain adaptation (`beard_thin` blends the ground under it).
2. A **structure set** that lists the structure. Use **Structure set (random spread)**: `spacing` is the size of the grid cell in chunks with one attempt per cell, and `separation` the minimum distance in chunks; separation must be less than spacing (`structures.set-spacing`). A structure in no set reports `structures.unplaced-structure`.
3. A **biome tag** listing the biomes, from the **Biome tag (has_structure)** template. Listing `#minecraft:is_forest`, for example, covers every vanilla forest.

**Existing worlds and new worlds.** Structure sets are read when a world opens. Install the data pack, close the world and open it again (`/reload` is not enough): new chunks then get your structure, chunks already generated do not. In a new world the structure appears everywhere from the start. Find one with `/locate structure <namespace>:<name>`; `/place structure <namespace>:<name>` places one where you stand.

## Export structures

Two exports write the project's structure templates as files for other tools or for structure blocks:

- **File → More Exports → Export Structures (.nbt)…**, or the arrow next to **Export .zip** on the toolbar, then **More exports → Structures (.nbt) into a folder…**, writes each structure template as `<namespace>/<path>.nbt`.
- **File → More Exports → Export Structures as Sponge Schematics (.schem)…**, or **More exports → Structures as Sponge schematics (.schem)…** from the same toolbar arrow, writes `<namespace>/<path>.schem` (Sponge schematic version 3), for WorldEdit and similar tools.

Both ask for a folder, and both are disabled while the data pack has errors. The **Export structures** buttons in the Structure Studio run the same exports. The ordinary data pack export already contains every structure as `.nbt`, so you need these only outside a data pack.

## Check it in the game

The full in-game check of the sample hamlet and biome, with the exact commands and what to expect, is in the [sample worldgen README](../../fixtures/sample-worldgen/README.md#in-game-check-windows-minecraft-java-263).

## Where next

- [Worldgen](worldgen.md): custom biomes, features and World Types.
- [Templates, starters and examples](templates-and-examples.md).
- [Known limitations](../../README.md#known-limitations).
