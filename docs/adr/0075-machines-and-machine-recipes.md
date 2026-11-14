# ADR 0075: Machines and machine recipes

## Context

With [ADR 0074](0074-containers-and-block-entities.md) a block can hold items. A machine also processes them over time, as a furnace does: an input slot, a fuel slot, an output slot, a progress arrow, recipes as data. The coverage audit lists custom recipe types and serialisers as "no (runtime + block entity, B8)". This ADR covers the machine component, its recipes, power, experience, hopper faces and comparator output; the Studio, flows, templates and Script API are [ADR 0076](0076-container-and-machine-flows-studio-and-script-api.md). The plan `docs/PLAN-containers-machines.md` holds the fact table (F1–F22) and limits (C1–C18).

Facts read on 2026-11-14 with `javap` (JDK 25) over the Loom-cached merged jars of 26.3 and 26.4-snapshot-7 (identical on both unless said):

- **Recipe types and serialisers are code.** `RecipeType` is an interface whose static `register(String)` always uses the `minecraft` namespace; `RecipeSerializer` is a record of a `MapCodec` and a `StreamCodec` with a public constructor; both registries are frozen at start-up. A recipe file whose `type` names a serialiser the game does not have cannot be loaded, so a vanilla data pack cannot carry a machine recipe, and a machine recipe type must be registered by the runtime at initialisation.
- **The recipe interface.** `Recipe<T extends RecipeInput>`: `matches(T, Level)`, `assemble(T)`, `showNotification()`, `group()`, `getSerializer()`, `getType()`, `placementInfo()` (`PlacementInfo.create(Ingredient)`), `display()` (default) and `recipeBookCategory()` (`RecipeBookCategories.FURNACE_MISC` and others). `RecipeManager.getRecipeFor(type, input, level[, previous])` and `RecipeManager.createCheck(type)` (a cached check) look recipes up; `Ingredient.CODEC` and `ItemStackTemplate.CODEC` decode the usual recipe fields. Recipes live in data packs and reload with `/reload`; in 26.x the client receives only property sets and recipe book displays, so a recipe type needs no client code.
- **Cooking.** `AbstractCookingRecipe` (`cookingTime()`, `experience()`) backs `minecraft:smelting`, `blasting`, `smoking` and `campfire_cooking`, matched with a `SingleRecipeInput`. Fuel is the item component `minecraft:cooking_fuel` (`CookingFuel`: a burn time and a speed multiplier, resolved with `ResolvableInt.getFromItem` and `ResolvableFloat.getFromItem`); 26.x has no `FuelValues` class.
- **The furnace menu works for any three-slot container.** `FurnaceMenu`, `BlastFurnaceMenu` and `SmokerMenu` `(int, Inventory, Container, ContainerData)` are public, check for 3 slots and 4 data values (lit time, lit duration, progress, total) and draw the flame and arrow from them. `AbstractFurnaceMenu.canSmelt` (protected; the furnace's recipe property set) decides shift-click into the input slot and `isFuel` (protected; `cooking_fuel`) what the fuel slot takes, on whichever side runs the menu. `FurnaceResultSlot(Player, Container, int, int, int)` gives experience only when the container is an `AbstractFurnaceBlockEntity`; `AbstractContainerMenu.slots` is a public list and `Slot.index` a public field.
- **Menu data is 16-bit** (`ClientboundContainerSetDataPacket` writes shorts).

## Decision

- **D1 A component, `msm:machine`.** Allowed on the same four types as `msm:container` and never together with it (a validator error, `blocks-items.machine-and-container`, and a runtime load error that drops `msm:container`). A machine has exactly the furnace's three slots: input (0), fuel (1), output (2).

  ```
  struct Machine {
    recipe_types?: [#[id="recipe_type"] string] @ 1..5,  // default [the machine's own id]; also minecraft:smelting, blasting, smoking, campfire_cooking (target fact)
    power?: "fuel" | "redstone" | "always",   // default "fuel"
    speed?: float @ 0.1..10,                  // multiplies progress per tick; default 1
    default_time?: int @ 1..32767,            // ticks for a recipe without its own time; default 200 (a furnace's)
    menu?: "furnace" | "blast_furnace" | "smoker",  // default from the first vanilla recipe type, else furnace
    hoppers?: boolean,                        // default true: the furnace's faces (D5)
    comparator?: "contents" | "progress" | "none",  // default "contents"
    lit_light?: int @ 0..15,                  // light while working; default 13 (a lit furnace's)
    on_start?: string,                        // event when a recipe starts
    on_finish?: string,                       // event when an output is made
  }
  ```

  `fuel` burns `cooking_fuel` items as a furnace does (burn time from the component, the fuel's speed multiplier applied); `redstone` works only while the block receives a redstone signal and takes no fuel; `always` works whenever it has a matching input. The block has vanilla's `lit` property (`BlockStateProperties.LIT`, chosen through `MsmBlock`'s thread-local set-up), true while working, and its light is `lit_light` while lit (the block's `msm:light_emitter` level otherwise).
- **D2 One recipe type per machine, with the machine's id.** The runtime registers, for every machine definition, a `RecipeType` and a `RecipeSerializer` whose id is the machine block's id (a type or serialiser id already registered is a load error that registers the block without its machine). A machine recipe is a data pack file `data/<ns>/recipe/<path>.json`:

  ```
  struct MachineRecipe {
    type: #[id="recipe_serializer"] string,   // the machine's id, for example "mymod:grinder"
    ingredient: Ingredient,                   // vanilla's: an item id, a #tag or a list
    count?: int @ 1..64,                      // inputs used per output; default 1
    result: ItemStackTemplate,                // vanilla's { id, count?, components? }
    time?: int @ 1..32767,                    // ticks at speed 1; default the machine's default_time
    experience?: float @ 0..,                 // default 0
  }
  ```

  We chose one type per machine over one shared `msm_runtime:` type with a `machine` field because the ids then belong to the project's namespace, so the ejected mod registers the same ids with no rewriting and no clash with the runtime, recipe lookups need no filtering, and several machines can still share recipes by listing another machine's id in `recipe_types` (as a smoker also takes campfire-like food). The recipe class `MsmMachineRecipe implements Recipe<MachineInput>` matches the ingredient and the count, `recipeBookCategory()` is `FURNACE_MISC`, `display()` is empty (machine recipes do not appear in the recipe book, limit C11), and `showNotification()` is false.
- **D3 Runtime.** `registry/machine/MsmMachineBlockEntity extends BaseContainerBlockEntity implements WorldlyContainer` with a server-only ticker (`EntityBlock.getTicker`), a `ContainerData` of the furnace's four values, a `RecipeManager.createCheck` per accepted type, a lookup only when the input changed (the furnace's rule), progress saved with the items, and `lit` updated only on change. Vanilla cooking recipes take one input and use their own `cookingTime`. A finished recipe moves its result into the output slot when it fits (it waits otherwise) and fires `on_finish`; events run at the block with no actor (`run_function` at the block's centre, no `@s`), like a block's random tick trigger.
- **D4 The furnace menu with a server-side subclass.** `createMenu` builds `MsmFurnaceMenu extends FurnaceMenu` (or the blast furnace or smoker menu for `menu`), so the client opens the vanilla screen. The subclass overrides `canSmelt` (the machine's own recipe types) and `isFuel` (false unless `power: fuel`) on the server, and replaces the result slot (index 2) with `MsmMachineResultSlot extends FurnaceResultSlot`, whose `checkTakeAchievements` pays out the machine's stored experience to the taking player. The client predicts with vanilla's furnace rules and the server corrects it (limit C10).
- **D5 Hoppers and comparators.** With `hoppers: true` the faces are a furnace's: the top reaches the input, the sides the fuel (only with `power: fuel`), the bottom the output (and an empty bucket in the fuel slot, as vanilla). `comparator`: `contents` is the container formula, `progress` is `ceil(15 × progress ÷ total)` while working and 0 otherwise, `none` gives no signal.
- **D6 Experience.** Each output adds its recipe's experience to a stored total (saved with the block entity); taking from the output slot through the menu pays it out to that player as orbs, and breaking the machine drops the rest as orbs at the block, the furnace's rule. Outputs taken by hoppers keep their experience stored.
- **D7 Versions.** All code is shared: every member used is identical on both versions; the runtime never constructs a plain `Slot` and never calls `RecipeType.register(String)`. Plugin API 1.12.0 (additive, with [ADR 0074](0074-containers-and-block-entities.md) D7) adds `BlockFacts.machineRecipeTypes?: readonly string[]`, the vanilla recipe types a machine may take; both targets list `minecraft:smelting`, `minecraft:blasting`, `minecraft:smoking` and `minecraft:campfire_cooking` (checked against the vendored `recipe_type` registry).
- **D8 Lowering and the recipe format in MSM mcdoc.** The element keeps its machine recipes in an editor-only list, `recipes?: [{ name?, ingredient, count?, result, time?, experience? }]` on `msm:block` (stripped from the definition), lowered to `data/<ns>/recipe/<machine path>/<name>.json` with `type` set to the machine's id and checked against a new MSM mcdoc schema `::msm::recipe::MachineRecipe` (not vanilla's recipe dispatch, which does not know the type). `name` defaults to the result's path, with `_2`, `_3` added on a clash. Lowering also writes the `lit` variants of the blockstate and the lit model (`models.lit`, or for the facing types with `textures` the texture slot `front_lit`, lowered to `<id>_lit`).
- **D9 Validators** (codes `blocks-items.*`): `machine-and-container`, `machine-recipe-type-unknown` (neither the machine's own id, another project machine nor a target fact), `machine-recipe-item-unknown` (ingredient or result neither vanilla nor a project item), `machine-without-recipes` (warning: own type listed but no recipe in the project), `machine-fuel-unused` (info: `redstone` or `always` with a fuel-related setting), `machine-time-range` (a computed time above 32767 ticks), `machine-event-unknown`.
- **D10 Vanilla pack safety ([ADR 0066](0066-vanilla-pack-safety.md)).** A machine recipe names a mod-only id in its `type` (the machine's block id), so the existing rule leaves it out of vanilla data packs with `export.mod-only-reference`. The exporters brief adds a test that proves this for a `type` value and, if the generic scan skips `type`, adds the machine ids under the `recipe_serializer` registry to the host's mod-only ids. Vanilla cooking recipes the project writes for vanilla items stay in the vanilla pack.
- **D11 Java eject (26.3 generator).** Generated `ModRecipes.java` registers each machine's recipe type and serialiser with the same ids, a generated `recipe/MachineRecipe.java` copies the runtime's recipe class, and generated machine block entities and the server-side menu subclass copy the runtime's (templates checked line by line against the runtime in the generator's tests). The recipe files are the same data files.
- **D12 Not in this batch (limits).** Several inputs or outputs, byproducts with chances, fluids, energy and machines that connect to each other (all need a menu of our own or more than three slots); machine recipes in the recipe book or in recipe viewers; a progress bar drawn in our own style; custom fuel rules beyond `cooking_fuel`; a processing time above 32767 ticks (16-bit menu data).

## Consequences

- Format 1 grows additively: one component, one editor-only list, two texture or model slots and a new MSM recipe schema. `BlockComponents` reaches 14 of the 16 fields a `RecordCodecBuilder` group takes; a later block component needs a nested group.
- The runtime registers recipe types and serialisers for the first time, one pair per machine. Machine recipes are ordinary reloadable data that any data pack can add to, as long as the mod is loaded.
- Players see vanilla furnace, blast furnace or smoker screens with their recipe book button; clicking a vanilla recipe there may move vanilla ingredients into the machine (limit C11).

## Status

Accepted (2026-11-14), with the defaults below; the user may still veto: the component name `msm:machine` and the three-slot furnace layout (D1); `power: fuel`, `speed` 1, 200 ticks and `lit_light` 13 (D1); one recipe type per machine with the machine's id (D2); the recipe field names (D2); the furnace's hopper faces (D5); experience paid on taking from the menu (D6); recipe file names from the result's path (D8).
