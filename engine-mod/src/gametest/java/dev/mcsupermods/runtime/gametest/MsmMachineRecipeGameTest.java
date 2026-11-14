package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;
import dev.mcsupermods.runtime.registry.container.BlockEntityHooks;
import dev.mcsupermods.runtime.registry.machine.MachineInput;
import dev.mcsupermods.runtime.registry.machine.MsmMachineBlockEntity;
import dev.mcsupermods.runtime.registry.machine.MsmMachineRecipe;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.metadata.pack.PackFormat;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.crafting.Recipe;
import net.minecraft.world.item.crafting.RecipeBookCategories;
import net.minecraft.world.item.crafting.RecipeHolder;
import net.minecraft.world.level.storage.LevelResource;

/**
 * Machine recipe types (ADR 0075 D2, B316): one recipe type and serialiser per machine with the machine's id, the recipe
 * class and its codec against the format's rules (the shared field list is checked over the corpus by the JUnit
 * {@code MachineRecipeCodecTest}; vanilla's ingredient and result codecs are checked here), vanilla cooking types, another
 * machine's type, and a recipe added by {@code /reload}.
 *
 * <p>The reload test is {@code manualOnly} (run it alone with
 * {@code /test run msm_runtime_gametest:msm_machine_recipe_game_test_recipe_added_by_reload_is_used} in
 * {@code runGameTest}'s server, or {@code runClient}): a real {@code /reload} in the automatic run resets the script
 * host, and batches run in no fixed order, so {@code MsmScriptGameTest}'s start-up checks failed whenever the reload
 * batch ran first (seen with its own test environment). The automatic run covers the lookup rule through
 * {@code MsmMachineGameTest} (input changes) only.
 */
public class MsmMachineRecipeGameTest {
    private static final BlockPos AT = new BlockPos(2, 2, 2);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static int count(MsmMachineBlockEntity be, int slot, net.minecraft.world.item.Item item) {
        ItemStack stack = be.getItem(slot);
        return stack.is(item) ? stack.getCount() : 0;
    }

    @GameTest
    public void typesAndSerialisersCarryTheMachineId(GameTestHelper helper) {
        helper.assertTrue(BlockEntityHooks.machineRecipeTypes() >= 8, "machine recipe types counted: " + BlockEntityHooks.machineRecipeTypes());
        Optional<RecipeHolder<?>> holder = helper.getLevel().recipeAccess()
                .byKey(ResourceKey.create(Registries.RECIPE, id("machine/grinder/diorite")));
        helper.assertTrue(holder.isPresent(), "recipe msm_test:machine/grinder/diorite not loaded");
        Recipe<?> recipe = holder.get().value();
        helper.assertTrue(recipe instanceof MsmMachineRecipe, "not a machine recipe: " + recipe);
        MsmMachineRecipe r = (MsmMachineRecipe) recipe;
        helper.assertTrue(r.getType() == BuiltInRegistries.RECIPE_TYPE.getValue(id("machine_grinder")), "recipe type");
        helper.assertTrue(r.getSerializer() == BuiltInRegistries.RECIPE_SERIALIZER.getValue(id("machine_grinder")), "recipe serializer");
        helper.assertValueEqual(r.count(), 2, "count");
        helper.assertValueEqual(r.time(), Optional.of(20), "time");
        helper.assertTrue(r.display().isEmpty(), "a machine recipe has a recipe book display");
        helper.assertTrue(r.recipeBookCategory() == RecipeBookCategories.FURNACE_MISC, "recipe book category");
        helper.assertFalse(r.showNotification(), "shows a notification");
        helper.assertFalse(r.placementInfo().isImpossibleToPlace(), "placement info");
        ServerLevel level = helper.getLevel();
        helper.assertFalse(r.matches(new MachineInput(new ItemStack(Items.ANDESITE)), level), "matched one andesite (count 2)");
        helper.assertTrue(r.matches(new MachineInput(new ItemStack(Items.ANDESITE, 2)), level), "did not match two andesite");
        helper.assertFalse(r.matches(new MachineInput(new ItemStack(Items.GRANITE, 2)), level), "matched granite");
        helper.assertTrue(r.assemble(new MachineInput(new ItemStack(Items.ANDESITE, 2))).is(Items.DIORITE), "result");
        Optional<RecipeHolder<?>> gravel = level.recipeAccess().byKey(ResourceKey.create(Registries.RECIPE, id("machine/grinder/gravel")));
        helper.assertTrue(gravel.isPresent() && gravel.get().value() instanceof MsmMachineRecipe g && g.time().isEmpty()
                && g.experience() == 2.0f && g.count() == 1, "gravel recipe defaults: " + gravel);
        helper.succeed();
    }

