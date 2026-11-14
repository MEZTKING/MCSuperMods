package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import com.google.gson.JsonParser;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AreaEffectCloud;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.arrow.Arrow;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrownLingeringPotion;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrownSplashPotion;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.item.crafting.BrewingInput;
import net.minecraft.world.item.crafting.BrewingRecipe;
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.CraftingRecipe;
import net.minecraft.world.item.crafting.Recipe;
import net.minecraft.world.item.crafting.RecipeHolder;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BrewingStandBlockEntity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Potions (ADR 0063 D2, D4, B247) on {@code msm/msm_test/potion/} and the brewing recipes in
 * {@code data/msm_test/recipe/brewing/}: registration with the stated effects and name, the unknown-effect skip, the
 * recipes found by the recipe manager, a real brewing stand, drinking, splash, lingering, tipped arrows through vanilla's
 * {@code crafting_imbue} recipe, a {@code minecraft:potion_contents} passthrough, the creative tabs, and what vanilla does
 * with a brewing recipe that names an unregistered potion (P8: it does not decode, and as a file it fails the data
 * pack load).
 */
public class MsmPotionGameTest {
    private static final BlockPos AT = new BlockPos(2, 1, 2);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Holder<Potion> potion(GameTestHelper helper, String path) {
        Holder<Potion> holder = BuiltInRegistries.POTION.get(id(path)).<Holder<Potion>>map(h -> h).orElse(null);
        helper.assertTrue(holder != null, "potion msm_test:" + path + " not registered");
        return holder;
    }

    private static Holder<MobEffect> frostbite() {
        return BuiltInRegistries.MOB_EFFECT.get(id("frostbite")).orElseThrow();
    }

    private static ItemStack bottle(Item item, Holder<Potion> potion) {
        return PotionContents.createItemStack(item, potion);
    }

    private static boolean carries(ItemStack stack, Item item, Holder<Potion> potion) {
        PotionContents contents = stack.get(DataComponents.POTION_CONTENTS);
        return stack.is(item) && contents != null && contents.is(potion);
    }

    /** Records the effect events whose holder is {@code holder}; other tests run at the same time. */
    private static final class Recorder implements EventListener, AutoCloseable {
        final List<String> events = Collections.synchronizedList(new ArrayList<>());
        private final LivingEntity holder;

