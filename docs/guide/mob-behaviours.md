# Mob behaviours

A mob made with MCSuperMods can be more than something that wanders and hits: it can fly or swim, shoot arrows or snowballs, be tamed into a pet, breed and have babies, be ridden with a saddle, wear one of several skins and show a boss bar. This page covers those parts of the **Entity Studio**. The basics (importing a model, goals, spawning, spawn eggs, events and the preview) are in [Entities and models](entities-and-models.md).

Everything here works in the **Fabric mod jar** only, like every mob, and on both Minecraft versions: on 26.3 the mobs are drawn by GeckoLib or by the built-in renderer, on the 26.4 snapshot by the built-in renderer (see [Choose how the mob is drawn](#choose-how-the-mob-is-drawn)).

## The quick way: the Creator flows

The **Creator** (the **Create** button, see [The Creator](creator.md)) has six flows under **Mobs** that set these parts up from a few questions. Each one makes the mob, its model, animations, skin, variants, spawn egg and loot, and you can open the result in the Entity Studio afterwards.

| Flow | Makes | Questions worth knowing |
|---|---|---|
| **Pet** | An animal you tame with a food; it sits when told, follows and defends you, and has babies | **Pet name**, **Model**, **Taming food**, **Sits when told**, **Defends you**, **Can have babies**, **Breeding food** |
| **Farm animal** | An animal you breed with a food, with babies and drops | **Animal name**, **Breeding food**, **Baby size**, **Drops**, **Can be ridden** |
| **Mount** | A mob you ride and steer | **Mount name**, **Needs a saddle**, **Speed**, **Jump strength**, **Only its owner can ride it**, **Flying** |
| **Flying mob** | A mob that flies and hovers: peaceful, neutral, hostile or a shooter | **Mob name**, **Behaviour**, **Flying speed** |
| **Water mob** | A fish, a dolphin-like swimmer or an amphibian | **Mob name**, **Kind**, **Behaviour** |
| **Boss** | A large monster with a boss bar | **Boss name**, **Size**, **Attacks**, **Boss bar colour**, **Boss bar style**, **Darkens the sky**, **Drops** |

Every mob flow asks for a **Model** (a four-legged mob, a bird, a fish, a round flyer or a two-legged mob, all with ready-made animations that you can replace with your own Blockbench model later), a **Colour** or **Skin picture**, and, except for the **Boss** (which has no variants and appears only from its spawn egg), up to three **Extra variants** (each with a colour, a picture and where it appears) and **Spawns in**. The older **Custom mob** flow gained a **Hostile archer** behaviour and the same variants.

## Kind of mob and Base

The **Kind of mob** section is the first stop when you make a mob by hand. **Kind of mob** offers **Creature**, **Farm animal**, **Pet**, **Monster**, **Flying creature**, **Water creature**, **Fish** and **Ambient**. Picking one sets the base, the category, the movement and the spawn placement and rule together; every value stays editable afterwards.

**Base** is the kind of vanilla mob the new mob is built on:

- **Mob (plain)** is what every mob was before: a simple mob with goals.
- **Animal (babies, taming, breeding)** has ages, babies, leads and the animal spawn check. Taming and breeding need it: if a mob has **Taming** or **Breeding** on another base, the game leaves the component out and **Problems** says so.
- **Monster (enemy)** counts as an enemy: iron golems attack it, it disappears in peaceful difficulty and it has hostile sounds.

The base is fixed when the game starts. Changing it on a mob that already exists needs a restart of the game, and mobs already in a world load into the new class; if you move a pet off **Animal**, its owner and age are forgotten.

## Movement

The **Movement** section's **Moves by** chooses:

- **Walks**: the default.
- **Flies**: it flies and, with **Hovers in place when idle**, stays in the air like a bee. **Flying speed** is its speed in the air (a bee has 0.6, a parrot 0.4). It takes no fall damage.
- **Swims (lives in water)**: it swims about like a fish or a dolphin. It flops on land and takes damage after **Dries out after (ticks)** out of water. Tick **Breathes air (surfaces like a dolphin)** for a swimmer that must come up for air. A swimmer needs a **Speed** near 1 (a dolphin has 1.2), unlike a walker.
- **Walks and swims**: an amphibian, like an axolotl, that walks on land and swims in water.

**Step height** is how tall a block it climbs without jumping. A water mob should use a water category (**Water creature** or **Fish** in **Kind of mob**); **Problems** points out a swimmer in a land category.

## Ranged attacks

Tick **Shoots projectiles** in **Ranged attack**. **Projectile** lists arrows, snowballs, fire charges, wind charges and eggs, and the throwables of your project (see [Status effects and throwables](effects-and-throwables.md)). **Arrow damage** applies to arrows; other projectiles deal their own damage. **Projectile speed**, **Inaccuracy**, **Ticks between shots**, **Aiming ticks**, **Range**, **Shoot sound** and **On shoot** (an event run on each shot) finish the setup.

Shooting needs the **Ranged attack** goal: choose **Add a ranged attack goal** below the section, or add it in **Behaviour**. Without the goal the mob never shoots, and without the component the goal does nothing; **Problems** warns about both. **Circles its target** makes it strafe like a skeleton. Its targets and **Fights back when hurt** work as for the melee goal.

The mob does not hold a bow or any weapon in its hand: the shot just appears, and the model's `shoot` animation (see [Animations for states](#animations-for-states)) is what shows it.

## Taming

Tick **Can be tamed** in **Taming** (the mob needs the **Animal** base). **Taming food** lists items or `#` tags, **Chance per item** is the chance each food item tames it, **Health once tamed** is its new maximum health and **On tame** is an event that runs when it happens. The owner can then:

- tell it to sit with a right click of an empty hand (**Sits when told (owner's right click)**);
- have it follow (**Follows its owner**, with **Follow speed**, **Starts following at** and **Stops at** in blocks) and teleport to catch up;
- have it fight for them (**Defends its owner**).

A tamed swimmer does not follow its owner, because only walking and flying mobs can. On a mob that can also be ridden, an owner's right click with an empty hand mounts it, and sneaking while right-clicking toggles sitting instead.

## Breeding

Tick **Can have babies** in **Breeding** (the mob needs the **Animal** base). **Breeding food** lists items or tags: feed two of the same kind and they pair up and produce a baby. **Baby size** is the size of a baby next to an adult, hitbox included, and **Grows up after (ticks)** how long that takes. **Follows players holding its food** makes it come to a player with the food in hand, **Babies follow their parents** does what it says, and **On breed** runs an event. A baby inherits a parent's variant. Two different custom mobs never breed with each other.

### Tame before breeding

A mob that has both Taming and Breeding follows the rule that wolves and cats follow: **it breeds only once it is tamed.** A wild one does not go into love mode, and feeding it its taming food tames it. A pair with a wild parent is refused. Babies of tamed parents are born tame, with the same owner and health. If the taming and breeding foods share an item, that item tames a wild mob first and breeds it afterwards.

## Riding

Tick **Can be ridden** in **Riding**. **Needs a saddle to steer** means the player must saddle it first with a vanilla saddle (the saddle is dropped when the mob dies and comes off with shears, as for pigs); without it, anyone can steer. **Who can steer** is **Anyone** or **Its owner only (needs Taming)**. **Ridden speed** multiplies its movement speed, **Jump strength** is the height of the jump bar's jump (0 for no jump), **Riders** is how many fit, and **Saddle bone** names a bone of the model that is shown only while the mob is saddled (the ready-made four-legged and flyer models have a `saddle` bone). **Set the seat position** shifts the seat with **Seat x**, **Seat y** and **Seat z**. **On mount** runs when a player mounts with a right click.

A walking mob is steered like a horse, a flying mob like a happy ghast (where you look; jump rises) and a swimmer along the view. A ridden mob is moved by the rider's game, not the server's; see [Limits](#limits).

## Variants

Tick **Has texture variants** in **Variants** to give a mob several skins. **Picked** is **At random (by weight)** or **By biome**; each **Variant n** has an id, a texture, a weight and (by biome) biomes. **Add a variant** adds one; **Remove Variant n** removes it. The variant is chosen when the mob spawns and saved with it, so a snowy fox stays snowy. The preview's **Variant** switcher (first entry **(base texture)**) and **Show as a baby** check each look.

## Boss bar

Tick **Shows a boss bar** in **Boss bar**. **Bar colour** is pink, blue, red, green, yellow, purple or white; **Bar style** is **Smooth** or **6**, **10**, **12** or **20 notches**. The bar shows the mob's health to players near it: **Seen within (blocks)** sets how near. Beyond the game's tracking range (about 10 chunks for a boss) nobody sees the bar. **Darkens the sky** and **Fogs up the world** are the effects of the wither fight, and **Plays boss music** plays vanilla's boss music, which is only heard in the End. A boss never despawns. For phases, use **On hurt** events running functions.

## Animations for states

In **Appearance**, beside **Idle animation**, **Walk animation** and **Attack animation**, there are **Sit animation**, **Fly animation**, **Swim animation** and **Shoot animation**. The mob plays them in this order of importance: **Sit** while sitting, then **Swim** or **Fly** while moving in that medium, then **Walk**, otherwise **Idle**; **Shoot** and **Attack** play once. A name that the animation set lacks is skipped. Babies play the same animations at their size.

## Choose how the mob is drawn

**Renderer** in **Appearance** has three choices:

- **Automatic (GeckoLib when present)** is the default. On 26.3 the mob is drawn by GeckoLib, exactly as before. On a target without GeckoLib (the 26.4 snapshot) the same mob is drawn by the built-in renderer.
- **GeckoLib only** always uses GeckoLib. A mob set to this cannot be exported for a target without GeckoLib.
- **Built-in renderer** never uses GeckoLib, on any target. A project whose mobs are all built-in needs no GeckoLib in the jar and no GeckoLib download.

The built-in renderer reads the same model and animation files as GeckoLib, so nothing is converted. It plays the subset of animations that vanilla knows: plain numbers and linear or smooth (`catmullrom`) keyframes. Molang expressions play as 0, other easings play as linear, and sound and particle keyframes are silent; **Problems** names what the mob uses (`entities.vanilla-renderer-subset`). A note under **Renderer** says which renderer a mob gets on the project's version. The ready-made models stay inside the subset.

The [Java project export](eject.md) draws every mob with GeckoLib, including built-in ones, and says so.

## Limits

- **Riding moves on the rider's game.** In Minecraft a ridden mob follows what the rider's client says, so steering, speed and jumping run the rider's copy of the mob. Server and player must have the same version of the mod. Launching, teleporting or knocking back a ridden mob may be lost or jitter.
- **Update client and server together.** Each side reads the mob's definition itself, so a server with a newer jar than the player shows wrong skins, animations or steering.
- **The built-in renderer is a subset of GeckoLib** (see above), and drawing is checked in the game only, so report anything that looks wrong.
- **Mobs with a brain are out of reach.** Allays, axolotls, frogs, camels, sniffers, wardens and piglins use behaviour that goals cannot copy, and phantoms, ghasts, vexes and bats have their own flight. Their equivalents here are goal-based: no item fetching, playing dead, swooping or fluttering.
- **No held bow pose.** A shooter fires without a weapon in its hand, and there is no crossbow-charging pose.
- **Two animations in one tick.** With the built-in renderer, two animations triggered in the same tick play only the second.
- **Spawn caps are shared.** A custom creature counts against the same limit as vanilla animals (or monsters, or fish), so many of them thin the vanilla ones out.
- **Boss music only in the End**, and a boss bar only for players within range.
- **The base needs a restart** to change (see above).
- **Saddles use a vanilla tag.** A data pack that replaces `#minecraft:can_equip_saddle` outright stops custom mobs being saddled.
- **A modpack with GeckoLib on one side only** can make automatic mobs behave differently on client and server: ship GeckoLib to both or to neither.

## The in-game check

Install the jar as in [Entities and models](entities-and-models.md#the-in-game-check) and, in a creative world, try what the mob has:

1. Spawn it with its egg. It looks like the preview, with the right variant, and idles and walks.
2. A pet: feed it the taming food until it is tame, right-click to make it sit, walk away and see it follow. Breed two tamed pets with the breeding food and see a baby at the baby size.
3. A mount: saddle it, right-click it and steer. Check the jump bar and, for a flyer, rising while you jump.
4. A shooter: stand in its sight and see it fire at the range you chose; the shoot animation plays once per shot.
5. A boss: summon it from its egg and look for the bar, the style and the sky.

The sample project `fixtures/sample-creatures` has a full checklist for 26.3 and 26.4: [`fixtures/sample-creatures/README.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-creatures/README.md).

## Troubleshooting

| Problem | What to do |
|---|---|
| **Problems** says a component needs the base "animal" | Set **Base** to **Animal** (or pick **Pet** or **Farm animal** under **Kind of mob**) and restart the game. |
| A wild pet will not breed | It must be tamed first; feed it its taming food. |
| Feeding a mob its taming food does nothing | Check the food is in **Taming food** and the mob's base is **Animal**. |
| The mob never shoots | Add the **Ranged attack** goal and tick **Shoots projectiles**. |
| The saddle does not go on | The mob needs **Can be ridden** with **Needs a saddle to steer**, and no data pack may replace the `can_equip_saddle` tag. |
| A variant shows the base skin | Check the variant's texture exists; **Problems** reports a missing one. |
| The mob is invisible on 26.4 | The built-in renderer draws nothing for a missing or broken model or animation file; the game log says which, once. |
| The export refuses a mob on 26.4 | The mob is set to **GeckoLib only**; choose **Automatic (GeckoLib when present)** or **Built-in renderer**. |
