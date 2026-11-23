# Live views of your data

Loot tables, predicates, item modifiers, enchantments, advancements, dialogs, death and chat lines, tags, functions, block transformers and rules for vanilla blocks are files the game reads, not things you can look at. MCSuperMods shows each of them live while you edit it: a loot table rolls, a predicate answers, a tag lists everything in it, a function says which of its lines run in [Try it](try-it.md). The view is drawn again a moment after every edit.

MCSuperMods does not run Minecraft for this. It works each view out from your project's files and, for anything vanilla (Minecraft's own tables, tags and parent advancements), from the files inside your own Minecraft, read on your computer as your textures are. Nothing of Minecraft's is shipped with MCSuperMods, written into your project, exported or sent to the AI helper. The full list of what the views cannot show is under [Limits](#limits). Sounds, fonts, mob variants, paintings, banners, trims, shaders and the other looks have views of their own, under [Looks and sounds](#looks-and-sounds).

## Where you see them

- **The Preview tab.** Select one of these elements in the sidebar and open the **Preview** tab on the right (or **Preview** in the element's header).
- **Studio sections.** The Tag Studio shows **Everything in it** beside the list you edit. The **Extra drops** Studio has a section **With and without**, and the **Vanilla block rules** Studio a section **Try it here**.
- **The Function editor.** Each line has a mark beside it, and **Run in Try it** sits under the editor (see [Functions](#functions)).
- **The Creator's Live tab.** The Creator's preview has a tab **Live** that draws the view of each thing the flow makes, one at a time, with the others in a strip above it to pick from. It follows your answers. A flow whose main thing is not a block or an item (a mob, a vehicle, a particle, a liquid, trades, extra drops) opens on **Live**. Mobs, vehicles, particles, liquids, effects, potions, traders, blocks, items and mob skins show the previews you already know from their Studios there. When a flow makes nothing that has a view, the tab says "Nothing to picture yet." See [The Creator](creator.md).
- **The AI helper's See it.** When the AI helper proposes changes, the review starts with **See it**: the same views of each thing the proposal makes, drawn over your project as it would be with the changes you keep. Nothing is added by looking; you still choose **Add to my mod** (**Make these changes** when it changes something already in your mod) or **Throw away**. While the helper is still working, the pane says "More may follow." See [The AI helper](ai-helper.md).

## What every view shows

Every view has a title, a **Preview** tag ("Worked out by MSM from your files, not made by the game. Play is the real check.") and one of three words for how close it is to the game:

| Words | What they mean |
|---|---|
| **As in the game, checked** | MSM compared this with the real game on MSM's own test files. |
| **About right** | Worked out by MSM from your files; the game may differ in small ways. |
| **Only in the game** | MSM cannot show this. Play is the real check. |

Under the view, **Only in the game** lists each part MCSuperMods could not work out, by name and where it is in your data. Nothing is left out without a line. The last lines say what the view drew only about right or left out.

When a view needs a file of Minecraft's own and your Minecraft folder is not set up, it says "Set up your Minecraft folder to see Minecraft’s own data here." with a **Set up Minecraft folder** button. Your project's own data draws without it.

## Loot tables

A loot table's view has two parts:

- **Roll it**: the stacks of one roll, as slots with their tooltips ("Nothing this time." when the roll gives nothing). Under **Seed** you can type a seed; **Roll again** picks a new one. The same seed always gives the same roll.
- **The odds**: every item that can drop, how often and how many ("How many: …"), over many rolls, filled in a little at a time. Rows a part of the table touched that only the game knows are marked **Only the game knows**. **What MSM used to work this out** opens the details.

A loot table drops something only when something happens, so the view asks **What happens to it?** and offers plain situations:

- Mining a block with your hand
- Mining a block with a pickaxe
- Mining a block with a Fortune III pickaxe
- Mining a block with a Silk Touch pickaxe
- A block blown up by another block
- A mob killed by a player
- A mob killed by a player with a Looting III sword
- A mob killed by another mob
- A mob that died with no one near
- Opening a chest

**Advanced** opens the fields behind them: **Context**, **Tool**, **Tool enchantments**, **Block**, **Block state**, **Entity**, **Entity flags**, **Killer**, **Weapon**, **Weapon enchantments**, **Damage type**, **Explosion power**, **Clock**, **Time (ticks)**, **Dimension**, **Biome**, **Position**, **Luck** and the weather (**Not said**, **Clear**, **Rain**, **Thunder**). Once you change one, the picker says "Your own situation (changed under Advanced)."

One roll is MCSuperMods' own. The view says so: "Your roll in the game will differ; the odds are the same." The odds are what MSM checks against the game.

### Extra drops, enchantment providers and trial spawners

- **Extra drops** (your additions to Minecraft's tables): the vanilla table rolled **Without your additions** and **With your additions**, side by side, at the same seed, with the odds of each. Rows and stacks your additions brought are marked **Added**. The view is in the preview panel and in the Extra drops Studio's **With and without** section. Rolling Minecraft's own tables needs your Minecraft folder.
- **Enchantment provider**: the enchantments and levels it gives to a chosen item, one roll and **The odds**.
- **Trial spawner**: **The waves** (which mobs, how many at once and in all, by the number of players), **The mobs** and **The rewards**, its reward tables rolled as above.

## Predicates and item modifiers

Both views are called **Try it on**.

- **A predicate** is tried on the situation you choose under **What happens to it?** (the same picker as loot). **The answer:** is **Yes**, **No** or **Only the game knows**, and **Every part** of the predicate shows its own answer beside it, so you see which part says no. A part that goes by chance can answer differently on the next try; how likely yes is stands beside it.
- **An item modifier** is tried on an item: choose it under **Try it on this item**. The item shows **Before** and **After**, as slots with their tooltips.

## Enchantments

An enchantment's view shows:

- **On an item**: the tooltip line on a sample item at each level.
- **Levels**: a table with **Level**, **Cost from** and **Cost to**.
- **The enchanting table**: the levels an enchanting table can offer it at, and how likely (this needs Minecraft's own enchantments, so your Minecraft folder).
- **What it goes on**: the items of its tag, opened up.
- **Cannot be combined with**: the enchantments it excludes ("Nothing: it goes with any other enchantment." when none).
- **What it does**: its effects in plain words ("No effects: it is only a name on the item." when it has none).

## Advancements

An advancement shows its **Advancement tab** as a tree: the advancement lit, its parents and children with their frames, icons and titles, hidden ones dashed, the toast ("The toast when it is done"), the chat line ("The chat line when a player earns it"), its **Criteria** as a checklist and its **Rewards**. A parent from Minecraft's own advancements needs your Minecraft folder. Editing stays in the form.

## Dialogs, death lines and chat lines

- **A dialog** shows its screen: title, body, inputs and buttons, drawn by MSM in the places the game puts each part. Click a button and it says what it would do ("This button would run /…", "This button would open the link …", "This button would close the dialog."); it runs nothing.
- **A damage type** shows its **Death lines**: the line for a sample player, in its forms (on their own, killed by a mob, killed by a player holding a named item), and **When hurt**: how it works with the difficulty, hunger and falls.
- **A chat type** shows a **Chat line**: a sample message **In the chat box** and as **Read out by the narrator**, in the chat type's style.

## Tags

A tag shows **Everything in it**: every member the game ends up with, tags inside tags opened up (Minecraft's own from your game), each with its picture where it has one (blocks, items, mobs' eggs) and where it came from. **Optional entries** and entries that are missing are marked. **What changed** compares it with Minecraft's own tag of the same id ("Nothing: it holds the same as Minecraft’s own." when they match). The view follows every edit in the Tag Studio, where it sits beside the list. Every tag kind has it except the villager trade tag, which shows its trades.

## Functions

- **Beside each line** of the Function editor: **Runs in Try it**, or **Only in the game** with the reason ("Only in the game: Try it does not run …", or that the game would not read the line). A macro line (`$`) runs with the values it is given. Blank lines and comments have no mark.
- **Under the editor**: how many lines run ("Runs in Try it: every line (5)." or "Runs in Try it: 3 of 5 lines. The rest are said in What happened."), the lines that do not, and **Run in Try it**: it "Opens Try it and runs this function at you, as /function does". When the function has macro lines, type their values first in **Values for the macro lines** (for example `{n:7,item:"emerald"}`).
- **The Preview tab** shows the same marks as a list of **Lines**, titled **Function**.

In Try it, `/function` works in the chat box, your `#minecraft:load` functions run when the area starts and after an edit, and your `#minecraft:tick` functions run every tick. See [Try it: The chat box](try-it.md#the-chat-box).

## Block transformers and rules for vanilla blocks

A block transformer and the **Vanilla block rules** show the block before and after, with the tool that changes it (an axe, a shovel, a hoe, honeycomb). The rules' Studio section **Try it here** has the same view and an **In Try it** box that says which blocks and tools Try it's picker has: "Place a block, hold the tool and use it on the block." In Try it the vanilla block is a prop that changes as your rules say.

## Looks and sounds

Pictures, models, sounds, fonts, shaders and the other things the game draws or plays have live views too. They are made the same way: from your project's files and, for anything of Minecraft's own, from your own Minecraft, read on your computer and never copied into your project or sent anywhere. Most are in the **Preview** tab; potions, creative tabs, effects, villager looks and village jobs draw theirs in their Studios. They follow your edits by themselves. Most are **About right**: MSM draws them with its own shapes and the game may differ in small ways. Their own limits are under [Limits of looks and sounds](#limits-of-looks-and-sounds).

### Hear every sound

A **Play** button plays a sound as the game picks it: the event's files by their weights, at the event's volume and pitch. Press it again (it says **Stop**) to stop; one sound plays at a time, and starting another stops the first. You find it:

- in the **Sounds** element's **Preview**: each sound event with **Play**, its subtitle and whether it replaces Minecraft's sounds or adds to them; each file of the event with its own **Play**, volume, pitch, weight and chance; and which file a press picked;
- beside every sound you pick: the sound tiles of the picker (so every sound slot in Rules and every sound choice in Very easy), every sound field of the Studios (a mob's sounds, a block's **How it sounds**, the Effect, Item, Profession and Vehicle Studios, portals and containers), the Creator's song field and the sounds form;
- in My things, under **Particles and sounds** (see [Very easy mode](very-easy.md#my-things)).

Your own sounds always play. Minecraft's own sounds are not inside the game's jar: they are read one at a time from your Minecraft folder when you press Play. Without your Minecraft folder set up, the button for one of them is off and offers **Find my Minecraft**. See [Block sounds](sounds.md).

### Fonts

A font's **Font** view draws a line you type under **Type to try it** at GUI scales 1 to 4, with its width. A letter no part of the font has is drawn as a marked box and named. Each part of the font (a provider) is listed with how close it is: bitmap, space and reference parts are **As in the game, checked**; TrueType and unihex parts are **About right**; anything else is **Only in the game**.

### Particles and waypoint styles

**Particle sprites** plays a particle's pictures in order over a life you choose, with **Play**, **Pause** and **Next sprite**, and shows them all in a strip. With reduced motion nothing moves until you press **Play**. A **Waypoint style** shows one step of the locator bar for each of its pictures, with the distances it covers, and **Distance** moves the dot along the bar.

### Timelines and world clocks

A timeline's **Day strip** draws each thing it sets across one day: numbers as a line, true or false as bands, choices as named steps and colours as swatches. Drag the time marker, or press **Play** and choose the **Speed**; the value at that moment is beside each row. A value the strip cannot draw is named in its row. A **World clock** shows the timelines tied to it, yours and Minecraft's.

### Mob variants, villagers and sulfur cubes

Wolf, cat, pig, cow, chicken and frog variants are drawn on a body wearing the picture, turning slowly (drag it or use the arrow keys to turn it). Wolves have **Wild**, **Tame** and **Angry**; a variant with a baby picture has **Grown-up** and **Baby**. Under the body, where the variant appears, in words, with biome tags opened up. The bodies are MSM's own stand-ins, measured from what the game shows. The zombie nautilus has no body yet: its picture is shown flat, with the parts that were measured named.

The cat, pig, cow and chicken sound variants have a **Play** button for each sound, grown-up and baby. A **Sulfur cube** is drawn at **Small**, **Middle** or **Big**, with the path of one hit drawn from its numbers and its sounds with **Play**.

The **Villager look Studio** and the **Profession Studio** draw the look on a villager at the top of **Pictures**, and a job's clothes over it at each level from **Novice** to **Master**.

### Paintings, banners, trims and pots

A **Painting** hangs on a wall at its size, beside a player for scale. A **Banner pattern** is drawn **On a banner** and **On a shield**, in the **Pattern colour** and **Banner colour** you choose. An **Armour trim** (a trim pattern or a trim material) is worn on the armour figure: pick the **Material** (or the **Pattern**) and the **Armour**. A **Pot pattern** is drawn on the four sides of a pot.

### Potions, effects and creative tabs

The **Potion Studio**'s **Preview** draws the potion, the splash and lingering bottles and the tipped arrow in the potion's colour, mixed from its effects as the game mixes them. The **Effect Studio**'s **Preview** draws the effect's icon in the corner frame, the inventory's panel and the swirl in its colour. The **Creative Tab Studio**'s **Preview** draws the tab as a page of the creative inventory, its icon on the tab and its things in order, with **Back** and **Next** for more pages.

### Shaders and post effects

A **Shader program** says whether it compiles for the app's graphics (WebGL 2), with the compiler's lines shown against your own lines. Where it does, it runs on MSM's own test picture, **Before** and **After**. A **Post effect** shows its chain of passes as a diagram, and where every pass compiles and has what it needs, the effect runs once on the same test picture. Values the game fills in while it plays (the screen size, the time of day) are given stand-in values, which the view lists. Minecraft's own core shaders are a compile check only.

### Songs and horn calls

A **Music disc song** has **Play** and **Stop**, a time line, the song's length as its data states it against the length of the file, with a line when they differ, and the comparator signal. A **Goat horn call** has **Play the call** and its range drawn as a circle round the player, with a scale in blocks.

### In the Creator and in My things

The Creator's **Live** tab shows these views for the Music disc, Goat horn, Banner pattern, Armour trim, Pot pattern, Creative tab and Villager look flows. In Very easy mode, **My things** has a section **Particles and sounds**: a card for each particle and each sound, with **Play** on a sound's card, each opening its view.

## Limits

The views are previews, not the game. **Play** is the real check.

| Limit | In plain words |
|---|---|
| **The odds are checked; a single roll is MSM's own** | The game draws its random numbers in its own order, so the same seed gives another roll in the game ("Your roll in the game will differ; the odds are the same."). The odds were checked against the real game on MSM's test tables, to within two percentage points (three for explosions). |
| **Some loot parts are only in the game** | Parts MSM cannot work out (some function and entry types, `dynamic` contents, deep checks of an item's data) are named under **Only in the game** and marked on their rows. |
| **Vanilla data needs your Minecraft jar** | Minecraft's own tables, tags and parent advancements are read from your own game, never shipped. Without your Minecraft folder set up, a view that names one shows **Set up Minecraft folder**. Your project's own data draws without it. |
| **A situation is a sample, not a world** | There is no world around it: parts about structures, light, nearby mobs or scores answer **Only the game knows**. [Try it](try-it.md) shows what its small world holds. |
| **The advancement tree is about right** | The parents and children are the same as in the game, but the game orders the branches its own way, so positions may differ. |
| **Criteria are listed, not triggered** | The criteria are a checklist; none ticks by itself. Earn them in the game with Play. |
| **A dialog's buttons run nothing** | Each button says what it would do. Commands and links belong to the game; Try it's chat box runs the commands it understands. |
| **Functions run as far as Try it understands them** | Each line is marked; what Try it does not run is said in **What happened**. |
| **Selectors see one player and Try it's mobs** | Try it has one player in an area 48 by 48 blocks and 32 high: `@a` is that one player, and places outside the area are said. |
| **An enchantment's effects are described, not played** | Fights and movement are not simulated, so **What it does** lists them in words. |
| **Vanilla blocks in Try it are props** | A transformer or a rule for a vanilla block changes the prop; the block's other behaviour is not there. |
| **Kinds from plugins have no live view** | Elements of kinds that third-party plugins add keep their form, as before. |

## Limits of looks and sounds

The looks are previews, not the game. **Play** is the real check.

| Limit | In plain words |
|---|---|
| **Minecraft's own sounds need your Minecraft folder** | They are never shipped and are not inside the game's jar. Without your Minecraft folder set up, their **Play** button is off and offers **Find my Minecraft**. Your own sounds always play. |
| **A sound is heard flat** | There is no world around it: no distance, no echo and no sound category volume. Hear it in place in [Try it](try-it.md) or with Play. |
| **Mob bodies are MSM's stand-ins** | The game's mob shapes are its code, not files, so MSM draws its own bodies, measured from what the game shows. They are **About right**: small parts may sit a little differently. |
| **Bodies turn; they do not walk** | No animation of Minecraft's is played on a stand-in body. |
| **Some bodies are a flat sheet** | The zombie nautilus shows its picture flat, with the parts that were measured named; the body is only in the game. |
| **Some details are not drawn** | Which villager hat shows over which, villager babies and a tame animal's collar are not drawn, and each view says so. The shield is drawn like the banner but has not been compared with the game. The smallest sulfur cube wears the full-size pictures. |
| **A bottle cannot show Minecraft's own effect colours** | Vanilla effects' colours are in the game's code, not in a file, so a potion that mixes one leaves it out of the colour and names it. |
| **Shaders run only where the app's graphics can** | The app draws with WebGL 2, which is stricter than the game's OpenGL. A shader that does not compile here shows the compiler's lines and may still work in the game; the effect itself is then only in the game. Minecraft's own core shaders are a compile check only. |
| **Post effects run on MSM's test picture** | There is no live game picture: an effect is shown once on MSM's own test picture, with stand-in values for what the game fills in, not in motion. |
| **No WebGL: flat pictures** | Without WebGL the bodies and shapes are shown as their flat pictures; sounds still play. |
| **TrueType and unihex fonts are about right** | The browser draws TrueType fonts in its own way, so a line in one is **About right**; parts MSM cannot draw are named. |
| **The creative tab page is a drawing** | The order and the icons are your tab's; search and scrolling are only in the game. |
| **A day strip shows values, not the sky** | The sky is drawn by the game's code: the strip shows swatches and numbers over the day. Try it's **Sky** choice shows a dimension type's sky. |
| **Only English text shows** | Names come from the English language files. |
