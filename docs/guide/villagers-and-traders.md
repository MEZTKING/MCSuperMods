# Villagers, traders and pets that carry things

This page covers four things that make a mod feel lived in:

- a **trader**: a mob of your own that sells things through the villager trading screen, like the wandering trader;
- a **village job**: a new profession for vanilla villagers, with its own workbench block, apron and trades;
- **storage** on a mob, so a pack mule carries things in its own chest;
- a **shoulder pet**: a tamed animal that jumps onto its owner's shoulder, like a parrot.

All four need the **Fabric mod jar**: the runtime comes inside it. A vanilla pack leaves them out ([Vanilla packs](#vanilla-packs)). They work on both Minecraft versions, 26.3 and the 26.4 snapshot.

## Make a trader

There are four ways:

- in Very easy mode, the Home tile **Make a trader** ("A mob that trades with you, or a new job for villagers.", under **Creatures**) opens the Creator on the **Wandering merchant** flow or the **Village job** flow ([Very easy mode](very-easy.md));
- the Creator's **Wandering merchant** flow (group **Mobs**; Fabric mod jar only). Its answers are:
  - **What does it sell?** (an item, such as `minecraft:glow_berries` or one of your own), **How many at a time?** and **For how many emeralds?**, with **Also sells (2)** and **Also sells (3)** if you want up to three wares;
  - **Sales before it runs out**: how many times each trade works before the merchant has to restock;
  - **Also sells the wandering trader's wares** (on by default): two more levels of trades that unlock as you trade, the common and then the rarer wares of the vanilla wandering trader;
  - **Restocks**: **Twice a day** or **Never: each trade runs out for good**;
  - the usual mob questions: **What is it called?**, **What does it look like?** (a two-legged mob, a four-legged mob, a bird or a round creature), its colour or skin picture, **Health**, **Speed** and where it turns up (with a spawn egg).

  It creates with its untouched defaults and zero problems;
- **Add element** (Ctrl+N), the templates under **Villagers and traders**: **Wandering merchant**, **Pack mule**, **Shoulder pet** and **Village job**;
- the examples **Roadside merchant** (two levels of its own, a bell on every trade) and **Village blacksmith job**.

To make an existing mob a trader, open it in the Entity Studio and use the **Trader** section.

## The Trader section

In the Entity Studio, **Trader** has a switch, **Trades with players**. Switched on, using the mob with an empty hand opens the villager trading screen. Babies, angry mobs and ridden mobs do not trade, and neither does a second player while the first is trading. A mob built on **Monster (enemy)** does not trade at night; Problems says so as a note, and that is allowed.

- **Levels** is how many trading levels it has, 1 to 5. With more than one, tabs show **Novice (level 1)**, **Apprentice (level 2)**, **Journeyman (level 3)**, **Expert (level 4)** and **Master (level 5)**.
- **Gets better with trading (unlocks the next level)** is on by default. The trader levels up as the player trades, at the villager's own thresholds of 10, 70, 150 and 250 trading experience, or at your own **Trading XP to reach the next level** for the level (counted from the start). With it off, the trader stays at its first level.
- **Restocks** is **Twice a day** or **Never**. A restock refills every offer once a half day of the world's clock has gone by.
- **On trade** picks an event that runs after each trade, with the trader and the player in it.
- **Trade sound** is a sound event. Empty plays the villager's "yes".
- **Trades from** picks, for each level, **Its own trades** or **A villager: …** (a list of trades the vanilla game already has, such as the wandering trader's common wares). A borrowed list says what it offers. If some of its trades are only for certain villagers, the section says how many, because the mob then offers fewer ([Limits](#limits)).

With **Its own trades**, the trade editor appears. Each trade is a row with **Price** and **How many**, an optional second price (**Also costs a second item** and **Second price**), the **Product** and **How many**, **Uses before restocking** and **Trading XP**. **Add the trade** puts it into the level; selecting a row lets you change it and **Save the trade**, or **Remove** it. Each is one undo step. A level offers every trade it holds, in the order you made them.

**Problems** reports, in plain words, a trader that borrows a list of trades that does not exist, one that borrows trades only some villagers may offer (a warning), and a monster trader (a note).

## Make a village job

A village job gives vanilla villagers a new profession. A villager with no job that finds your **job site block** takes the job, wears your apron and sells your trades, as a mason does at a stonecutter.

- the Creator's **Village job** flow (group **Worlds**; Fabric mod jar only). Its answers: **What is the job called?** (Tinker gives the job `tinker` and its block `tinker_workbench`), **Apron colour**, **Workbench colour**, **Crafting recipe for the workbench** (two iron ingots over two planks of any wood), then the first trades: **What does the villager buy?** with **How many for one emerald?**, and **What does the villager sell?** with **For how many emeralds?**. **Also trades like** is **Nobody: only its own two trades** or the trades of one of the vanilla jobs, from **A toolsmith** to **A shepherd**; the job then also draws from that job's trades at every level and uses its work sound;
- **Add element**, the template **Village job** (category **Villagers and traders**), or the example **Village blacksmith job**.

The flow makes the profession, its workbench block (with a model and a recipe), two first-level trades, five trade lists for the five levels and an apron drawn by MCSuperMods for villagers and for zombie villagers. A villager of the job has two trades picked at random from the level's list; a level 1 job offers both of the flow's trades.

Selecting a profession opens the **Profession Studio**, in four sections:

- **Job**: **Name of the job**, and **Job site block**, the block the villager works at. It must be a block of your own: a vanilla workstation, bed or bell is refused ("That block already belongs to Minecraft..."), and so is a block another job already uses. The studio reminds you that a villager without a job takes this one at its job site block, as at a workstation.
- **Pictures**: **Villager picture** and **Zombie villager picture (optional)**, the apron drawn over the villager's skin. A picture stored elsewhere in the project is copied to the place the game reads in the same undo step; **Copy the pictures to where the game looks** does it for older pictures.
- **Trades**: five level tabs and the trade editor above (the trades go into the level's list), or, when the profession names five trade sets, **Use its own trades**.
- **Work**: **Work sound**, **Items it picks up** (add an **Item it picks up**), and **Other blocks it works at** (add an **Other block it works at**).

Problems reports a job site block that does not exist or already belongs to something else, and a missing picture (the job still works and looks like a plain villager).

## Mobs that carry things: Storage

In the Entity Studio, **Storage** ("Carries things, like a donkey with a chest") gives a mob a chest's worth of slots. Its settings:

- **Size** in rows of nine slots (1 to 6; a chest has 3);
- **Needs a chest put on it first**: a chest used on the mob adds the store with the chest sound (a baby refuses);
- **Opening sound** and **Closing sound**; empty uses a chest's.

Its rider opens the store with the inventory key while riding. Anyone, or only the owner when the mob is tameable, opens it by using the mob while sneaking. What is inside is saved with the mob and dropped, with the chest, when the mob dies. A plain use still mounts or trades. The Creator's **Mount** flow has the answer **Carries a chest** with **Rows of storage**; the template **Pack mule** is a ready one.

## Pets that ride on your shoulder

**Shoulder** ("Rides on its owner's shoulder") makes a tamed pet jump onto its owner's shoulder when the owner stands near it, and jump down again when the owner is hurt, sneaks, sleeps, rides, swims or flies. It waits five seconds before jumping up again, and each player carries one pet. The section lists, in words, what the mob still needs:

- it must be an **animal** (**Pet** under **Kind of mob**);
- it must be tameable (switch on **Taming**);
- it must be narrow: at most 0.7 blocks wide.

The Creator's **Pet** flow has the answer **Rides on your shoulder**; the pet is then drawn at half size so that it fits. The template **Shoulder pet** is a ready one. The pet perches (it is not a passenger): it has no gravity and cannot be pushed while it sits there.

## Vanilla packs

None of this is in the resource or data pack exports: it needs the runtime. A profession and its job site tag, trades and trade sets that name a project item, and recipes that use a project bucket are left out of vanilla packs, which cannot hold them; the export tells you that they need the Fabric mod jar. The [Java project export](eject.md) leaves batch 2 out too: it warns once per job, mob and fluid and removes the components, so the mob still ejects as a plain mob.

## Check it in Try it

[Try it](try-it.md) shows a merchant screen for a trader: the level name and experience bar, each price and product, **Out of stock** with a cross, a click for one trade and Shift and click for trades until it runs out. Levels, restocks and **On trade** run. Nothing is paid or given. Storage, shoulder pets and village jobs are said in **What happened**, not shown.

## The in-game check

Press **Play** (or export the Fabric mod jar) and, in a creative world with cheats on:

1. A trader: use it with an empty hand. The trading screen has the right offers. Trade until it levels up, then close and reopen it. In survival, use up an offer and run `/time add 12000` to see it restock.
2. A village job: place the job block near a villager with no job. It walks to the block and puts on the apron; using it shows the job's name and trades. Break the block before the first trade and it loses the job.
3. Storage: feed and tame the mule, use a chest on it, open it while sneaking and from the saddle with the inventory key.
4. A shoulder pet: tame it, stand near it, and see it jump up. Get hurt or sneak and see it jump down.
5. The log: `[msm_runtime]` lines say `registered N entity type(s)` and `registered N villager profession(s)`.

The sample project `fixtures/sample-villagers-and-fluids` has a full checklist for 26.3 and 26.4, in singleplayer and on a server: [`fixtures/sample-villagers-and-fluids/README.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-villagers-and-fluids/README.md).

## Limits

- **No gossip, reputation, discounts or demand.** A trader's prices stay as its trades say: they do not rise when a trade is used up or fall for a hero of the village. There are no hurt or level-up effects. A villager restocking at a project job block is an in-game check, not something the tests prove.
- **Borrowed vanilla trades can give fewer offers.** A few of the game's own lists hold trades meant for one kind of villager only (for example some of the cartographer's and the fisherman's). A project trader that borrows them offers fewer. With the **Villager Trade Rebalance** experiment switched on in a world, many more of the game's lists are like this and a project trader may get few offers or none from them. Give a trader its own trades when you need them to be certain.
- **Traders are normal mobs.** They need the Fabric mod jar like every mob, spawn by their own rules and count against the spawn caps of their category.
- **A job needs a block of your own.** A vanilla workstation, bed or bell cannot be a job site, and a block that is already a job site is refused.
- **Storage has no hopper access.** Hoppers do not reach a mob's store.
- **One shoulder pet, small animals only.** The pet must be an animal that can be tamed and at most 0.7 blocks wide, and each player carries one. Sleeping or gliding with a pet perched, and stopping a server while a pet is perched, are not checked yet: check them in the game.
- **Not in the Java project export.** The eject leaves traders, jobs, storage and shoulder pets out with a warning.
- **Try it does not run all of it.** Storage, shoulder pets and village jobs are only said ([Try it](try-it.md)).
- **Looks are in-game checks.** The apron on a villager, a zombie villager's apron and the pet on a shoulder are best checked in the game.

## Where next

- [Mob behaviours](mob-behaviours.md) for taming, riding and the other sections of the Entity Studio.
- [Adding to vanilla](adding-to-vanilla.md#villager-trades) to add a trade to a vanilla profession instead.
- [Fluids](fluids.md), the other half of this batch.
- The other chapters are listed in the [user guide](/).
