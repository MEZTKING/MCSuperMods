# Status effects and throwables

MCSuperMods makes **status effects** of your own, like speed or poison, with their own name, colour, icon, stat changes and what they do every few seconds, and **throwables**: items you throw, like a snowball, a throwing knife, a boomerang or a bomb. Both are part of the Fabric mod: export the **Fabric mod jar** ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)) or use **Test in Minecraft**. They need the runtime of MCSuperMods 1.4.0 or later; an older runtime ignores them.

The quickest way to both is the [Creator](creator.md): the **Status effect** flow under **Magic** and the **Throwable** flow under **Gear**. Everything they make is ordinary elements you can change afterwards in the **Effect Studio** and the **Item Studio**.

To brew an effect in a brewing stand, make a potion of it: [Potions and brewing](potions.md) explains the **Potion** flow, **Make a potion** and the Potion Studio.

## Make a status effect

1. Open or create a project, then choose **Create…** on the toolbar.
2. Under **Magic**, pick **Status effect**. The preview opens on the **Card** tab: the effect's icon, its name in the colour the game uses for good or bad effects, what it does, and a table of its stat changes and how often it acts at levels I to IV.
3. Fill in the form:
   - **Effect**: **Name**, **Colour** (the swirling particles and the bar) and **Good or bad** (**Good**, **Bad** or **Neutral**; good and neutral effects have a blue name in tooltips, bad ones a red name).
   - **Behaviour**: **What it does** every few seconds: **Nothing extra**, **Heals**, **Hurts**, **Shows particles** (pick the **Particles**) or **Runs a function** (a function you can edit, run at the holder). **Amount** is in half hearts, **Every how many seconds** sets how often, and **Stronger levels act faster** makes level II act twice as often, level III three times, and so on.
   - **Stats**: up to two stat changes (**Stat change 1** and **Stat change 2**), such as movement speed, attack damage, max health, armour, jump strength or size, each with its **amount per level**. They last while the effect does.
   - **Getting it**: **How players get it**: **A drink** (a tonic that leaves a glass bottle), **A throwable flask** (it gives the effect to the mob or player it hits), **A brewed potion** (brewed in a brewing stand from an awkward potion and the ingredient in **Brewed from**, with splash and lingering bottles and tipped arrows; see [Potions and brewing](potions.md)) or **Nothing (commands and other elements)**; **Seconds it lasts**, **Level** and **Crafted from** (or **No recipe**).
4. Choose **Create**. The effect, its icon, the drink, flask or potion (a drink or flask with its model, texture and recipe), and the names are added in one step that one Undo takes back.

Select any of them later and choose **Edit in Creator** to change an answer, for example to make the effect a bad one.

## Make a throwable

1. Choose **Create…**, and under **Gear** pick **Throwable**.
2. Fill in the form:
   - **Item**: **Name**, **Colour**, **Style** (**Ball, used up like a snowball**; **Knife, left where it lands to pick up again**; **Boomerang, back in your inventory when it lands**; **Bomb, used up and bursts where it lands**) and **Stack size**.
   - **Throw**: **Damage** (in half hearts), **Speed**, **Weight** (**Floaty**, **Normal** or **Heavy**) and **Hold to throw** (hold use for half a second and let go, like a trident).
   - **Hit**: **When it hits**: **Nothing more**, **Gives the mob hit an effect** (**Effect** and **Effect: seconds**), **Knocks the mob hit into the air**, **Places a block** (**Block to place**) or **Bursts with a bang** (**Burst damage**).
   - **Recipe**: **Crafted from**, or **No recipe**.
3. The **Card** tab shows the item's picture, a sketch of a level throw from eye height with how far it lands, the damage and what happens after the throw and on a hit. The **Items** tab shows the item as usual.
4. Choose **Create**.

## The Effect Studio