        Recorder(LivingEntity holder) {
            this.holder = holder;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (ctx.entity() == holder) {
                events.add(owner.getPath() + ":" + event.getPath());
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    private static void assertEffect(GameTestHelper helper, MobEffectInstance e, Holder<MobEffect> effect, int duration, int amplifier,
            String what) {
        helper.assertTrue(e.is(effect), what + ": effect " + e.getEffect());
        helper.assertValueEqual(e.getDuration(), duration, what + ": duration");
        helper.assertValueEqual(e.getAmplifier(), amplifier, what + ": amplifier");
    }

    @GameTest
    public void potionsAreRegisteredWithTheirEffects(GameTestHelper helper) {
        Holder<MobEffect> frostbite = frostbite();
        Potion base = potion(helper, "frost_draught").value();
        Potion longer = potion(helper, "long_frost_draught").value();
        Potion stronger = potion(helper, "strong_frost_draught").value();
        helper.assertValueEqual(base.getEffects().size(), 1, "frost_draught effects");
        assertEffect(helper, base.getEffects().getFirst(), frostbite, 3600, 0, "frost_draught");
        assertEffect(helper, longer.getEffects().getFirst(), frostbite, 9600, 0, "long_frost_draught");
        assertEffect(helper, stronger.getEffects().getFirst(), frostbite, 1800, 1, "strong_frost_draught");
        // The default name is <ns>.<path>; the variants state their base potion's name.
        helper.assertValueEqual(base.name(), "msm_test.frost_draught", "default name");
        helper.assertValueEqual(longer.name(), "msm_test.frost_draught", "long name");
        helper.assertValueEqual(stronger.name(), "msm_test.frost_draught", "strong name");
        // A potion of vanilla effects, with the optional flags.
        Potion swift = potion(helper, "swift_step").value();
        helper.assertValueEqual(swift.name(), "msm_test.swift", "explicit name");
        helper.assertValueEqual(swift.getEffects().size(), 2, "swift_step effects");
        MobEffectInstance speed = swift.getEffects().getFirst();
        assertEffect(helper, speed, MobEffects.SPEED, 600, 2, "swift_step speed");
        helper.assertTrue(speed.isAmbient() && !speed.isVisible() && !speed.showIcon(), "ambient, no particles, no icon: " + speed);
        MobEffectInstance jump = swift.getEffects().get(1);
        assertEffect(helper, jump, MobEffects.JUMP_BOOST, 200, 0, "swift_step jump boost");
        helper.assertTrue(!jump.isAmbient() && jump.isVisible() && jump.showIcon(), "defaults: not ambient, particles, icon: " + jump);
        helper.assertTrue(MsmRuntime.report().potions().containsAll(List.of(id("frost_draught"), id("long_frost_draught"),
                id("strong_frost_draught"), id("swift_step"))), "potions in the report: " + MsmRuntime.report().potions());
        helper.succeed();
    }

    @GameTest
    public void unknownEffectSkipsThePotionWithOneError(GameTestHelper helper) {
        helper.assertFalse(BuiltInRegistries.POTION.containsKey(id("partly_broken")), "partly_broken registered");
        helper.assertFalse(MsmRuntime.report().potions().contains(id("partly_broken")), "partly_broken in the report");
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("/potion/")).toList();
        helper.assertValueEqual(errors.size(), 1, "potion errors: " + errors);
        helper.assertTrue(errors.getFirst().contains("potion/partly_broken.json") && errors.getFirst().contains("msm_test:no_such_effect")
                && errors.getFirst().contains("msm_runtime_gametest"), "error names the file, the mod and the effect: " + errors);
        helper.succeed();
    }

    @GameTest
    public void itemNameKeyFollowsThePotionName(GameTestHelper helper) {
        Holder<Potion> draught = potion(helper, "frost_draught");
        Holder<Potion> strong = potion(helper, "strong_frost_draught");
        for (Item item : List.of(Items.POTION, Items.SPLASH_POTION, Items.LINGERING_POTION, Items.TIPPED_ARROW)) {
            String expected = item.getDescriptionId() + ".effect.msm_test.frost_draught";
            for (Holder<Potion> p : List.of(draught, strong)) {
                ItemStack stack = bottle(item, p);
                Component name = stack.getItem().getName(stack);
                helper.assertTrue(name.getContents() instanceof TranslatableContents t && t.getKey().equals(expected),
                        "name of " + p.getRegisteredName() + " as " + item + ": " + name + ", expected " + expected);
            }
        }
        helper.succeed();
    }

    /** The output potion of the brewing recipe for {@code input} and {@code reagent}, or empty. */
    private static Optional<ItemStack> brew(GameTestHelper helper, ItemStack input, Item reagent) {
        ServerLevel level = helper.getLevel();
        BrewingInput in = new BrewingInput(input, new ItemStack(reagent));
        return level.recipeAccess().getRecipeFor(RecipeType.BREWING, in, level).map(h -> h.value().assemble(in));
    }

    @GameTest
    public void brewingRecipesAreFound(GameTestHelper helper) {
        Holder<Potion> draught = potion(helper, "frost_draught");
        record Step(String what, ItemStack input, Item reagent, Item output, Holder<Potion> potion) {}
        List<Step> steps = List.of(
                new Step("base", bottle(Items.POTION, Potions.AWKWARD), Items.SNOWBALL, Items.POTION, draught),
                new Step("long", bottle(Items.POTION, draught), Items.REDSTONE, Items.POTION, potion(helper, "long_frost_draught")),
                new Step("strong", bottle(Items.POTION, draught), Items.GLOWSTONE_DUST, Items.POTION, potion(helper, "strong_frost_draught")),
                new Step("splash", bottle(Items.POTION, draught), Items.GUNPOWDER, Items.SPLASH_POTION, draught),
                new Step("lingering", bottle(Items.SPLASH_POTION, draught), Items.DRAGON_BREATH, Items.LINGERING_POTION, draught));
        for (Step step : steps) {
            Optional<ItemStack> out = brew(helper, step.input(), step.reagent());
            helper.assertTrue(out.isPresent(), step.what() + ": no brewing recipe found");
            helper.assertTrue(carries(out.get(), step.output(), step.potion()),
                    step.what() + ": brewed " + out.get() + " " + out.get().get(DataComponents.POTION_CONTENTS));
        }
        helper.succeed();
    }

    /** A {@code minecraft:brewing} recipe in vanilla's shape. */
    private static String brewingRecipe(String inputPotion, String reagent, String outputPotion) {
        return "{\"type\": \"minecraft:brewing\", \"input\": {\"item\": \"minecraft:potion\", \"potion_contents\": {\"potions\": \""
                + inputPotion + "\"}}, \"reagent\": {\"item\": \"" + reagent + "\"}, \"output\": {\"id\": \"minecraft:potion\", "
                + "\"components\": {\"minecraft:potion_contents\": {\"potion\": \"" + outputPotion + "\"}}}}";
    }

    /**
     * P8: a {@code minecraft:brewing} recipe naming a potion that no mod registers (as a vanilla pack export of a potion
     * does) does not decode, whether the potion is the output or the input. Recipes are a data pack registry on 26.3 and
     * 26.4, so such a file is not skipped: the server log shows "Registry loading errors" and the data pack load fails
     * (a test server with such a file does not start; checked by hand, see B247's report). The recipes are therefore
     * decoded here with the direct recipe Codec instead of being shipped as files; the same recipe naming a registered project
     * potion decodes.
     */
    @GameTest
    public void recipeNamingAnUnregisteredPotionDoesNotDecode(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        var ops = level.registryAccess().createSerializationContext(JsonOps.INSTANCE);
        for (String json : List.of(brewingRecipe("minecraft:awkward", "minecraft:clay_ball", "msm_test:no_such_potion"),
                brewingRecipe("msm_test:no_such_potion", "minecraft:clay_ball", "minecraft:water"))) {
            DataResult<Recipe<?>> result = Recipe.DIRECT_CODEC.parse(ops, JsonParser.parseString(json));
            helper.assertTrue(result.error().isPresent(), "decoded although it names msm_test:no_such_potion: " + json);
            helper.assertTrue(result.error().get().message().contains("no_such_potion"), "error: " + result.error().get().message());
        }
        DataResult<Recipe<?>> good = Recipe.DIRECT_CODEC.parse(ops,
                JsonParser.parseString(brewingRecipe("minecraft:awkward", "minecraft:clay_ball", "msm_test:frost_draught")));
        helper.assertTrue(good.result().orElse(null) instanceof BrewingRecipe, "a project potion does not decode: " + good);
        helper.succeed();
    }

    /** A brewing stand with three awkward potions, a snowball and blaze powder brews three potions of frost draught. */
    @GameTest(maxTicks = 600)
    public void brewingStandBrewsTheProjectPotion(GameTestHelper helper) {
        Holder<Potion> draught = potion(helper, "frost_draught");
        helper.setBlock(AT, Blocks.BREWING_STAND);
        BrewingStandBlockEntity stand = helper.getBlockEntity(AT, BrewingStandBlockEntity.class);
        for (int slot = 0; slot < 3; slot++) {
            stand.setItem(slot, bottle(Items.POTION, Potions.AWKWARD));
        }
        stand.setItem(3, new ItemStack(Items.SNOWBALL));
        stand.setItem(4, new ItemStack(Items.BLAZE_POWDER));
        helper.succeedWhen(() -> {
            for (int slot = 0; slot < 3; slot++) {
                ItemStack out = stand.getItem(slot);
                helper.assertTrue(carries(out, Items.POTION, draught), "slot " + slot + ": " + out + " " + out.get(DataComponents.POTION_CONTENTS));
            }
            helper.assertTrue(stand.getItem(3).isEmpty(), "the snowball was not used up");
        });
    }

    @GameTest
    public void drinkingGivesTheEffectAndFiresOnStart(GameTestHelper helper) {
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        Holder<MobEffect> frostbite = frostbite();
        try (Recorder r = new Recorder(player)) {
            ItemStack stack = bottle(Items.POTION, potion(helper, "strong_frost_draught"));
            stack.finishUsingItem(helper.getLevel(), player);
            MobEffectInstance e = player.getEffect(frostbite);
            helper.assertTrue(e != null, "no frostbite after drinking");
            helper.assertValueEqual(e.getAmplifier(), 1, "strong amplifier");
            helper.assertValueEqual(e.getDuration(), 1800, "strong duration");
            helper.assertTrue(r.events.contains("frostbite:bite"), "msm:on_start did not fire: " + r.events);
        }
        helper.succeed();
    }

    private static Mob cow(GameTestHelper helper) {
        return helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
    }

    /** The point {@code height} blocks above the cow's feet at {@link #AT}, absolute. */
    private static Vec3 above(GameTestHelper helper, double height) {
        return helper.absoluteVec(Vec3.atBottomCenterOf(AT).add(0, height, 0));
    }

    @GameTest(maxTicks = 60)
    public void splashPotionGivesTheEffectToANearbyMob(GameTestHelper helper) {
        Mob cow = cow(helper);
        Holder<MobEffect> frostbite = frostbite();
        Vec3 from = above(helper, 3);
        ThrownSplashPotion thrown = new ThrownSplashPotion(helper.getLevel(), from.x, from.y, from.z,
                bottle(Items.SPLASH_POTION, potion(helper, "frost_draught")));
        thrown.setDeltaMovement(0, -0.5, 0);
        helper.getLevel().addFreshEntity(thrown);
        helper.succeedWhen(() -> {
            helper.assertTrue(thrown.isRemoved(), "the splash potion has not broken yet");
            helper.assertTrue(cow.hasEffect(frostbite), "the cow has no frostbite");
        });
    }

    @GameTest(maxTicks = 100)
    public void lingeringCloudGivesTheEffect(GameTestHelper helper) {
        Mob cow = cow(helper);
        Holder<Potion> draught = potion(helper, "frost_draught");
        Holder<MobEffect> frostbite = frostbite();
        Vec3 from = above(helper, 3);
        ThrownLingeringPotion thrown = new ThrownLingeringPotion(helper.getLevel(), from.x, from.y, from.z,
                bottle(Items.LINGERING_POTION, draught));
        thrown.setDeltaMovement(0, -0.5, 0);
        helper.getLevel().addFreshEntity(thrown);
        helper.succeedWhen(() -> {
            List<AreaEffectCloud> clouds = helper.getLevel().getEntitiesOfClass(AreaEffectCloud.class, new AABB(cow.blockPosition()).inflate(4));
            helper.assertTrue(!clouds.isEmpty(), "no area effect cloud");
            PotionContents contents = clouds.getFirst().get(DataComponents.POTION_CONTENTS);
            helper.assertTrue(contents != null && contents.is(draught), "the cloud does not carry frost draught: " + contents);
            helper.assertTrue(cow.hasEffect(frostbite), "the cow in the cloud has no frostbite");
            clouds.forEach(AreaEffectCloud::discard);
        });
    }

    @GameTest(maxTicks = 60)
    public void imbueRecipeMakesTippedArrowsThatApplyTheEffect(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Holder<Potion> draught = potion(helper, "frost_draught");
        List<ItemStack> grid = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            grid.add(i == 4 ? bottle(Items.LINGERING_POTION, draught) : new ItemStack(Items.ARROW));
        }
        CraftingInput input = CraftingInput.of(3, 3, grid);
        Optional<RecipeHolder<CraftingRecipe>> recipe = level.recipeAccess().getRecipeFor(RecipeType.CRAFTING, input, level);
        helper.assertTrue(recipe.isPresent(), "no crafting recipe for eight arrows around a lingering frost draught");
        helper.assertValueEqual(recipe.get().id().identifier(), Identifier.withDefaultNamespace("tipped_arrow"), "recipe");
        Recipe<CraftingInput> imbue = recipe.get().value();
        ItemStack arrows = imbue.assemble(input);
        helper.assertTrue(carries(arrows, Items.TIPPED_ARROW, draught), "crafted " + arrows + " " + arrows.get(DataComponents.POTION_CONTENTS));
        helper.assertValueEqual(arrows.getCount(), 8, "tipped arrows");
        Mob cow = cow(helper);
        Holder<MobEffect> frostbite = frostbite();
        Vec3 from = above(helper, 3.5);
        Arrow arrow = new Arrow(level, from.x, from.y, from.z, arrows.copyWithCount(1), null);
        arrow.shoot(0, -1, 0, 1.6f, 0);
        level.addFreshEntity(arrow);
        helper.succeedWhen(() -> {
            helper.assertTrue(cow.hasEffect(frostbite), "the arrow hit did not apply frostbite");
            arrow.discard();
        });
    }

