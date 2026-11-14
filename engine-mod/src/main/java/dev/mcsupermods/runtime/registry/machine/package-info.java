/**
 * Machines (ADR 0075): {@code msm:machine} blocks process items over time in a vanilla furnace, blast furnace or smoker
 * screen. {@code MsmMachineBlockEntity} (three slots, the ticker, fuel, hoppers, comparators, experience),
 * {@code MachineRecipes} (one {@code RecipeType} and {@code RecipeSerializer} per machine, with the machine's id),
 * {@code MsmMachineRecipe} and {@code MachineInput} (the recipe class and its input), {@code MachineRecipeFormat} (the
 * recipe file's fields, shared with the JUnit corpus test), {@code MsmFurnaceMenu} (server-side subclasses of the
 * vanilla furnace menus), {@code MsmMachineResultSlot} (pays the stored experience) and {@code MachineData} (the four
 * menu data values). The block class is {@code registry.container.MsmContainerBlock}; registration goes through
 * {@code registry.container.BlockEntityHooks}.
 */
package dev.mcsupermods.runtime.registry.machine;
