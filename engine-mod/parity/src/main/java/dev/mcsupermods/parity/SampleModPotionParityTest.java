package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.locale.Language;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.AreaEffectCloud;
import net.minecraft.world.entity.EntityTypes;
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
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.CraftingRecipe;
import net.minecraft.world.item.crafting.RecipeHolder;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BrewingStandBlockEntity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity of the sample mod's potion {@code msm_sample_mod:ruby_draught} (ADR 0063, B255), against vanilla and
 * Fabric API only: the potion of the {@code ruby_rush} effect, brewed from an awkward potion and a ruby, with its
 * {@code long_} (redstone) and {@code strong_} (glowstone dust) versions, splash and lingering bottles and tipped arrows.
 * The same tests pass on the content jar (the runtime registers the potions from {@code msm/msm_sample_mod/potion/})
 * and on the ejected jar ({@code ModPotions}); the brewing recipes and the names are data and lang files in both.
 *
 * <ul>
 *   <li>the three potions are registered with their effect, duration and level, and share one name;
 *   <li>the four item names translate to "Potion of Ruby Rush" and its splash, lingering and arrow forms (Fabric API's
 *       server translations read the jar's {@code en_us.json});
 *   <li>every one of the fifteen brewing steps is found by the recipe manager and gives the expected bottle and potion;
 *   <li>a real brewing stand brews three potions from awkward potions, a ruby and blaze powder;
 *   <li>drinking each version gives its effect, and {@code ruby_rush}'s {@code msm:on_start} says its line;
 *   <li>a splash potion and a lingering cloud give the effect to a cow; vanilla's {@code crafting_imbue} recipe makes eight
 *       tipped arrows from a lingering potion, and one arrow's hit gives the effect;
 *   <li>the creative tabs list every version as a potion, a splash and a lingering potion and a tipped arrow.
 * </ul>
 *
 * <p>Run with {@code --gametest-filter msm_parity_tests:sample_mod_*} (the class name puts it in the sample mod's run).
 */
public class SampleModPotionParityTest {
    private static final String NAMESPACE = "msm_sample_mod";
    private static final BlockPos AT = new BlockPos(2, 1, 2);
    private static final String NAME = "msm_sample_mod.ruby_draught";
    private static final String RUSH = "The ruby rush begins.";

    static {
        ParityChat.register();
    }

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    private static Holder<Potion> potion(GameTestHelper helper, String path) {
        Holder<Potion> holder = BuiltInRegistries.POTION.get(id(path)).<Holder<Potion>>map(h -> h).orElse(null);
        helper.assertTrue(holder != null, "potion " + id(path) + " is not registered");
        return holder;
    }

    private static Holder<MobEffect> rush(GameTestHelper helper) {
        Holder<MobEffect> holder = BuiltInRegistries.MOB_EFFECT.get(id("ruby_rush")).<Holder<MobEffect>>map(h -> h).orElse(null);
        helper.assertTrue(holder != null, "effect " + id("ruby_rush") + " is not registered");
        return holder;
    }

    private static Item ruby(GameTestHelper helper) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id("ruby")), "item " + id("ruby") + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id("ruby"));
    }

    private static ItemStack bottle(Item item, Holder<Potion> potion) {
        return PotionContents.createItemStack(item, potion);
    }

    private static boolean carries(ItemStack stack, Item item, Holder<Potion> potion) {
        PotionContents contents = stack.get(DataComponents.POTION_CONTENTS);
        return stack.is(item) && contents != null && contents.is(potion);
    }

    private static void assertEffect(GameTestHelper helper, MobEffectInstance e, Holder<MobEffect> effect, int duration,
            int amplifier, String what) {
        helper.assertTrue(e != null, what + ": no effect");
        helper.assertTrue(e.is(effect), what + ": effect " + e.getEffect());
        helper.assertValueEqual(e.getDuration(), duration, what + ": duration");
        helper.assertValueEqual(e.getAmplifier(), amplifier, what + ": amplifier");
    }

    @GameTest
    public void potionsAreRegisteredWithTheirEffects(GameTestHelper helper) {
        Holder<MobEffect> rush = rush(helper);
        record Version(String path, int duration, int amplifier) {}
        for (Version v : List.of(new Version("ruby_draught", 3600, 0), new Version("long_ruby_draught", 9600, 0),
                new Version("strong_ruby_draught", 1800, 1))) {
            Potion p = potion(helper, v.path()).value();
            helper.assertValueEqual(p.getEffects().size(), 1, v.path() + " effects");
            assertEffect(helper, p.getEffects().getFirst(), rush, v.duration(), v.amplifier(), v.path());
            helper.assertValueEqual(p.name(), NAME, v.path() + " name");
        }
        helper.succeed();
    }

    @GameTest
    public void itemNamesTranslate(GameTestHelper helper) {
        Language language = Language.getInstance();
        record Name(Item item, String text) {}
        for (Name n : List.of(new Name(Items.POTION, "Potion of Ruby Rush"), new Name(Items.SPLASH_POTION, "Splash Potion of Ruby Rush"),
                new Name(Items.LINGERING_POTION, "Lingering Potion of Ruby Rush"), new Name(Items.TIPPED_ARROW, "Arrow of Ruby Rush"))) {
            String key = n.item().getDescriptionId() + ".effect." + NAME;
            for (String path : List.of("ruby_draught", "long_ruby_draught", "strong_ruby_draught")) {
                ItemStack stack = bottle(n.item(), potion(helper, path));
                Component name = stack.getItem().getName(stack);
                helper.assertTrue(name.getContents() instanceof TranslatableContents t && t.getKey().equals(key),
                        "name of " + path + " as " + n.item() + ": " + name + ", expected the key " + key);
            }
            helper.assertTrue(language.has(key), "no translation for " + key);
            helper.assertValueEqual(language.getOrDefault(key), n.text(), key);
        }
        helper.succeed();
    }

    /** The output of the brewing recipe for {@code input} and {@code reagent}, or empty. */
    private static Optional<ItemStack> brew(GameTestHelper helper, ItemStack input, Item reagent) {
        ServerLevel level = helper.getLevel();
        BrewingInput in = new BrewingInput(input, new ItemStack(reagent));
        return level.recipeAccess().getRecipeFor(RecipeType.BREWING, in, level).map(h -> h.value().assemble(in));
    }

    /** The fifteen brewing steps of ADR 0063 D3: base, long and strong per bottle; gunpowder and dragon's breath per entry. */
    @GameTest
    public void everyBrewingStepIsFound(GameTestHelper helper) {
        Holder<Potion> draught = potion(helper, "ruby_draught");
        Holder<Potion> longer = potion(helper, "long_ruby_draught");
        Holder<Potion> stronger = potion(helper, "strong_ruby_draught");
        Item ruby = ruby(helper);
        record Step(String what, ItemStack input, Item reagent, Item output, Holder<Potion> potion) {}
        List<Step> steps = new ArrayList<>();
        for (Item b : List.of(Items.POTION, Items.SPLASH_POTION, Items.LINGERING_POTION)) {
            steps.add(new Step(b + " base", bottle(b, Potions.AWKWARD), ruby, b, draught));
            steps.add(new Step(b + " long", bottle(b, draught), Items.REDSTONE, b, longer));
            steps.add(new Step(b + " strong", bottle(b, draught), Items.GLOWSTONE_DUST, b, stronger));
        }
        for (Holder<Potion> p : List.of(draught, longer, stronger)) {
            steps.add(new Step(p.getRegisteredName() + " splash", bottle(Items.POTION, p), Items.GUNPOWDER, Items.SPLASH_POTION, p));
            steps.add(new Step(p.getRegisteredName() + " lingering", bottle(Items.SPLASH_POTION, p), Items.DRAGON_BREATH,
                    Items.LINGERING_POTION, p));
        }
        helper.assertValueEqual(steps.size(), 15, "brewing steps");
        for (Step step : steps) {
            Optional<ItemStack> out = brew(helper, step.input(), step.reagent());
            helper.assertTrue(out.isPresent(), step.what() + ": no brewing recipe found");
            helper.assertTrue(carries(out.get(), step.output(), step.potion()),
                    step.what() + ": brewed " + out.get() + " " + out.get().get(DataComponents.POTION_CONTENTS));
        }
        // Control: the ruby does nothing to a water bottle.
        helper.assertTrue(brew(helper, bottle(Items.POTION, Potions.WATER), ruby).isEmpty(), "a ruby brews a water bottle");
        helper.succeed();
    }

    @GameTest(maxTicks = 600)
    public void brewingStandBrewsTheRubyDraught(GameTestHelper helper) {
        Holder<Potion> draught = potion(helper, "ruby_draught");
        helper.setBlock(AT, Blocks.BREWING_STAND);
        BrewingStandBlockEntity stand = helper.getBlockEntity(AT, BrewingStandBlockEntity.class);
        for (int slot = 0; slot < 3; slot++) {
            stand.setItem(slot, bottle(Items.POTION, Potions.AWKWARD));
        }
        stand.setItem(3, new ItemStack(ruby(helper)));
        stand.setItem(4, new ItemStack(Items.BLAZE_POWDER));
        helper.succeedWhen(() -> {
            for (int slot = 0; slot < 3; slot++) {
                ItemStack out = stand.getItem(slot);
                helper.assertTrue(carries(out, Items.POTION, draught), "slot " + slot + ": " + out + " " + out.get(DataComponents.POTION_CONTENTS));
            }
            helper.assertTrue(stand.getItem(3).isEmpty(), "the ruby was not used up");
        });
    }

    @GameTest
    public void drinkingEachVersionGivesItsEffect(GameTestHelper helper) {
        Holder<MobEffect> rush = rush(helper);
        record Version(String path, int duration, int amplifier) {}
        for (Version v : List.of(new Version("ruby_draught", 3600, 0), new Version("long_ruby_draught", 9600, 0),
                new Version("strong_ruby_draught", 1800, 1))) {
            Player player = helper.makeMockPlayer(GameType.SURVIVAL);
            int mark = ParityChat.mark();
            bottle(Items.POTION, potion(helper, v.path())).finishUsingItem(helper.getLevel(), player);
            assertEffect(helper, player.getEffect(rush), rush, v.duration(), v.amplifier(), "after drinking " + v.path());
            helper.assertTrue(ParityChat.since(mark).contains(RUSH), "msm:on_start did not say its line: " + ParityChat.since(mark));
            player.discard();
        }
        helper.succeed();
    }

    private static Mob cow(GameTestHelper helper) {
        return helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
    }

    /** The point {@code height} blocks above {@link #AT}, absolute. */
    private static Vec3 above(GameTestHelper helper, double height) {
        return helper.absoluteVec(Vec3.atBottomCenterOf(AT).add(0, height, 0));
    }

    @GameTest(maxTicks = 60)
    public void splashPotionGivesTheEffectToANearbyCow(GameTestHelper helper) {
        Mob cow = cow(helper);
        Holder<MobEffect> rush = rush(helper);
        Vec3 from = above(helper, 3);
        ThrownSplashPotion thrown = new ThrownSplashPotion(helper.getLevel(), from.x, from.y, from.z,
                bottle(Items.SPLASH_POTION, potion(helper, "strong_ruby_draught")));
        thrown.setDeltaMovement(0, -0.5, 0);
        helper.getLevel().addFreshEntity(thrown);
        helper.succeedWhen(() -> {
            helper.assertTrue(thrown.isRemoved(), "the splash potion has not broken yet");
            helper.assertTrue(cow.hasEffect(rush), "the cow has no ruby_rush");
            helper.assertValueEqual(cow.getEffect(rush).getAmplifier(), 1, "strong splash amplifier");
        });
    }

    @GameTest(maxTicks = 100)
    public void lingeringCloudGivesTheEffect(GameTestHelper helper) {
        Mob cow = cow(helper);
        Holder<Potion> draught = potion(helper, "ruby_draught");
        Holder<MobEffect> rush = rush(helper);
        Vec3 from = above(helper, 3);
        ThrownLingeringPotion thrown = new ThrownLingeringPotion(helper.getLevel(), from.x, from.y, from.z,
                bottle(Items.LINGERING_POTION, draught));
        thrown.setDeltaMovement(0, -0.5, 0);
        helper.getLevel().addFreshEntity(thrown);
        helper.succeedWhen(() -> {
            List<AreaEffectCloud> clouds = helper.getLevel().getEntitiesOfClass(AreaEffectCloud.class, new AABB(cow.blockPosition()).inflate(4));
            helper.assertTrue(!clouds.isEmpty(), "no area effect cloud");
            PotionContents contents = clouds.getFirst().get(DataComponents.POTION_CONTENTS);
            helper.assertTrue(contents != null && contents.is(draught), "the cloud does not carry ruby_draught: " + contents);
            helper.assertTrue(cow.hasEffect(rush), "the cow in the cloud has no ruby_rush");
            clouds.forEach(AreaEffectCloud::discard);
        });
    }

    @GameTest(maxTicks = 60)
    public void tippedArrowsAreCraftedAndApplyTheEffect(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Holder<Potion> longer = potion(helper, "long_ruby_draught");
        List<ItemStack> grid = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            grid.add(i == 4 ? bottle(Items.LINGERING_POTION, longer) : new ItemStack(Items.ARROW));
        }
        CraftingInput input = CraftingInput.of(3, 3, grid);
        Optional<RecipeHolder<CraftingRecipe>> recipe = level.recipeAccess().getRecipeFor(RecipeType.CRAFTING, input, level);
        helper.assertTrue(recipe.isPresent(), "no crafting recipe for eight arrows around a lingering long ruby draught");
        ItemStack arrows = recipe.get().value().assemble(input);
        helper.assertTrue(carries(arrows, Items.TIPPED_ARROW, longer), "crafted " + arrows + " " + arrows.get(DataComponents.POTION_CONTENTS));
        helper.assertValueEqual(arrows.getCount(), 8, "tipped arrows");
        Mob cow = cow(helper);
        Holder<MobEffect> rush = rush(helper);
        Vec3 from = above(helper, 3.5);
        Arrow arrow = new Arrow(level, from.x, from.y, from.z, arrows.copyWithCount(1), null);
        arrow.shoot(0, -1, 0, 1.6f, 0);
        level.addFreshEntity(arrow);
        helper.succeedWhen(() -> {
            helper.assertTrue(cow.hasEffect(rush), "the arrow hit did not apply ruby_rush");
            arrow.discard();
        });
    }

    @GameTest
    public void creativeTabsListEveryVersion(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        CreativeModeTabs.tryRebuildTabContents(level.enabledFeatures(), false, level.registryAccess());
        for (String path : List.of("ruby_draught", "long_ruby_draught", "strong_ruby_draught")) {
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