To make an effect by hand, choose **Add element** (Ctrl+N) and pick a template under **Effects**: **Status effect** (a good effect that chimes and sparkles when it starts), **Damage over time effect** (like poison) or **Stat boost effect** (faster and stronger per level). Effects are listed in the sidebar under **Status effects**. Selecting one opens the **Effect Studio**; **Advanced (all fields)** and **Raw JSON** work as for blocks and items.

- **Effect**: **Display name**, **Category** (beneficial, harmful or neutral), **Colour**, **Particle (instead of the swirl)** and **Sound when added**.
- **Icon**: the effect's icon with **Paint icon** (see [Effect icons](#effect-icons)). Without an icon the Studio says so: the game shows a blank square.
- **Stat changes**: **Add stat change** adds a row with the **stat** (an attribute such as `minecraft:movement_speed`), the **amount** for level I and the **operation** (`add_value`, `add_multiplied_base` or `add_multiplied_total`). As with vanilla effects, the amount is multiplied by the level, and the change goes away when the effect ends.
- **Behaviour**: three triggers, each naming one of the effect's events. **When it starts** runs once when the effect is added. **While active** runs every **Every (ticks, default 20)** ticks (20 ticks are one second); **Stronger levels act faster** divides that time by the level. **When it ends** runs when the effect runs out or is removed (by milk or `/effect clear`). **New event** next to a trigger adds an empty event and picks it.
- **Events**: the events and their actions, as in [Events and actions](blocks-and-items.md#events-and-actions). In an effect's events the holder is both "self" and "other", so **Hurt**, **Heal** and **Apply effect** act on it.
- **Preview**: the icon, the name in its category's colour and what levels I and II do.
- **Potion**: the potions of the project that give this effect ("Potions with this effect: ...") and **Make a potion**, which adds a potion of the effect and opens it in the Potion Studio, in one step that one Undo takes back (see [Potions and brewing](potions.md#make-a-potion-from-an-effect)).

**Problems** reports an event a trigger names that the effect does not have, as for blocks and items.

## Effect icons

An effect's icon is a texture at the fixed path `textures/mob_effect/<effect name>.png` in the effect's namespace, 18 by 18 pixels like the vanilla icons. The game shows it in the inventory and in the corner of the screen. The Creator draws a placeholder badge in the effect's colour. To paint your own:

- in the Effect Studio, choose **Paint icon**; or
- choose the brush beside the namespace's assets heading (**New texture…**), pick **Effect icon (18 × 18)** under **What it is for**, name it after the effect and choose **Paint…**.

## Hurt and Heal

Two actions work in every event, of blocks, items, mobs, effects and throwables:

- **Hurt** (`damage`) hurts the player of the event, or with **Target** `other` the other entity, by **Amount (half hearts)** of magic damage, which armour does not reduce.
- **Heal** (`heal`) heals them by **Amount (half hearts)**.

A poison-like effect is a **While active** event with **Hurt**; regeneration is the same with **Heal**.

## How players get an effect

A custom effect works everywhere a vanilla effect does:

- a drink or food: the `effects` of `msm:consumable` (the **Consumable** flow and the **Drink** template);
- a totem: the `effects` of `msm:death_protection`;
- an **Apply effect** action in any event, for example an item's **On use** or a throwable's **On hit entity** with **Target** `other`;
- a potion: brewed in a brewing stand, drunk, thrown as a splash or lingering potion or shot on a tipped arrow ([Potions and brewing](potions.md));
- the command `/effect give @s <namespace>:<effect name> 30 1` (30 seconds at level II).

## Throwables in the Item Studio

The Item Studio's **Throwable** section turns any item into a throwable: tick **Throwable**. Empty fields use the defaults shown in their labels.

- **Damage (half hearts)**, **Speed (default 1.5)** (blocks per tick; a snowball is 1.5, a trident 2.5), **Gravity (default 0.03)** (higher falls sooner) and **Spread (default 1)** (how much throws scatter).
- **Hold to throw (ticks, 0 throws at once)**: above 0 the player holds use and lets go, like a trident (10 ticks is half a second). **Cooldown (ticks)** waits before the next throw.
- **After the throw**: `consume` uses one item (the default), `keep` uses none, `drop` leaves the item where it lands to be picked up again, `return` puts it back in the thrower's inventory when it lands (or drops it at their feet when there is no room). `keep`, `drop` and `return` take one durability per throw when the item has durability.
- **Throw sound** and **Dispensers throw it** (on by default; a dispenser always uses up one item, whatever **After the throw** says).
- **On hit entity** and **On hit block** run one of the item's events where it hits. In these events "self" is the thrower and "other" is the mob or player hit, so **Apply effect**, **Hurt** and **Launch (push)** with **Target** `other` act on the one hit.

A throwable cannot also be armour, a ranged weapon, a shield, a consumable, food or a mace, because they all use right-click: the section says so, and **Problems** reports it as an error (`blocks-items.component-conflict`). It works with tools of other types, durability and **On use** (the use event runs, then the item is thrown). The **Throwable item** template under **Items** is a ready snowball-like example.

## Sounds

The runtime registers every sound of your project's `sounds` element as a sound event when the game starts, so the sound fields of MCSuperMods' own data (**Sound when added**, **Throw sound**, the **Play sound** action) take your own sounds as well as vanilla ones, and their pickers list your project's sounds first. In vanilla fields that take a sound event (a jukebox song, the `sound` of a vanilla consumable component), write a sound of your project as `{ "sound_id": "<namespace>:<sound name>" }`; written as a plain string, **Problems** reports an error that says so, because the same project can also be exported as plain vanilla packs, where nothing registers it.

## Limits

- Custom effects are brewed through a potion of your own ([Potions and brewing](potions.md)), which needs the Fabric mod jar; a vanilla data pack cannot add a potion.
- Effects act over time; an instant effect (like instant health) is not possible yet.
- A thrown item is drawn flat, as its item picture facing the camera, like a snowball, whatever its style. There is no 3D model in flight, like a trident's.
- `return` puts the item back when it lands; it does not fly back to the thrower.
- A throwable hurts only what it hits directly: there is no area damage. **Bursts with a bang** makes particles and a sound and hurts the mob hit.
- **Knocks the mob hit into the air** pushes it straight up; it does not push it away from the thrower.
- Bows cannot shoot custom arrows yet.

## In the game

Export the **Fabric mod jar** or use **Test in Minecraft**; **Problems** must show no errors. Then, in a creative world:

- `/effect give @s <namespace>:<effect name>`: check the icon in the inventory and in the corner of the screen, the name and colour, the particles and the stat changes (open the inventory for armour, sprint for speed). Drink the tonic from the Creator, or throw the flask at a mob.
- `/give @s <namespace>:<item name> 16` and throw: watch the item fly, check the damage and what happens on a hit; pick a knife up again, and see a boomerang come back into your inventory. Put a few in a dispenser and power it.

## Troubleshooting

| Problem | What to do |
|---|---|
| The effect has a blank square as its icon | Paint `textures/mob_effect/<effect name>.png` (18 by 18) in the effect's namespace; the Effect Studio shows whether it exists. |
| `/effect` does not know the effect | Check that the jar is in the game's `mods` folder and that the game log's `[msm_runtime]` line counts no errors. An older runtime logs "unknown kind 'effect'": export again without **Separate runtime and GeckoLib (for modpacks)**, or update the runtime. |
| The tick event never runs | **While active** must name the event, and the event needs actions. |
| A stat change does nothing | The `[msm_runtime]` lines name an unknown attribute; pick the stat from the list. |
| The throwable is not thrown | It may also be armour, food, a consumable, a shield, a ranged weapon or a mace; **Problems** shows the conflict. |
| A sound plays nothing | Check the sound's name in your `sounds` element and that its `.ogg` file is in the project; the `[msm_runtime]` lines name an unknown sound event (see [Sounds](#sounds)). |