    private static DataResult<Recipe<?>> decode(GameTestHelper helper, String json) {
        RegistryOps<JsonElement> ops = helper.getLevel().registryAccess().createSerializationContext(JsonOps.INSTANCE);
        return Recipe.DIRECT_CODEC.parse(ops, JsonParser.parseString(json));
    }

    /** The format's rules with vanilla's ingredient and result codecs (the corpus cases the JUnit stand-ins cannot prove). */
    @GameTest
    public void recipeCodecFollowsTheFormat(GameTestHelper helper) {
        String type = "\"type\":\"msm_test:machine_grinder\"";
        DataResult<Recipe<?>> valid = decode(helper, "{" + type + ",\"ingredient\":[\"minecraft:cobblestone\",\"minecraft:gravel\"],"
                + "\"count\":64,\"result\":{\"id\":\"minecraft:sand\",\"count\":99,\"components\":{\"minecraft:custom_name\":\"Finesand\"}},"
                + "\"time\":32767,\"experience\":0.5}");
        helper.assertTrue(valid.result().isPresent() && valid.result().get() instanceof MsmMachineRecipe,
                "valid recipe: " + valid.error().map(DataResult.Error::message).orElse(""));
        helper.assertTrue(decode(helper, "{" + type + ",\"ingredient\":\"#minecraft:logs\",\"result\":{\"id\":\"minecraft:stick\"}}")
                .result().isPresent(), "tag ingredient");
        record Bad(String json, String field) {}
        for (Bad bad : List.of(
                new Bad("\"ingredient\":[],\"result\":{\"id\":\"minecraft:sand\"}", "ingredient"),
                new Bad("\"ingredient\":\"minecraft:stone\",\"result\":{\"id\":\"minecraft:sand\",\"count\":100}", "result"),
                new Bad("\"ingredient\":\"minecraft:stone\",\"result\":{\"count\":2}", "result"),
                new Bad("\"ingredient\":\"minecraft:stone\",\"result\":\"minecraft:sand\"", "result"),
                new Bad("\"ingredient\":\"minecraft:stone\",\"result\":{\"id\":\"minecraft:sand\"},\"count\":0", "count"),
                new Bad("\"ingredient\":\"minecraft:stone\",\"result\":{\"id\":\"minecraft:sand\"},\"count\":65", "count"),
                new Bad("\"ingredient\":\"minecraft:stone\",\"result\":{\"id\":\"minecraft:sand\"},\"time\":0", "time"),
                new Bad("\"ingredient\":\"minecraft:stone\",\"result\":{\"id\":\"minecraft:sand\"},\"time\":40000", "time"),
                new Bad("\"ingredient\":\"minecraft:stone\",\"result\":{\"id\":\"minecraft:sand\"},\"experience\":-0.5", "experience"),
                new Bad("\"ingredient\":\"minecraft:stone\",\"result\":{\"id\":\"minecraft:sand\"},\"byproduct\":{\"id\":\"minecraft:stone\"}",
                        "byproduct"),
                new Bad("\"result\":{\"id\":\"minecraft:sand\"}", "ingredient"))) {
            DataResult<Recipe<?>> result = decode(helper, "{" + type + "," + bad.json() + "}");
            helper.assertTrue(result.error().isPresent(), "accepted: " + bad.json());
            String message = result.error().get().message();
            helper.assertTrue(message.contains(bad.field()), "error for " + bad.json() + " does not name " + bad.field() + ": " + message);
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 260)
    public void smeltingMachineUsesSmeltingTime(GameTestHelper helper) {
        MsmMachineBlockEntity be = MsmMachineGameTest.place(helper, AT, "machine_smelter");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.RAW_IRON));
        be.setItem(MsmMachineBlockEntity.FUEL, new ItemStack(Items.COAL));
        helper.runAfterDelay(10, () -> helper.assertValueEqual(be.totalTime(), 200, "total time (smelting's cooking time)"));
        helper.runAfterDelay(190, () -> helper.assertTrue(be.getItem(MsmMachineBlockEntity.OUTPUT).isEmpty(), "output before 200 ticks"));
        helper.runAfterDelay(215, () -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.IRON_INGOT), 1, "iron ingot made");
            helper.assertTrue(be.storedExperience() > 0.69f && be.storedExperience() < 0.71f, "smelting's experience: " + be.storedExperience());
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 60)
    public void anotherMachinesRecipesWorkWhenListed(GameTestHelper helper) {
        MsmMachineBlockEntity mixer = MsmMachineGameTest.place(helper, AT, "machine_mixer"); // its own type, then the grinder's
        mixer.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.COBBLESTONE));
        MsmMachineBlockEntity grinder = MsmMachineGameTest.place(helper, AT.east(3), "machine_fast"); // the grinder's type only
        grinder.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.SAND)); // a mixer recipe: not listed
        helper.runAfterDelay(30, () -> {
            helper.assertValueEqual(count(mixer, MsmMachineBlockEntity.OUTPUT, Items.GRAVEL), 1, "gravel from the grinder's recipe");
            helper.assertTrue(grinder.getItem(MsmMachineBlockEntity.OUTPUT).isEmpty(), "the fast machine used the mixer's recipe");
            helper.assertValueEqual(count(grinder, MsmMachineBlockEntity.INPUT, Items.SAND), 1, "sand used");
            helper.succeed();
        });
    }

    /**
     * A recipe written into a world data pack and loaded by {@code /reload} is used by a machine that already held its
     * input (the lookup runs again when the recipe manager changes).
     */
    @GameTest(manualOnly = true, maxTicks = 600)
    public void recipeAddedByReloadIsUsed(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        Path pack = server.getWorldPath(LevelResource.DATAPACK_DIR).resolve("msm_machine_reload");
        MsmMachineBlockEntity be = MsmMachineGameTest.place(helper, AT, "machine_fast");
        be.setItem(MsmMachineBlockEntity.INPUT, new ItemStack(Items.PUMPKIN));
        helper.runAfterDelay(30, () -> {
            helper.assertTrue(be.getItem(MsmMachineBlockEntity.OUTPUT).isEmpty(), "pumpkin processed before the reload");
            writePack(pack);
            server.getCommands().performPrefixedCommand(server.createCommandSourceStack().withSuppressedOutput(), "reload");
        });
        helper.succeedWhen(() -> {
            helper.assertValueEqual(count(be, MsmMachineBlockEntity.OUTPUT, Items.CARVED_PUMPKIN), 1, "carved pumpkin after the reload");
            deletePack(pack);
        });
    }

    private static void writePack(Path pack) {
        PackFormat format = SharedConstants.getCurrentVersion().packVersion(PackType.SERVER_DATA);
        String version = "[" + format.major() + ", " + format.minor() + "]";
        try {
            Path recipe = pack.resolve("data/msm_test/recipe/machine/reload/carved_pumpkin.json");
            Files.createDirectories(recipe.getParent());
            Files.writeString(pack.resolve("pack.mcmeta"), "{\"pack\":{\"description\":\"MSM machine reload test\",\"min_format\":"
                    + version + ",\"max_format\":" + version + "}}", StandardCharsets.UTF_8);
            Files.writeString(recipe, "{\"type\":\"msm_test:machine_grinder\",\"ingredient\":\"minecraft:pumpkin\","
                    + "\"result\":{\"id\":\"minecraft:carved_pumpkin\"},\"time\":10}", StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void deletePack(Path pack) {
        try (Stream<Path> walk = Files.walk(pack)) {
            for (Path p : walk.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(p);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
