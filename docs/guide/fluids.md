# Fluids

A **fluid** is a liquid of your own, like water or lava: it flows, fills pools, can be carried in a bucket, and can burn, heal or slow whoever stands in it. It can behave like water, like lava or like neither, with its own colour, pictures, speed and light.

One fluid makes three things: the **liquid block** (what players see and swim in), its **flowing** form, and a **bucket**. The fluid is an element of the project (`msm:fluid`), made without code. It needs the **Fabric mod jar** and works on both Minecraft versions; a vanilla pack leaves it out ([Vanilla packs](#vanilla-packs)).

## Make a fluid

There are four ways:

- in Very easy mode, **Make a block** offers the card **Fluid** ("A liquid of your own, with its bucket.") ([Very easy mode](very-easy.md));
- the Creator's **Fluid** flow (group **Blocks**; Fabric mod jar only). Its answers:
  - **What is it called?**, and **How does it behave?**: **Like water: you swim in it and it puts out fire**, **Like lava: it burns, glows and flows slowly** or **Like neither: you walk through it**;
  - **Colour**, and **Pictures**: **Moving water or lava, in my colour** (vanilla's own moving pictures under your colour) or **Still pictures drawn in my colour** (pictures MCSuperMods draws), with **My own picture** to use one of yours;
  - **Light it gives** (0 to 15; 0 keeps the usual: none for water, 15 for lava);
  - **What happens to someone in it?**: **Nothing**, **They heal**, **They move faster**, **They slow down**, **They float up** or **They are poisoned**;
  - **How fast does it flow?** (**As water or lava does**, **Quickly** or **Slowly, like honey**), **How far does it spread?** (**As water or lava does**, **Far** or **Only a little**) and **Two pools make a new one** (**As water or lava does**, **Yes** or **No**);
  - **Lakes of it in the world**, with **Lakes appear in** (**Anywhere in the overworld**, **Deserts**, **Swamps**, **Forests** or **Badlands**) and **One lake in how many chunks?** (vanilla's lava lakes on the surface are one in 200).

  It creates with its untouched defaults and zero problems;
- **Add element** (Ctrl+N), the templates under **Fluids**: **Water-like fluid** (a green liquid, `swamp_water`) and **Lava-like fluid** (a glowing golden one, `molten_gold`);
- the example **Oil well**: a thick dark liquid that flows slowly, never refills, slows down whoever wades in and lies in lakes in deserts.

Selecting a fluid opens the Fluid Studio. In My things in Very easy mode a fluid's card is a **Liquid**.

## The Fluid Studio

- **Preview** draws the **Still**, **Flowing**, **Overlay** and **Bucket** pictures with the colour multiplied over them. Where a picture is empty it shows vanilla water's or lava's from your Minecraft folder.
- **Liquid**: **Name**, **Bucket name** (empty gives "<Name> Bucket"), and a line **Also makes** that names the bucket item. **Behaves like** is **Water: you swim, float and drown in it, and it puts fires out**, **Lava: it sets you on fire and hurts** or **Neither: you move through it**. **Coloured** and **Colour** tint the pictures. **Explosion resistance** and **Light** (0 to 15) are numbers; lava-like fluids give 15 unless you set it.
- **Flow**: **Speed** (blocks a second), **How far it spreads**, **Looks for a way down** and **Two sources side by side make a new source**. A line says what water or lava does, and **Use the defaults** clears your numbers.
- **Pictures**: **Still surface**, **Flowing surface**, **Overlay, beside glass (optional)** and **Bucket**. A picture with an animation file beside it moves, as water does.
- **Something inside**: **While a mob or player is in it** picks an event.

## How it behaves

- **Like water** (the default): you swim, float and drown in it, and it puts out fire. It spreads 7 blocks from a source on flat ground, a block about every quarter of a second, and two sources side by side make a new one, so a bucket never runs dry.
- **Like lava**: it sets you on fire and hurts, lights up the dark (light 15) and flows slowly, 3 blocks from a source, about every one and a half seconds. It never makes new sources.
- **Like neither**: you move through it, and it does not put out fire or hurt. Its flow numbers are water's. On 26.4 you move slowly in it, fall without damage and see through it as through air ([Minecraft 26.3 and 26.4](#minecraft-263-and-264)).

**Speed**, **How far it spreads** and **Looks for a way down** are the game's three flow numbers in words. A fluid starts to spread one **Speed** step after you pour it. It finds a hole to run down within its **Looks for a way down** distance and one block more.

## Pictures and colour

A fluid draws two pictures: still (on top of a pool) and flowing (down the sides and on slopes), and optionally an overlay (what you see on glass beside it). MCSuperMods never ships Mojang's pictures: by default the fluid names vanilla water's or lava's, which your own Minecraft supplies, and multiplies your **Colour** over them. A fluid you draw yourself uses your pictures. The pictures live in the fluid's block model (`still`, `flowing` and `overlay`), which the Fluid Studio keeps in step with its **Pictures**.

The game reads a fluid's pictures when it starts and from the mod that made them: a resource pack cannot change them. Change them in the project and make the jar again.

## Buckets

Each fluid has a bucket, `<id>_bucket`, in the creative inventory's **Tools and Utilities** tab. It picks up a source of the fluid, pours it out again and leaves an empty bucket. A dispenser pours it as it does a water bucket. A bucket stacks to 1.

## Something inside

**While a mob or player is in it** runs an event on whatever is in the fluid, as a block's **On entity inside** does ([Blocks and items](blocks-and-items.md#events-and-actions)): the thing in the fluid is `self`. It runs on the server, at most once every 10 ticks for each thing, however many blocks of the fluid it touches. The Creator's **What happens to someone in it?** makes one for you.

## Lakes

The Creator's **Lakes of it in the world** adds a lake feature to the biomes you choose. A lake in 26.x needs three block checks MCSuperMods writes for you, and it keeps lakes off blocks that vanilla's own lakes avoid. Only newly generated chunks get lakes ([Worldgen](worldgen.md)). The vanilla lava lake values were not checked against the game: judge the look in the game.

## Minecraft 26.3 and 26.4

You make a fluid the same way on both. What differs:

- **26.3** keeps still and flowing liquid apart: each fluid is two fluids in the game (`<id>` and `flowing_<id>`) and the tag lists both. The Fluid Studio says so under **Liquid**: "Minecraft 26.3 keeps still and flowing liquid apart; both are made for you."
- **26.4** has one fluid that knows both forms. Swimming uses a new tag, and a fluid that behaves like neither has no fog there: Problems says players see through it as through air, so choose water or lava if you want it to look like a liquid.
- **A small hook into the game on 26.4.** The game has no setting for "this fluid counts as water", so on 26.4 the runtime adds one small hook (a Mixin) that makes a water-like fluid count as water and a lava-like one as lava for swimming, drowning and burning. Tests check it is applied.
- **Where fluids meet.** Water or lava touching your fluid is not turned into stone, cobblestone or obsidian by MCSuperMods, and what the game itself does can differ between the two versions. Test any pool that meets another liquid.

## Problems

**Problems** says, in plain words: a bucket with the same name as another thing in your mod (rename one), a fluid that looks further for a way down than it can spread, a fluid missing one of its pictures (it looks like plain water or lava there) and a fluid that behaves like nothing (see through as air). In Very easy mode they appear in **Things to fix**.

## Vanilla packs

A fluid is not in the resource or data pack exports: it needs the runtime. Its fluid, `flowing_` form, liquid block, bucket and tags are mod-only; where a vanilla tag lists them it does so as optional entries, so a game without the mod ignores them, and recipes that use a project bucket are left out. The [Java project export](eject.md) leaves fluids out with a warning.

## Check it in Try it

[Try it](try-it.md) lists your buckets in the picker. A bucket pours one source block of the fluid, drawn with its still picture on top, its flowing picture on the sides and its colour. **The fluid does not flow in the preview**: it stays where you pour it, and **What happened** says how it flows in the game in words. Standing in it runs **While a mob or player is in it** at most every 10 ticks. How you swim, drown or burn, the light, and the bucket filling again are said, not shown.

## The in-game check

Press **Play** (or export the Fabric mod jar) and, in a creative world:

1. Find the bucket in **Tools and Utilities** and pour it. It flows at the speed you chose and spreads as far as you chose; with **Two pools make a new one**, dig two pools side by side and see the gap fill.
2. Swim in it, drown in it and stand in it on fire; lava-like fluids burn and glow; **Something inside** applies its event after a moment.
3. Look from above, from the side and through glass: the still, flowing and overlay pictures and the colour.
4. Pick it up with an empty bucket, and pour it from a dispenser.
5. The log: `[msm_runtime]` says `registered N fluid(s)`.

The sample project `fixtures/sample-villagers-and-fluids` has a checklist for 26.3 and 26.4, with `brine` (water-like, makes anything in it glow) and `molten_amber` (lava-like, light 12): [`fixtures/sample-villagers-and-fluids/README.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-villagers-and-fluids/README.md).

## Limits

- **Not mixing, cauldrons, bottles, pipes, boats or buoyancy of your own.** A fluid is water-like, lava-like or neither by its tags: it does not fill cauldrons or bottles, you cannot make boats float on it differently, and you cannot set how hard it pushes.
- **No fire spread, lava particles or random ticks for lava-like fluids.** A lava-like fluid hurts and ignites whoever is in it, but it does not set nearby blocks on fire, throw sparks or take part in random ticks.
- **A resource pack cannot change its pictures** (above).
- **Fluids in the Java project export** are left out with a warning.
- **Try it does not flow** and shows no swimming, light or bucket refilling ([Try it](try-it.md)).
- **Looks are in-game checks.** Colour, overlay and the look of a flowing fluid are best checked in the game.

## Where next

- [Villagers, traders and pets that carry things](villagers-and-traders.md), the other half of this batch.
- [Blocks and items](blocks-and-items.md) for events and actions.
- The other chapters are listed in the [user guide](/).