    @GameTest
    public void passthroughPotionContentsNamesAProjectPotion(GameTestHelper helper) {
        Item flask = BuiltInRegistries.ITEM.getValue(id("potion_flask"));
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id("potion_flask")), "potion_flask not registered");
        PotionContents contents = new ItemStack(flask).get(DataComponents.POTION_CONTENTS);
        helper.assertTrue(contents != null && contents.is(potion(helper, "frost_draught")), "potion_contents: " + contents);
        List<String> problems = new ArrayList<>(MsmRuntime.report().errors());
        problems.addAll(MsmRuntime.report().warnings());
        helper.assertFalse(problems.stream().anyMatch(e -> e.contains("potion_flask.json")), "potion_flask problems: " + problems);
        helper.succeed();
    }

    /**
     * P6: vanilla's creative tabs walk the potion registry, so a registered potion appears as a potion, a splash and a
     * lingering potion and a tipped arrow. The tab contents are built here on the server the way the client builds them.
     */
    @GameTest
    public void creativeTabsListTheProjectPotions(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        CreativeModeTabs.tryRebuildTabContents(level.enabledFeatures(), false, level.registryAccess());
        for (String path : List.of("frost_draught", "long_frost_draught", "strong_frost_draught", "swift_step")) {
            Holder<Potion> p = potion(helper, path);
            for (Item item : List.of(Items.POTION, Items.SPLASH_POTION, Items.LINGERING_POTION, Items.TIPPED_ARROW)) {
                ItemStack stack = bottle(item, p);
                helper.assertTrue(CreativeModeTabs.tabs().stream().anyMatch((CreativeModeTab tab) -> tab.contains(stack)),
                        "no creative tab lists " + item + " of " + path);
            }
        }
        helper.succeed();
    }
}
