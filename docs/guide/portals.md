# Portals

MCSuperMods makes portal blocks like the Nether portal: players build a frame, light it, step into the glowing surface and arrive in another dimension, and the way back is a portal there. A portal can lead to a dimension of your own (from the Dimension flow or the Portal flow), to the Nether or to the End. It has a frame block or tag of your choosing, an item that lights it (or none, so that an event lights it), a travel scale, a delay, particles, sounds and an `On travel` event.

A portal is a block, so portals are part of the Fabric mod: export the **Fabric mod jar** ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)) or use **Test in Minecraft**. They need the runtime that ships with this release; an older runtime ignores them. A vanilla data pack cannot add a block, so the vanilla packs carry the dimension but never the portal (see [Vanilla packs](#vanilla-packs)).

There are three ways to make one:

- the Creator's **Portal** flow (group **Worlds**), which can also make the dimension it leads to;
- the **Dimension** flow, whose **How to get there** has **A portal (needs the Fabric mod jar)**;
- **Add from the full list…** (Ctrl+N) and a template under **Portals**, or the **Portal** section of the [Block Studio](blocks-and-items.md#the-block-studio) for a block you already have.

## Make a portal in the Creator

Open the Creator and choose **Portal** under **Worlds**. The defaults make a working portal called `sky_portal` to a new dimension called `sky_realm`: the frame is built of a new frame block, flint and steel lights it, and one block there is one block here.

- **Portal**: **Portal name**.
- **Where it goes**: **Where it goes** (**A new dimension (choose its terrain, biome and sky below)**, **The Nether**, **The End** or **Another dimension, by its id (below)**), **New dimension name**, then **Terrain**, **Biome** and **Sky and rules** as in the [Dimension flow](creator.md#make-a-dimension), and **Other dimension** for an id such as `demo:ruby_realm`.
- **Frame**: **Frame** (**A new frame block in the portal colour**, **Crying obsidian**, **Block of gold**, **Block of quartz**, **Prismarine bricks** or **Purpur block**) and **Light it with** (**Flint and steel**, **A new key item (64 uses)**, **A fire charge** or **An eye of ender**).
- **Travel**: **Scale** (**1:1, one block there is one block here** or **8:1 like the Nether, one block there is eight here**) and **Wobble and overlay when entering**.
- **Looks**: **Portal colour**, **Particles** (**Portal sparkles** or **Coloured dust in the portal colour**) and **Sounds** (**The portal hum and whoosh** or **Quiet**).

**Create** adds the portal block, its see-through surface texture and, for the new frame block, a recipe from obsidian and a texture. A new dimension also gets a travel function, `<dimension>/travel`, so a vanilla data pack still has a way in (see [Vanilla packs](#vanilla-packs)). The game loads new dimensions when a world opens, so reopen your world after adding one.

The Dimension flow's portal answer makes the same portal and dimension; its **Key or portal colour** colours the portal and its frame, or the key item if you chose a key.

## The Portal section

Selecting a block shows **Type** in the Block Studio; choose **Portal** there and the **Portal** section appears with three groups. Switching a block to a portal keeps only the settings a portal takes, drops the block item (a portal has none) and writes a frame of crying obsidian and the Nether as a start; one undo step takes it back.

### Frame

- **Frame block or #tag**: the blocks players build the frame of. A `#tag` such as `#minecraft:logs` accepts any block in it, read when the portal is lit, so a tag changed by `/reload` takes effect at once.
- **Exit portals are built of**: the block the game builds exit portals of. Offered for a tag frame, which needs one block named here; for a single block it is that block.
- **Light it with (item or #tag)**: the item that lights the frame when used on the inside of it. **Nothing: a trigger lights it** leaves it to an event (see [Light a portal from an event](#light-a-portal-from-an-event)).

### Travel

- **Destination** is required; **Comes back to** is where the portal leads from the destination (the overworld unless you pick another).
- **Scale**: **From the dimensions** (8 to 1 between the overworld and the Nether, 1 to 1 otherwise) or **A number**, which is **Blocks back home per block there**. The button **8:1 like the Nether** sets 8.
- **Arrive**: **In a linked portal** finds the nearest portal of the same block or builds one; **On the ground** lands on the first standing spot at the target and builds nothing.
- **Delay (ticks)** and **Cooldown (ticks)**: how long a player stands in the portal before it works, and how long before the same traveller can use one again. Empty means vanilla's.
- **Players only** (on, mobs, items and vehicles stay), **Wobble and overlay** (the Nether portal's screen wobble and swirl while standing in it) and the event **On travel**.

### Looks

- **Particle type** (a vanilla particle without options or a particle of your own, see [Particles](particles.md)), **Particles per tick** (0 to 16) and **Colour** (with a clear button): a colour makes the particles coloured dust.
- **Ambient sound** and **Travel sound**, each with a **None** choice.
- **Textures** has a single slot, **Portal surface**. The portal's two models are made from it. Leave it empty for the Nether portal's own picture. A colour tint needs a PNG of its own.

## Build and light a portal

A frame is an upright rectangle of frame blocks with an opening **2 to 21 blocks wide and 3 to 21 high**, facing east-west or north-south. The four corners are not needed. The opening may hold only air, fire or the portal itself.

Use the igniter on the inside of the finished frame and the opening fills with the portal. A flint and steel loses one durability and any other igniter is used up one at a time; nothing is used in creative mode. Lighting plays the flint and steel sound. Breaking a frame block or the portal turns the whole portal back into air, as for the Nether portal.

Two portals with the same frame and the same igniter conflict: the game lights the one with the first id. **Problems** warns (`blocks-items.portal-frame-clash`); use another frame or igniter, or `Nothing` for one of them.

## Light a portal from an event

With **Nothing: a trigger lights it**, or for a portal that something else should open, use the action **Light a portal (light_portal)** in the Events editor of a block, item or effect: for example a button block's **On interact** beside the frame, or an item's **On use on a block**. The picker lists the project's portals. The action lights the portal at the event's block (or one of the six blocks around it) when an empty frame is there, and does nothing otherwise.

## Where you arrive

The target position is where you stood, times the **Scale**, kept inside the world border. Then:

- **In a linked portal** looks for the nearest portal of the same block near that spot (within 16 blocks at 1:1, up to 128 for a dimension scaled eight to one) and otherwise builds an exit portal of the frame block, 2 by 3, on solid ground nearby. You keep your place in the portal and which way you face.
- **On the ground** lands you on the first standing spot of that column and builds nothing. In a world with no ground there it falls back to building a portal on a platform of the frame block.
- Travellers other than players follow the same rules; **Players only** keeps them back.
- Portals link only to portals of the same block. A portal placed by `/fill`, a structure or another mod links the first time something uses it.

## Vanilla packs

A portal cannot exist in a vanilla pack: it is a block, and only the Fabric mod can add blocks. The exports keep what a vanilla game can read and leave out the rest:

- the dimension and the travel function stay, so in a vanilla pack run `/function <namespace>:<dimension>/travel` to go there and back;
- the portal's definition and events are part of the mod only;
- recipes and loot tables that name the frame block or the key item are left out of the vanilla data pack (`export.mod-only-reference`, shown in **Problems**), and a function that places the portal block is kept with a note (`export.mod-only-function`);
- the portal block is added to the `#minecraft:portals` block tag as an optional entry.

Keep your own frame block out of the dimension's flat layers and features: a vanilla server could not load a dimension that names a block it does not have.

## Problems it reports

| Code | Meaning |
|---|---|
| `blocks-items.portal-destination-unknown` | The destination is neither a dimension of the project nor a vanilla one. |
| `blocks-items.portal-same-dimension` | The destination and **Comes back to** are the same dimension. |
| `blocks-items.portal-frame-unknown` | The frame block or tag, or the block exits are built of, does not exist. |
| `blocks-items.portal-frame-block-needed` | The frame is a tag, so **Exit portals are built of** must name a block. |
| `blocks-items.portal-igniter-unknown` | The item or tag that lights the portal does not exist. |
| `blocks-items.portal-frame-clash` (warning) | Another portal has the same frame and igniter and wins. |
| `blocks-items.portal-particle-options` | A colour needs the dust particle; other particle types cannot take one. |
| `blocks-items.portal-sound-unknown` (warning) | A sound is not a vanilla sound or a sound of the project. |
| `blocks-items.portal-event-unknown` | **On travel** names an event the block does not declare. |
| `blocks-items.light-portal-not-portal` | A **Light a portal** action names a block that is not a portal. |
| `blocks-items.component-not-for-type` | A portal takes only breakable, light, break, place, random tick and entity-inside settings. |

## What it cannot do

- **Portals need the Fabric mod jar.** Vanilla data and resource packs cannot add a block, so they carry the dimension and the travel function, not the portal.
- **The entry effect is the Nether's.** Standing in any portal with **Wobble and overlay** on draws the Nether portal's purple swirl and plays its sound. Switch it off for none; a swirl of your own colour is not possible yet.
- **Particles of your own work.** The portal's **Particle type** lists the project's particles first; the Portal flow's **Particles** answer stays at the two choices.
- **Coloured particles are dust.** A **Colour** makes coloured dust; the sparkling portal particle stays purple.
- **Upright rectangles only**, 2 to 21 wide and 3 to 21 high. There are no floor portals like the End's.
- **Only the igniter or the action lights a frame.** Lightning, fire spread, lava and a dispenser with flint and steel do not.
- **The first trip can hitch.** Finding or building the exit generates chunks, as the Nether's does.
- **Floating islands and End-like terrain** can have no ground at the target; **In a linked portal** then builds a platform of the frame block.
- **Fixed at start-up.** Adding a portal or changing its destination needs a game restart. Frame and igniter tags reload with `/reload`.
- **Client and server must match.** Each side reads its own copy of the definitions; update the client and the server with the same mod jar, or they can disagree about the overlay or the particles.
- **One block, two dimensions.** A chain of three dimensions needs two portal blocks, and two portal blocks never share exits.
- **The Nether rule applies.** A portal to the Nether does not work while the game rule `allow_entering_nether_using_portals` is off.
- **Arriving in the End** does not start the dragon fight; you land near the scaled position, often the main island. The **Portal to the End** template lands you on the ground.
- **No dimension types.** Portals lead to vanilla dimension types; the `dimension_type` kind is for those who want their own.
- **The Java project export covers 26.3 only**, as every runtime feature does.
- **The links are the mod's own.** Portals placed some other way are linked only after something has used them, and removing the mod forgets the links.

## In the game

Export the **Fabric mod jar** or use **Test in Minecraft**; **Problems** must show no errors. Then, in a creative world:

- find the frame block in the creative inventory (or craft it) and build a frame; light it with the igniter; walk in, wait for the screen to wobble and arrive;
- look around the exit: it should be a portal of your frame block that you can walk back through;
- try the scale: walk 80 blocks and come back, and check that an 8:1 portal brings you back 640 blocks away;
- for a trigger-lit portal, press the button or use the item beside the frame;
- check the sound and the particles.

## Templates and example

Under **Portals** in **Add from the full list…**: **Portal to the Nether** (crying obsidian, eight to one, ember-orange dust), **Portal to the End** (end stone bricks, lands on the ground, reverse portal particles) and **Trigger-lit portal** (quartz frame that no item lights). The example **Two-way sky portal** is a portal to a flat sky dimension, lit with flint and steel or by a beacon block, with blue dust and an `On travel` function.

## Troubleshooting

| Problem | What to do |
|---|---|
| The igniter does nothing | Use it on the inside of the finished frame, not on the frame. Check the frame size, that the opening holds only air, and that no other portal has the same frame and igniter. |
| The portal fills but nothing happens when you walk in | The destination dimension is not in the world: reopen the world after adding a dimension. The game log's `[msm_runtime]` lines name a portal whose dimension is missing. |
| The portal was there and has gone | A frame block or a block inside was changed. Rebuild the frame and light it again. |
| You arrive in a hole or under a platform | The exit was built where the ground was missing: see [Where you arrive](#where-you-arrive). Choose **On the ground** for terrain without caves. |
| The vanilla data pack has no portal | That is expected: use the travel function, or the mod jar. |
| Overlay and sound are the Nether's | See [What it cannot do](#what-it-cannot-do); turn off **Wobble and overlay** to remove them. |

The other chapters are listed in the [user guide](/).
