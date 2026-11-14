package dev.mcsupermods.runtime.registry.machine;

import com.mojang.serialization.MapCodec;
import java.util.List;
import java.util.Optional;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.item.crafting.PlacementInfo;
import net.minecraft.world.item.crafting.Recipe;
import net.minecraft.world.item.crafting.RecipeBookCategories;
import net.minecraft.world.item.crafting.RecipeBookCategory;
import net.minecraft.world.item.crafting.RecipeSerializer;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.item.crafting.display.RecipeDisplay;
import net.minecraft.world.level.Level;

/**
 * A machine recipe (ADR 0075 D2): {@code count} of {@code ingredient} from the input slot make {@code result} after
 * {@code time} ticks at speed 1 (absent: the machine's {@code default_time}), storing {@code experience}. Its type and
 * serialiser are the machine's ({@link MachineRecipes.Kind}). Not shown in the recipe book: {@link #display()} is empty
 * (limit C11), the category {@code FURNACE_MISC}, no unlock notification.
 */
public final class MsmMachineRecipe implements Recipe<MachineInput>, MachineRecipeFormat.Fields<Ingredient, ItemStackTemplate> {
    private final MachineRecipes.Kind kind;
    private final Ingredient ingredient;
    private final int count;
    private final ItemStackTemplate result;
    private final Optional<Integer> time;
    private final float experience;
    private PlacementInfo placementInfo;

    public MsmMachineRecipe(MachineRecipes.Kind kind, Ingredient ingredient, int count, ItemStackTemplate result,
            Optional<Integer> time, float experience) {
        this.kind = kind;
        this.ingredient = ingredient;
        this.count = count;
        this.result = result;
        this.time = time;
        this.experience = experience;
    }

    /** The data pack codec of {@code kind}'s recipes: vanilla's ingredient and result shapes in {@link MachineRecipeFormat}. */
    static MapCodec<MsmMachineRecipe> codec(MachineRecipes.Kind kind) {
        return MachineRecipeFormat.mapCodec(Ingredient.CODEC, ItemStackTemplate.MAP_CODEC.codec(),
                (ingredient, count, result, time, experience) -> new MsmMachineRecipe(kind, ingredient, count, result, time, experience));
    }

    /** The network codec of {@code kind}'s recipes (registry sync completeness; 26.x sends recipes to no client). */
    static StreamCodec<RegistryFriendlyByteBuf, MsmMachineRecipe> streamCodec(MachineRecipes.Kind kind) {
        return StreamCodec.composite(
                Ingredient.CONTENTS_STREAM_CODEC, MsmMachineRecipe::ingredient,
                ByteBufCodecs.VAR_INT, MsmMachineRecipe::count,
                ItemStackTemplate.STREAM_CODEC, MsmMachineRecipe::result,
                ByteBufCodecs.optional(ByteBufCodecs.VAR_INT), MsmMachineRecipe::time,
                ByteBufCodecs.FLOAT, MsmMachineRecipe::experience,
                (ingredient, count, result, time, experience) -> new MsmMachineRecipe(kind, ingredient, count, result, time, experience));
    }

    @Override
    public Ingredient ingredient() {
        return ingredient;
    }

    @Override
    public int count() {
        return count;
    }

    @Override
    public ItemStackTemplate result() {
        return result;
    }

    @Override
    public Optional<Integer> time() {
        return time;
    }

    @Override
    public float experience() {
        return experience;
    }

    /** The machine whose recipe type this is. */
    public MachineRecipes.Kind kind() {
        return kind;
    }

    /** The input slot holds at least {@code count} of the ingredient. */
    @Override
    public boolean matches(MachineInput input, Level level) {
        ItemStack stack = input.item();
        return !stack.isEmpty() && stack.getCount() >= count && ingredient.test(stack);
    }

    @Override
    public ItemStack assemble(MachineInput input) {
        return result.create();
    }

    @Override
    public boolean showNotification() {
        return false;
    }

    @Override
    public String group() {
        return "";
    }

    @Override
    public RecipeSerializer<MsmMachineRecipe> getSerializer() {
        return kind.serializer();
    }

    @Override
    public RecipeType<MsmMachineRecipe> getType() {
        return kind.type();
    }

    @Override
    public PlacementInfo placementInfo() {
        if (placementInfo == null) {
            placementInfo = PlacementInfo.create(ingredient);
        }
        return placementInfo;
    }

    @Override
    public List<RecipeDisplay> display() {
        return List.of();
    }

    @Override
    public RecipeBookCategory recipeBookCategory() {
        return RecipeBookCategories.FURNACE_MISC;
    }
}
