# Fluids

A **fluid** is a liquid of your own, like water or lava: it flows, fills pools, can be carried in a bucket, and can burn, heal or slow whoever stands in it. It can behave like water, like lava or like neither, with its own colour, pictures, speed and light.

One fluid makes three things: the **liquid block** (what players see and swim in), its **flowing** form, and a **bucket**; it can also have a **cauldron**, a **bottle** and **mixing rules** (what forms where it meets another liquid). The fluid is an element of the project (`msm:fluid`), made without code. It needs the **Fabric mod jar** and works on both Minecraft versions; a vanilla pack leaves it out ([Vanilla packs](#vanilla-packs)).

## Make a fluid

There are four ways:

- on Home, **Make a block** offers the card **Fluid** ("A liquid of your own, with its bucket.") ([Plain words and More options](more-options.md));
- the Creator's **Fluid** flow (group **Blocks**; Fabric mod jar only). Its answers:
  - **What is it called?**, and **How does it behave?**: **Like water: you swim in it and it puts out fire**, **Like lava: it burns, glows and flows slowly** or **Like neither: you walk through it**;
  - **Colour**, and **Pictures**: **Moving water or lava, in my colour** (vanilla's own moving pictures under your colour) or **Still pictures drawn in my colour** (pictures MCSuperMods draws), with **My own picture** to use one of yours;
  - **Light it gives** (0 to 15; 0 keeps the usual: none for water, 15 for lava);
  - **What happens to someone in it?**: **Nothing**, **They heal**, **They move faster**, **They slow down**, **They float up** or **They are poisoned**;
  - **How fast does it flow?** (**As water or lava does**, **Quickly** or **Slowly, like honey**), **How far does it spread?** (**As water or lava does**, **Far** or **Only a little**) and **Two pools make a new one** (**As water or lava does**, **Yes** or **No**);
  - **Mixes with water into**: **Nothing**, **Obsidian and cobblestone, as lava**, **Stone**, **Basalt** or **Mud** (a water-like liquid mixes with lava instead);
  - **Fills cauldrons and bottles**: a cauldron that fills in levels and a bottle that gives the liquid's effect when drunk (a lava-like liquid gets a cauldron that is only full or empty, and no bottle);
  - **Lakes of it in the world**, with **Lakes appear in** (**Anywhere in the overworld**, **Deserts**, **Swamps**, **Forests** or **Badlands**) and **One lake in how many chunks?** (vanilla's lava lakes on the surface are one in 200).

  It creates with its untouched defaults and zero problems;
- **Add from the full list…** (Ctrl+N), the templates under **Fluids**: **Water-like fluid** (a green liquid, `swamp_water`), **Lava-like fluid** (a glowing golden one, `molten_gold`), **Fluid with a cauldron and bottle** and **Fluid that mixes with water**;
- the examples **Oil well** (a thick dark liquid that flows slowly, never refills, slows down whoever wades in and lies in lakes in deserts) and **Berry juice** (a cauldron, a bottle and mixing).

Selecting a fluid opens the Fluid Studio. In My things a fluid's card is a **Liquid**.

## The Fluid Studio

- **Preview** draws the **Still**, **Flowing**, **Overlay** and **Bucket** pictures with the colour multiplied over them. Where a picture is empty it shows vanilla water's or lava's from your Minecraft folder.
- **Liquid**: **Name**, **Bucket name** (empty gives "<Name> Bucket"), and a line **Also makes** that names the bucket item. **Behaves like** is **Water: you swim, float and drown in it, and it puts fires out**, **Lava: it sets you on fire and hurts** or **Neither: you move through it**. **Coloured** and **Colour** tint the pictures. **Explosion resistance** and **Light** (0 to 15) are numbers; lava-like fluids give 15 unless you set it.
- **Flow**: **Speed** (blocks a second), **How far it spreads**, **Looks for a way down** and **Two sources side by side make a new source**. A line says what water or lava does, and **Use the defaults** clears your numbers.
- **Pictures**: **Still surface**, **Flowing surface**, **Overlay, beside glass (optional)** and **Bucket**. A picture with an animation file beside it moves, as water does.
- **Something inside**: **While a mob or player is in it** picks an event.
- **Mixing**: one row a rule, **Mixes with** (water, lava or a liquid), **Source becomes** and **Flowing becomes**; **Add a mixing rule** adds one. With no rules it does not mix (a lava-like liquid keeps the game's own lava behaviour, which differs between the Minecraft versions).
- **Cauldron and bottle**: **Has a cauldron**, with **Fills in levels (a bottle takes or adds one, as water does)** and **Cauldron name** (a lava-like liquid's cauldron is always full: a bucket fills or empties it); **Has a bottle**, with **Bottle name**, **Bottle picture (empty: a potion bottle in its colour)**, **Fills hunger when drunk** (**Hunger restored**, **Saturation**) and **When drunk** (an event). Effects to give are in **Every setting**, at the bottom.

## How it behaves

- **Like water** (the default): you swim, float and drown in it, and it puts out fire. It spreads 7 blocks from a source on flat ground, a block about every quarter of a second, and two sources side by side make a new one, so a bucket never runs dry.
- **Like lava**: it sets you on fire and hurts, lights up the dark (light 15) and flows slowly, 3 blocks from a source, about every one and a half seconds. It never makes new sources.
- **Like neither**: you move through it, and it does not put out fire or hurt. Its flow numbers are water's. On 26.4 you move slowly in it, fall without damage and see through it as through air ([Minecraft 26.3 and 26.4](#minecraft-263-and-264)).

**Speed**, **How far it spreads** and **Looks for a way down** are the game's three flow numbers in words. A fluid starts to spread one **Speed** step after you pour it. It finds a hole to run down within its **Looks for a way down** distance and one block more.

## Pictures and colour

A fluid draws two pictures: still (on top of a pool) and flowing (down the sides and on slopes), and optionally an overlay (what you see on glass beside it). MCSuperMods never ships Mojang's pictures: by default the fluid names vanilla water's or lava's, which your own Minecraft supplies, and multiplies your **Colour** over them. A fluid you draw yourself uses your pictures. The pictures live in the fluid's block model (`still`, `flowing` and `overlay`), which the Fluid Studio keeps in step with its **Pictures**.

The game reads a fluid's model when it starts and from the mod that made it, so a resource pack cannot point the liquid at other pictures; it can repaint the liquid by putting its own pictures at the same texture paths (the fluid's still, flowing and overlay pictures). To change the pictures for everyone, change them in the project and make the jar again.

## Boats

Vanilla boats float, paddle and glide on a water-like liquid of yours as on water, with no setting. On 26.4 a boat may lose speed near the edge of a pool's source blocks: check it in the game.

## Buckets

Each fluid has a bucket, `<id>_bucket`, in the creative inventory's **Tools and Utilities** tab. It picks up a source of the fluid, pours it out again and leaves an empty bucket. A dispenser pours it as it does a water bucket. A bucket stacks to 1.

## Where it meets another liquid

A mixing rule says what forms where your liquid meets **water**, **lava** or one named liquid (yours or Minecraft's): **Source becomes** is the block a still pool of yours turns into, as lava's obsidian, and **Flowing becomes** the block its flowing liquid turns into, as lava's cobblestone. A rule needs one of the two, and each meeting makes one block. Rules that name a liquid are tried before **water** and **lava**, and the first rule that fits wins. The change plays the game's fizz. With rules set, the game's own lava rule no longer applies to your liquid, so it works the same on 26.3 and 26.4.

## Cauldrons and bottles

**Has a cauldron** makes the block `<id>_cauldron`. Your bucket fills Minecraft's empty cauldron and takes a full one back. With **Fills in levels**, a cauldron of a water-like liquid has three levels, as water's has: a glass bottle takes one, a bottle of the liquid adds one, and the bucket takes only a full one. Without it, or on a lava-like liquid, the cauldron is only full or empty, as lava's is. A mob or player inside gets the liquid's **While a mob or player is in it** event; a water-like cauldron puts out burning things and uses up a level each time.

**Has a bottle** makes the item `<id>_bottle`. A glass bottle used on a source of the liquid, or on its cauldron with levels, fills it. It is drunk like a potion in 1.6 seconds, gives its hunger and effects, runs **When drunk** and leaves a glass bottle. Bottles stack to 16.

## Something inside

**While a mob or player is in it** runs an event on whatever is in the fluid, as a block's **On entity inside** does ([Blocks and items](blocks-and-items.md#events-and-actions)): the thing in the fluid is `self`. It runs on the server, at most once every 10 ticks for each thing, however many blocks of the fluid it touches. The Creator's **What happens to someone in it?** makes one for you.

## Lakes

The Creator's **Lakes of it in the world** adds a lake feature to the biomes you choose. A lake in 26.x needs three block checks MCSuperMods writes for you, and it keeps lakes off blocks that vanilla's own lakes avoid. Only newly generated chunks get lakes ([Worldgen](worldgen.md)). The vanilla lava lake values were not checked against the game: judge the look in the game.

## Minecraft 26.3 and 26.4

You make a fluid the same way on both. What differs:

- **26.3** keeps still and flowing liquid apart: each fluid is two fluids in the game (`<id>` and `flowing_<id>`) and the tag lists both. The Fluid Studio says so under **Liquid**: "Minecraft 26.3 keeps still and flowing liquid apart; both are made for you."
- **26.4** has one fluid that knows both forms. Swimming uses a new tag, and a fluid that behaves like neither has no fog there: Problems says players see through it as through air, so choose water or lava if you want it to look like a liquid.
- **A small hook into the game on 26.4.** The game has no setting for "this fluid counts as water", so on 26.4 the runtime adds one small hook (a Mixin) that makes a water-like fluid count as water and a lava-like one as lava for swimming, drowning and burning. Tests check it is applied.
- **Where fluids meet.** Without mixing rules, what the game itself does where water or lava touches your fluid differs between the two versions: on 26.3 a lava-like fluid mixes with water as lava does, on 26.4 only Minecraft's own lava does. Give the fluid mixing rules to make both versions alike.
- **Fog.** On 26.3 a water-like fluid shows water's fog colour under its surface; a colour of its own waits for a later client update.

## Problems

**Problems** says, in plain words: a bucket with the same name as another thing in your mod (rename one), a fluid that looks further for a way down than it can spread, a fluid missing one of its pictures (it looks like plain water or lava there), a fluid that behaves like nothing (see through as air), a fluid whose **Something inside** names an event it no longer has (the game would refuse the fluid), a mixing rule that makes nothing, mixes with the liquid itself, repeats another rule or makes a liquid instead of a solid block, a cauldron whose name another thing or one of Minecraft's cauldrons already has, and **Fills in levels** on a lava-like liquid (a note: it stays full only). They also appear in **Things to fix**.

## Vanilla packs

A fluid is not in the resource or data pack exports: it needs the runtime. Its fluid, `flowing_` form, liquid block, bucket, cauldron, bottle and tags are mod-only; where a vanilla tag lists them it does so as optional entries, so a game without the mod ignores them, and recipes that use a project bucket or bottle are left out. The [Java project export](eject.md) (Minecraft 26.3) includes fluids with their buckets, mixing, cauldrons and bottles.

## Check it in Try it

[Try it](try-it.md) lists your buckets in the picker. A bucket pours one source block of the fluid, drawn with its still picture on top, its flowing picture on the sides and its colour. **The fluid does not flow in the preview**: it stays where you pour it, and **What happened** says how it flows in the game in words. Standing in it runs **While a mob or player is in it** at most every 10 ticks. Cauldrons fill and empty by bucket and bottle as in the game, a glass bottle fills from a source you look at, a bottle is drunk at once with its **When drunk**, and mixing runs after every action, as a line in **What happened** with the block it made. Boats float on water-like liquids. How you swim, drown or burn, the light, and the bucket filling again are said, not shown.

## The in-game check

Press **Play** (or export the Fabric mod jar) and, in a creative world:

1. Find the bucket in **Tools and Utilities** and pour it. It flows at the speed you chose and spreads as far as you chose; with **Two pools make a new one**, dig two pools side by side and see the gap fill.
2. Swim in it, drown in it and stand in it on fire; lava-like fluids burn and glow; **Something inside** applies its event after a moment.
3. Look from above, from the side and through glass: the still, flowing and overlay pictures and the colour.
4. Pick it up with an empty bucket, and pour it from a dispenser.
5. Mixing: pour water or lava next to a source and next to flowing liquid, and see the two blocks form, with the fizz.
6. A cauldron: pour the bucket into Minecraft's empty cauldron, take a level with a glass bottle, add it back with a bottle, take the full cauldron back with the bucket. Drink a bottle.
7. A boat on a water-like pool.
8. The log: `[msm_runtime]` says `registered N fluid(s)` and `registered N fluid cauldron(s) and N fluid bottle(s)`.

The sample project `fixtures/sample-villagers-and-fluids` has a checklist for 26.3 and 26.4, with `brine` (water-like, makes anything in it glow) and `molten_amber` (lava-like, light 12): [`fixtures/sample-villagers-and-fluids/README.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-villagers-and-fluids/README.md).

## Limits

- **No pipes, tanks or buoyancy of your own.** A fluid is water-like, lava-like or neither by its tags: you cannot make boats float on it differently, waterlog blocks with it or set how hard it pushes.
- **One block per meeting.** A mixing rule makes one block where the two liquids meet; source and flowing can make different blocks, as lava's obsidian and cobblestone.
- **A cauldron holds three levels or is full, in the liquid's own colour.** There are no mixtures in a cauldron, as potions have. Dispensers do not fill or empty your cauldrons or bottles, and powder snow does not go into them.
- **No fire spread, lava particles or random ticks for lava-like fluids.** A lava-like fluid hurts and ignites whoever is in it, but it does not set nearby blocks on fire, throw sparks or take part in random ticks.
- **A resource pack repaints, but cannot re-point, its pictures** (above).
- **New fluids, cauldrons and bottles need a restart.** They are registered when the game starts; Play restarts it for you.
- **Try it does not flow** and shows no swimming, light or bucket refilling; mixing is a line in **What happened** ([Try it](try-it.md)).
- **Looks are in-game checks.** Colour, overlay and the look of a flowing fluid are best checked in the game.

## Where next

- [Villagers, traders and pets that carry things](villagers-and-traders.md), the other half of this batch.
- [Blocks and items](blocks-and-items.md) for events and actions.
- The other chapters are listed in the [user guide](/).
