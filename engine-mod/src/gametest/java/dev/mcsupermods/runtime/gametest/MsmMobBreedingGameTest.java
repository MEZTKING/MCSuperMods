package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmAnimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.goal.BreedGoal;
import net.minecraft.world.entity.ai.goal.FollowParentGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.WrappedGoal;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * Breeding and babies (ADR 0071 D2, B292) on {@code tb_farm} (wheat, {@code baby_scale} 0.4, {@code grow_up_ticks}
 * 1200, {@code on_breed}, and {@code msm:on_interact}, which must not swallow the food) and {@code tb_farm_other}
 * (another type with the same food). Interactions go through {@code Player.interactOn}. A tameable animal breeds only
 * once tamed, as wolves and cats do: {@code tb_tame_first} (tamed with a bone, bred with wheat, {@code tamed_health} 30,
 * like a wolf) and {@code tb_tame_same} (one food for both, like a cat).
 */
public class MsmMobBreedingGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);
    private static final double WIDTH = 0.6;
    private static final double HEIGHT = 0.9;
    private static final double BABY_SCALE = 0.4;

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static EntityType<MsmAnimal> type(String path) {
        return (EntityType<MsmAnimal>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, BlockPos pos) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(pos)));
        return player;
    }

    private static void leave(GameTestHelper helper, ServerPlayer player) {
        helper.getLevel().getServer().getPlayerList().remove(player);
    }

    private static void use(ServerPlayer player, MsmAnimal mob, ItemStack held) {
        player.setItemInHand(InteractionHand.MAIN_HAND, held);
        player.interactOn(mob, InteractionHand.MAIN_HAND, Vec3.ZERO);
    }

    private static void assertNear(GameTestHelper helper, double actual, double expected, String what) {
        helper.assertTrue(Math.abs(actual - expected) < 1e-4, what + ": expected " + expected + ", got " + actual);
    }

    private static void assertSize(GameTestHelper helper, MsmAnimal mob, double scale, String what) {
        assertNear(helper, mob.getAgeScale(), scale, what + " age scale");
        assertNear(helper, mob.getBbWidth(), WIDTH * scale, what + " hitbox width");
        assertNear(helper, mob.getBbHeight(), HEIGHT * scale, what + " hitbox height");
    }

    /** Records the events of one definition; other tests run at the same time. */
    private static final class Recorder implements EventListener, AutoCloseable {
        final List<EventContext> born = Collections.synchronizedList(new ArrayList<>());
        final List<Object> poked = Collections.synchronizedList(new ArrayList<>());
        private final List<MsmAnimal> parents;

        Recorder(List<MsmAnimal> parents) {
            this.parents = parents;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (event.getPath().equals("tb_born") && ctx.entity() instanceof MsmAnimal baby
                    && parents.stream().anyMatch(p -> p.distanceTo(baby) < 8.0 && p.level() == baby.level())) {
                born.add(ctx);
            } else if (event.getPath().equals("tb_poked") && parents.contains(ctx.entity())) {
                poked.add(ctx.entity());
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    @GameTest
    public void breedableAddsBreedTemptAndFollowParentGoals(GameTestHelper helper) {
        MsmAnimal mob = helper.spawn(type("tb_farm"), MID);
        List<Goal> goals = mob.getGoalSelector().getAvailableGoals().stream().map(WrappedGoal::getGoal).toList();
        helper.assertTrue(goals.stream().anyMatch(g -> g instanceof BreedGoal), "no BreedGoal: " + goals);
        helper.assertTrue(goals.stream().anyMatch(g -> g instanceof TemptGoal), "no TemptGoal: " + goals);
        helper.assertTrue(goals.stream().anyMatch(g -> g instanceof FollowParentGoal), "no FollowParentGoal: " + goals);
        helper.assertTrue(mob.isFood(new ItemStack(Items.WHEAT)), "wheat is not food");
        helper.assertFalse(mob.isFood(new ItemStack(Items.CARROT)), "a carrot is food");
        helper.succeed();
    }

    /** The food goes to love mode even though {@code msm:on_interact} answers other clicks (ADR 0071 D1 order). */
    @GameTest(structure = ARENA, maxTicks = 200)
    public void twoFedAdultsMakeOneScaledBaby(GameTestHelper helper) {
        MsmAnimal a = helper.spawn(type("tb_farm"), new BlockPos(4, 1, 5));
        MsmAnimal b = helper.spawn(type("tb_farm"), new BlockPos(6, 1, 5));
        ServerPlayer player = player(helper, new BlockPos(5, 1, 3));
        Recorder r = new Recorder(List.of(a, b));
        use(player, a, new ItemStack(Items.STICK));
        helper.assertValueEqual(r.poked.size(), 1, "on_interact for a stick");
        helper.assertFalse(a.isInLove(), "a stick put tb_farm in love");
        ItemStack wheat = new ItemStack(Items.WHEAT, 5);
        use(player, a, wheat);
        use(player, b, wheat);
        helper.assertTrue(a.isInLove() && b.isInLove(), "wheat did not put both in love");
        helper.assertValueEqual(wheat.getCount(), 3, "wheat after feeding two");
        helper.assertValueEqual(r.poked.size(), 1, "on_interact swallowed the food");
        assertSize(helper, a, 1.0, "adult");
        helper.succeedWhen(() -> {
            List<MsmAnimal> babies = helper.getEntities(type("tb_farm")).stream().filter(MsmAnimal::isBaby).toList();
            helper.assertValueEqual(babies.size(), 1, "babies");
            MsmAnimal baby = babies.getFirst();
            assertSize(helper, baby, BABY_SCALE, "baby");
            helper.assertTrue(baby.getAge() <= -1100 && baby.getAge() >= -1200, "grow_up_ticks 1200: the baby's age is " + baby.getAge());
            helper.assertValueEqual(r.born.size(), 1, "on_breed");
            helper.assertTrue(r.born.getFirst().entity() == baby, "on_breed self is not the baby");
            helper.assertTrue(r.born.getFirst().player() == player, "on_breed player is not the feeder");
            helper.assertFalse(a.isInLove() || b.isInLove(), "a parent is still in love");
            r.close();
            leave(helper, player);
        });
    }

    @GameTest
    public void babiesScaleAndGrowUp(GameTestHelper helper) {
        MsmAnimal baby = helper.spawnWithNoFreeWill(type("tb_farm"), MID);
        baby.setBaby(true);
        helper.assertTrue(baby.isBaby(), "setBaby(true) made no baby");
        assertSize(helper, baby, BABY_SCALE, "baby");
        ServerPlayer player = player(helper, MID.east());
        try {
            int before = baby.getAge();
            ItemStack wheat = new ItemStack(Items.WHEAT, 2);
            use(player, baby, wheat);
            helper.assertTrue(baby.getAge() > before, "feeding did not grow the baby: " + before + " -> " + baby.getAge());
            helper.assertValueEqual(wheat.getCount(), 1, "wheat after feeding a baby");
            helper.assertTrue(baby.isBaby(), "one wheat grew the baby up");
        } finally {
            leave(helper, player);
        }
        baby.ageUp(-baby.getAge() / 20 + 1);
        helper.assertFalse(baby.isBaby(), "ageUp did not make the baby an adult: age " + baby.getAge());
        assertSize(helper, baby, 1.0, "grown");
        MsmAnimal other = helper.spawnWithNoFreeWill(type("tb_farm_other"), MID.west());
        other.setBaby(true);
        assertNear(helper, other.getAgeScale(), 0.5, "default baby_scale");
        helper.succeed();
    }

    /** A bred baby takes a parent's variant (ADR 0071 D4 through {@code MobVariants.inheritFrom}): both parents spotted. */
    @GameTest(structure = ARENA, maxTicks = 200)
    public void babyTakesAParentsVariant(GameTestHelper helper) {
        MsmAnimal a = helper.spawn(type("tb_farm_spotted"), new BlockPos(4, 1, 5));
        MsmAnimal b = helper.spawn(type("tb_farm_spotted"), new BlockPos(6, 1, 5));
        a.driver().variants().setById("spotted");
        b.driver().variants().setById("spotted");
        ServerPlayer player = player(helper, new BlockPos(5, 1, 3));
        ItemStack wheat = new ItemStack(Items.WHEAT, 2);
        use(player, a, wheat);
        use(player, b, wheat);
        leave(helper, player);
        helper.succeedWhen(() -> {
            List<MsmAnimal> babies = helper.getEntities(type("tb_farm_spotted")).stream().filter(MsmAnimal::isBaby).toList();
            helper.assertValueEqual(babies.size(), 1, "babies");
            helper.assertValueEqual(babies.getFirst().driver().variants().id().orElse("none"), "spotted", "the baby's variant");
        });
    }

    /** Both types share the body class, which is all {@code Animal.canMate} compares; the runtime refuses the pair. */
    @GameTest(structure = ARENA, maxTicks = 200)
    public void twoTypesDoNotBreed(GameTestHelper helper) {
        MsmAnimal a = helper.spawn(type("tb_farm"), new BlockPos(4, 1, 5));
        MsmAnimal b = helper.spawn(type("tb_farm_other"), new BlockPos(6, 1, 5));
        ServerPlayer player = player(helper, new BlockPos(5, 1, 3));
        ItemStack wheat = new ItemStack(Items.WHEAT, 2);
        use(player, a, wheat);
        use(player, b, wheat);
        leave(helper, player);
        helper.assertTrue(a.isInLove() && b.isInLove(), "wheat did not put both in love");
        helper.runAfterDelay(150, () -> {
            helper.assertTrue(helper.getEntities(type("tb_farm")).stream().noneMatch(MsmAnimal::isBaby), "a tb_farm baby");
            helper.assertTrue(helper.getEntities(type("tb_farm_other")).stream().noneMatch(MsmAnimal::isBaby), "a tb_farm_other baby");
            helper.succeed();
        });
    }

    /** A wild wolf-like pet: wheat starts no love mode and is not used up; after the bone tames it, wheat does. */
    @GameTest
    public void wildPetIgnoresBreedingFoodUntilTamed(GameTestHelper helper) {
        MsmAnimal pet = helper.spawnWithNoFreeWill(type("tb_tame_first"), MID);
        ServerPlayer player = player(helper, MID.east());
        try {
            helper.assertFalse(pet.isFood(new ItemStack(Items.WHEAT)), "wheat is food for a wild pet");
            ItemStack wheat = new ItemStack(Items.WHEAT, 5);
            use(player, pet, wheat);
            helper.assertFalse(pet.isInLove(), "wheat put a wild pet in love");
            helper.assertValueEqual(wheat.getCount(), 5, "wheat after feeding a wild pet");
            use(player, pet, new ItemStack(Items.BONE));
            helper.assertTrue(pet.isTame() && pet.isOwnedBy(player), "the bone did not tame the pet");
            helper.assertTrue(pet.isFood(new ItemStack(Items.WHEAT)), "wheat is not food for a tamed pet");
            use(player, pet, wheat);
            helper.assertTrue(pet.isInLove(), "wheat did not put a tamed pet in love");
            helper.assertValueEqual(wheat.getCount(), 4, "wheat after feeding a tamed pet");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    /** A wild pup still grows when fed the breeding food (vanilla {@code Animal.mobInteract} on a wild wolf pup). */
    @GameTest
    public void wildPetBabyGrowsOnBreedingFood(GameTestHelper helper) {
        MsmAnimal baby = helper.spawnWithNoFreeWill(type("tb_tame_first"), MID);
        baby.setBaby(true);
        ServerPlayer player = player(helper, MID.east());
        try {
            int before = baby.getAge();
            ItemStack wheat = new ItemStack(Items.WHEAT, 2);
            use(player, baby, wheat);
            helper.assertTrue(baby.getAge() > before, "feeding did not grow the wild baby: " + before + " -> " + baby.getAge());
            helper.assertValueEqual(wheat.getCount(), 1, "wheat after feeding a wild baby");
            helper.assertFalse(baby.isTame(), "wheat tamed the baby");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    /** One food for both, like a cat's fish: on a wild pet it tames, on a tamed one at full health it starts love mode. */
    @GameTest
    public void sharedFoodTamesBeforeItBreeds(GameTestHelper helper) {
        MsmAnimal pet = helper.spawnWithNoFreeWill(type("tb_tame_same"), MID);
        ServerPlayer player = player(helper, MID.east());
        try {
            ItemStack cod = new ItemStack(Items.COD, 3);
            use(player, pet, cod);
            helper.assertTrue(pet.isTame() && pet.isOwnedBy(player), "cod did not tame the pet");
            helper.assertFalse(pet.isInLove(), "the taming cod also put the pet in love");
            helper.assertValueEqual(cod.getCount(), 2, "cod after taming");
            use(player, pet, cod);
            helper.assertTrue(pet.isInLove(), "cod did not put the tamed pet in love");
            helper.assertValueEqual(cod.getCount(), 1, "cod after feeding the tamed pet");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    /** Two wild pets in love (set directly, as {@code /data} could) never breed: the wolf's and cat's {@code canMate}. */
    @GameTest(structure = ARENA, maxTicks = 200)
    public void wildPetsInLoveDoNotBreed(GameTestHelper helper) {
        MsmAnimal a = helper.spawn(type("tb_tame_first"), new BlockPos(4, 1, 5));
        MsmAnimal b = helper.spawn(type("tb_tame_first"), new BlockPos(6, 1, 5));
        a.setInLove(null);
        b.setInLove(null);
        helper.runAfterDelay(150, () -> {
            helper.assertTrue(helper.getEntities(type("tb_tame_first")).stream().noneMatch(MsmAnimal::isBaby), "two wild pets bred");
            helper.succeed();
        });
    }

    /** Two tamed pets fed wheat breed; the baby belongs to their owner with {@code tamed_health} ({@code Wolf.getBreedOffspring}). */
    @GameTest(structure = ARENA, maxTicks = 200)
    public void tamedPetsMakeAnOwnedBaby(GameTestHelper helper) {
        MsmAnimal a = helper.spawn(type("tb_tame_first"), new BlockPos(4, 1, 5));
        MsmAnimal b = helper.spawn(type("tb_tame_first"), new BlockPos(6, 1, 5));
        ServerPlayer player = player(helper, new BlockPos(5, 1, 3));
        ItemStack bones = new ItemStack(Items.BONE, 2);
        use(player, a, bones);
        use(player, b, bones);
        helper.assertTrue(a.isTame() && b.isTame(), "the bones did not tame both pets");
        ItemStack wheat = new ItemStack(Items.WHEAT, 2);
        use(player, a, wheat);
        use(player, b, wheat);
        helper.assertTrue(a.isInLove() && b.isInLove(), "wheat did not put both tamed pets in love");
        helper.succeedWhen(() -> {
            List<MsmAnimal> babies = helper.getEntities(type("tb_tame_first")).stream().filter(MsmAnimal::isBaby).toList();
            helper.assertValueEqual(babies.size(), 1, "babies");
            MsmAnimal baby = babies.getFirst();
            helper.assertTrue(baby.isTame() && baby.isOwnedBy(player), "the baby is not the owner's");
            assertNear(helper, baby.getMaxHealth(), 30.0, "the baby's tamed_health");
            leave(helper, player);
        });
    }
}
