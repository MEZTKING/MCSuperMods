# Potions and brewing

MCSuperMods makes **potions** for the brewing stand: a potion of one of your own [status effects](effects-and-throwables.md) or of vanilla effects, brewed from an ingredient you choose, with a longer and a stronger version, and splash and lingering bottles. Tipped arrows come with the lingering potion. Your potions are real potions in the game: they are in the creative inventory, `/give` knows them, and loot tables and potion tags can name them.

Potions are part of the Fabric mod: export the **Fabric mod jar** ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)) or use **Test in Minecraft**. They need the runtime of MCSuperMods 1.5.0 or later; an older runtime ignores them. The vanilla data and resource pack exports leave them out (see [Vanilla packs](#vanilla-packs)).

There are three ways to make one:

- the Creator's **Potion** flow (group **Magic**), with an effect of its own or a vanilla one;
- **Make a potion** in the [Effect Studio](effects-and-throwables.md#the-effect-studio), for an effect you already have;
- **Add element** (Ctrl+N) and a template under **Effects**: **Potion of a custom effect** or **Potion with longer and stronger versions**.

Potions are listed in the sidebar under **Potions**. Selecting one opens the **Potion Studio**.

## Make a potion in the Creator

1. Open or create a project, then choose **Create…** on the toolbar.
2. Under **Magic**, pick **Potion**. Fill in the form:
   - **Potion**: **Name**, the English name after "Potion of". Ids come from it: "Moon Leap" gives the potion `moon_leap`.
   - **Effect**: **Effect** is **A new effect of its own** (made here, with its icon, named `<name>_effect`) or a vanilla effect such as **Speed**, **Night vision** or **Slow falling**. A new effect also has a **Colour**, which colours the potion too, and **Stat change 1** and **Stat change 2** with their amounts per level. **Seconds it lasts** (vanilla potions last 180) and **Level** (1 is level I).
   - **Brewing**: **Brewed from** (an awkward potion, as most vanilla potions are, or a mundane or thick potion, or a water bottle) and the **Ingredient** that brews it. None of the offered ingredients is a vanilla brewing ingredient, so the step never clashes with a vanilla potion. **Not brewed (commands and creative only)** makes a potion without a brewing step.
   - **Versions**: **Longer version** with **Longer version: seconds** (redstone dust; vanilla longer potions last 480 seconds), **Stronger version** with **Stronger version: seconds** (glowstone dust; one level higher, vanilla stronger potions last 90 seconds), **Splash potion** (gunpowder) and **Lingering potion and tipped arrows** (dragon's breath).
3. Choose **Create**. The potion, the new effect and its icon, and the names are added in one step that one Undo takes back. **Edit in Creator** on any of them changes an answer later.

The **Status effect** flow can make a potion too: under **Getting it**, set **How players get it** to **A brewed potion** and pick the ingredient in **Brewed from**. It makes a potion `<effect>_potion` with splash and lingering versions.

## Make a potion from an effect

Select a status effect of your project. The Effect Studio's **Potion** section lists the potions that already give the effect ("Potions with this effect: ...") and has the button **Make a potion**. It adds a potion `<effect>_potion` (or `<effect>_potion_2`, and so on, when the id is taken) with the effect's display name and the effect for 3 minutes, brewed from an awkward potion and an amethyst shard (unless another potion of the project already brews from that pair, in which case it has no brewing step yet), and opens it in the Potion Studio. One Undo removes it again.

## The Potion Studio

- **Preview**: the four item names the game shows ("Potion of Moon Leap", "Splash Potion of Moon Leap", "Lingering Potion of Moon Leap" and "Arrow of Moon Leap") and the potion ids the potion adds (**Potion ids**: its own, and the `long_` and `strong_` versions when it has them).
- **Potion**: **Display name**, and **Name key (optional; the game shows the display name)**: the part of the item names' language keys after `effect.`. It defaults to `<namespace>.<name>`, which keeps two mods' potions of the same name apart; change it only to share names between potions.
- **Effects**: one to eight effects. Each row has **Effect 1 effect** (your own effects are offered first), **Effect 1 time (ticks)** with the time in minutes and seconds beside it (20 ticks are one second), **Effect 1 level**, and the switches **Faint (like a beacon)**, **Particles** and **Icon**. **Add effect** adds a row; the cross removes one.
- **Brewing**: **Ingredient (empty: not brewed)** and **Added to (default minecraft:awkward)**, the potion the ingredient goes into. Without an ingredient the Studio says the potion is only in the creative inventory, loot and commands. Then:
  - **Longer version**, with **Longer time (ticks)** (twice the first effect's time when you tick it) and **Ingredient (default minecraft:redstone)**;
  - **Stronger version**, with **Stronger level** (level II when you tick it), **Stronger time (ticks)** (half the time) and **Ingredient (default minecraft:glowstone_dust)**;
  - **Splash version (gunpowder)** and **Lingering version and tipped arrows (dragon's breath)**, both on by default.
- **Brewing chain**: every brewing stand step the export writes, as "input + ingredient, gives output", for example "Potion (Awkward) + Amethyst Shard gives Potion (Moon Leap)". With every option on there are 15 steps: the potion, its longer and its stronger version in each of the three bottles, and gunpowder and dragon's breath for each version.

Every edit is one undo step. **Advanced (all fields)** and **Raw JSON** show the same potion as data.

## Ids, names and colour

- The longer and stronger versions are separate potions with the ids `<namespace>:long_<name>` and `<namespace>:strong_<name>`, as in vanilla (`minecraft:long_swiftness`, `minecraft:strong_swiftness`). Brewing recipes, potion tags, loot tables and `/give` use these ids, and they are offered in completion like vanilla potions.
- All three share one name: "Potion of Moon Leap" for each, as vanilla does.
- The colour of the potion comes from its effects, as in vanilla: an effect of your own colours it with its **Colour**. A potion has no colour of its own.
- `/give @s minecraft:potion[potion_contents={potion:"<namespace>:moon_leap"}]` gives the drinkable potion; use `splash_potion`, `lingering_potion` or `tipped_arrow` for the others.

## How the brewing stand works with it

A brewing step is a vanilla `minecraft:brewing` recipe that the export writes under `data/<namespace>/recipe/brewing/`. Brewing needs blaze powder as fuel, as always. Each step works with the bottle it names: the ingredient turns three awkward potions into three of your potions, redstone dust or glowstone dust upgrades them, gunpowder turns them into splash potions and dragon's breath turns splash potions into lingering ones. Tipped arrows need no step: the vanilla crafting recipe (eight arrows around a lingering potion) works with any lingering potion, yours included.

You can also write brewing recipes by hand: the **Recipes** templates **Brewing recipe** and **Brewing recipe: splash potion** brew vanilla potions with ingredients of your choice, and they work in a plain data pack.

**Problems** checks potions:

| Code | Severity | What it means |
|---|---|---|
| `blocks-items.potion-effect-missing` | Error | An effect is neither a vanilla effect nor one of the project's. The game would skip the whole potion. |
| `blocks-items.potion-duplicate-brewing` | Warning | Two steps use the same ingredient on the same potion, so the brewing stand makes only one of them. Pick another ingredient or base. |
| `blocks-items.potion-id-collision` | Error | The longer or stronger version's id is already another potion's. Rename one of them. |

## Vanilla packs

A data pack cannot add a potion to the game: potions are a fixed list the game builds at start-up. Worse, a brewing recipe that names a potion the game does not know stops the whole data pack from loading. So the vanilla data pack, the combined packs and **Install into world** leave the potions **and** their brewing recipes out, and the export reports one warning, `blocks-items.potion-needs-jar`, under **Last export** in **Problems**. The rest of the pack exports as usual. Export the Fabric mod jar to brew your potions.

## Limits

- Only potions are brewed: a brewing step that makes an item that is not a potion is not possible yet.
- Brewing stand fuel stays blaze powder (an item can be made fuel with the vanilla `minecraft:brewing_fuel` component under [Vanilla components](blocks-and-items.md#vanilla-components)).
- No instant effects (like instant health) and no custom bottle item or colour.
- The Recipe Studio has no brewing layout: edit brewing recipes in the form or **Raw JSON**.
- MCSuperMods does not check your ingredient against the vanilla brewing recipes; the ingredients the Creator offers are safe.
- Effects of other mods that register after yours cannot be used in your potions.

## In the game

Export the **Fabric mod jar** or use **Test in Minecraft**; **Problems** must show no errors. Then, in a creative world:

- look in the creative inventory: your potion, its versions and the splash and lingering bottles are listed with the vanilla potions (**Food & Drinks**), the tipped arrows with the vanilla tipped arrows (**Combat**), each with its name;
- place a brewing stand, add blaze powder, three awkward potions and your ingredient, and wait for the brew; then try redstone dust, glowstone dust, gunpowder and dragon's breath;
- drink one and check the effect, throw a splash potion at a mob, throw a lingering potion and stand in the cloud, and shoot a tipped arrow.

## Troubleshooting

| Problem | What to do |
|---|---|
| The potion is missing from the game | Check that the jar is in the `mods` folder and the game log's `[msm_runtime]` line counts no errors. An older runtime logs "unknown kind 'potion'": export again without **Separate runtime and GeckoLib (for modpacks)**, or update the runtime. |
| The game log says a potion was skipped | One of its effects does not exist; **Problems** shows it as `blocks-items.potion-effect-missing`. |
| The brewing stand does nothing | Check the fuel (blaze powder), the bottle (the step names a potion, a splash potion or a lingering potion) and the base potion: the ingredient goes into the potion **Added to** names. |
| Another potion comes out | Two recipes use the same ingredient on the same potion; **Problems** warns about it within your project, but another mod or data pack can use the same pair. |
| The potion is called `item.minecraft.potion.effect...` | The name keys are missing: give the potion a **Display name**. |
