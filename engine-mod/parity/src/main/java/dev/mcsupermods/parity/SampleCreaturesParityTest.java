package dev.mcsupermods.parity;

import java.util.List;
import java.util.Set;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.PlayerRideableJumping;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.WaterBoundPathNavigation;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-creatures} (namespace {@code msm_sample_creatures}, ADRs 0070 and 0071),
 * against vanilla and Fabric API only (ADR 0033 D5): the content jar's runtime bodies and the ejected project's classes
 * differ, so every check goes through vanilla types ({@code TamableAnimal}, {@code Monster}, {@code Enemy},
 * {@code RangedAttackMob}, {@code PlayerRideableJumping}), vanilla calls ({@code Player.interactOn}, the call the server's
 * interact packet makes), commands, saved data, packets ({@link ParityBossBars}) and the chat lines of the
 * {@code say/*} functions the mobs' events run ({@link ParityChat}). The players are mock players in the level in
 * creative mode, so no sample monster of a neighbouring test targets them. Run with
 * {@code --gametest-filter msm_parity_tests:sample_creatures_*}.
 *
 * <ul>
 *   <li>{@code pet}: tamed by a bone ({@code chance} 1, {@code tamed_health} 20), sits and stands at its owner's empty
 *       hand, breeds on cooked beef only once tamed, and two tamed pets make one owned baby at {@code baby_scale} 0.5.</li>
 *   <li>{@code mount}: a saddle from the hand equips it; an empty hand mounts it; the saddled mount obeys its rider.</li>
 *   <li>{@code glider}: flies (flying navigation, no gravity) and throws the project's {@code spark} at a zombie.</li>
 *   <li>{@code fish}: swims (water-bound navigation) and keeps the variant {@code /summon} gives it through saving.</li>
 *   <li>{@code archer}: a ranged monster whose arrow hits.</li>
 *   <li>{@code boss}: a melee and ranged monster whose boss bar reaches a listening player and follows its health.</li>
 * </ul>
 */
public class SampleCreaturesParityTest {
    static {
        ParityChat.register();
    }

    private static final String NAMESPACE = "msm_sample_creatures";
    private static final String ARENA = "msm_parity_tests:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);

    private static final String TAMED = "The pet is tamed.";
    private static final String BRED = "A pet baby is born.";
    private static final String MOUNTED = "The mount is ridden.";
    private static final String GLIDER_SHOT = "The glider throws a spark.";
    private static final String SPARK_HIT = "The spark hits.";
    private static final String ARCHER_SHOT = "The archer shoots.";
    private static final String BOSS_SHOT = "The boss throws a snowball.";
    private static final String BOSS_DEFEATED = "The boss is defeated.";
    private static final String BAR_NAME = "Parity Boss";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    @SuppressWarnings("unchecked")
    private static <T extends Mob> EntityType<T> type(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id(path)), "entity type " + id(path) + " is not registered");
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static void assertNear(GameTestHelper helper, double actual, double expected, String what) {
        helper.assertTrue(Math.abs(actual - expected) < 1e-4, what + ": expected " + expected + ", got " + actual);
    }

    /** A creative player in the level at {@code pos} (relative): vanilla's interact path needs a {@code ServerPlayer}. */
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, BlockPos pos) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.CREATIVE);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(pos)));
        return player;
    }

    private static void leave(GameTestHelper helper, ServerPlayer player) {
        player.stopRiding();
        helper.getLevel().getServer().getPlayerList().remove(player);
    }

    /** A right click on {@code mob} holding {@code held} (an empty stack for an empty hand). */
    private static void use(ServerPlayer player, Mob mob, ItemStack held) {
        player.setItemInHand(InteractionHand.MAIN_HAND, held);
        player.interactOn(mob, InteractionHand.MAIN_HAND, mob.position());
    }

    /** Runs {@code /summon} of a sample creature at {@code pos} (relative) with {@code nbt} and finds it by {@code tag}. */
    private static Mob summon(GameTestHelper helper, String path, BlockPos pos, String nbt, String tag) {
        ServerLevel level = helper.getLevel();
        Vec3 at = helper.absoluteVec(Vec3.atBottomCenterOf(pos));
        CommandSourceStack source = level.getServer().createCommandSourceStack().withLevel(level).withPosition(at).withSuppressedOutput();
        level.getServer().getCommands().performPrefixedCommand(source, "summon " + id(path) + " ~ ~ ~ " + nbt);
        EntityType<Mob> type = type(helper, path);
        Mob mob = helper.getEntities(type).stream().filter(m -> m.entityTags().contains(tag)).findFirst().orElse(null);
        helper.assertTrue(mob != null, "/summon " + id(path) + " " + nbt + " made no mob");
        return mob;
    }

    private static void assertSaid(GameTestHelper helper, int mark, String line, String what) {
        List<String> said = ParityChat.since(mark);
        helper.assertTrue(said.contains(line), what + ": no chat line '" + line + "'; said " + said);
    }

    // Registration

    @GameTest
    public void creaturesRegisterWithTheirBodies(GameTestHelper helper) {
        record Expect(String path, MobCategory category, float width, float height) {}
        for (Expect e : List.of(
                new Expect("pet", MobCategory.CREATURE, 0.6f, 0.85f),
                new Expect("mount", MobCategory.CREATURE, 1.3f, 1.5f),
                new Expect("glider", MobCategory.CREATURE, 0.8f, 0.8f),
                new Expect("fish", MobCategory.WATER_AMBIENT, 0.5f, 0.4f),
                new Expect("archer", MobCategory.MONSTER, 0.6f, 1.95f),
                new Expect("boss", MobCategory.MONSTER, 0.9f, 2.95f))) {
            EntityType<Mob> type = type(helper, e.path());
            helper.assertValueEqual(type.getCategory(), e.category(), e.path() + " category");
            helper.assertValueEqual(type.getWidth(), e.width(), e.path() + " width");
            helper.assertValueEqual(type.getHeight(), e.height(), e.path() + " height");
            helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(e.path() + "_spawn_egg")), e.path() + " has no spawn egg");
        }
        Mob pet = helper.spawnWithNoFreeWill(type(helper, "pet"), MID);
        helper.assertTrue(pet instanceof TamableAnimal, "pet is not a TamableAnimal: " + pet.getClass());
        Mob mount = helper.spawnWithNoFreeWill(type(helper, "mount"), MID.west(2));
        helper.assertTrue(mount instanceof TamableAnimal, "mount is not a TamableAnimal: " + mount.getClass());
        helper.assertTrue(mount instanceof PlayerRideableJumping, "mount is not PlayerRideableJumping: " + mount.getClass());
        Mob glider = helper.spawnWithNoFreeWill(type(helper, "glider"), MID.east(2));
        helper.assertTrue(glider instanceof PathfinderMob && glider instanceof RangedAttackMob, "glider is not a ranged PathfinderMob: " + glider.getClass());
        helper.assertFalse(glider instanceof Enemy, "glider is an Enemy");
        Mob fish = helper.spawnWithNoFreeWill(type(helper, "fish"), MID.north(2));
        helper.assertTrue(fish instanceof PathfinderMob, "fish is not a PathfinderMob: " + fish.getClass());
        helper.assertFalse(fish instanceof Enemy, "fish is an Enemy");
        for (String path : List.of("archer", "boss")) {
            Mob monster = helper.spawnWithNoFreeWill(type(helper, path), MID.south(2));
            helper.assertTrue(monster instanceof Monster && monster instanceof Enemy, path + " is not a Monster and Enemy: " + monster.getClass());
            helper.assertTrue(monster instanceof RangedAttackMob, path + " is not a RangedAttackMob: " + monster.getClass());
            monster.discard();
        }
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id("spark")), "the spark item is not registered");
        helper.succeed();
    }

    // Taming and breeding (ADR 0071 D1, D2; tame before breed)

    /** A bone tames the wild pet for the clicking player (chance 1), raises it to tamed_health 20, sits it and says on_tame's line. */
    @GameTest
    public void boneTamesThePetAndTheOwnerTogglesSitting(GameTestHelper helper) {
        TamableAnimal pet = helper.spawnWithNoFreeWill(type(helper, "pet"), MID);
        ServerPlayer player = player(helper, MID.east());
        try {
            helper.assertFalse(pet.isTame(), "a fresh pet is tame");
            assertNear(helper, pet.getMaxHealth(), 10.0, "wild max health");
            int mark = ParityChat.mark();
            use(player, pet, new ItemStack(Items.BONE));
            helper.assertTrue(pet.isTame(), "the bone did not tame the pet");
            helper.assertTrue(pet.isOwnedBy(player), "the pet's owner is not the player: " + pet.getOwner());
            assertNear(helper, pet.getMaxHealth(), 20.0, "tamed_health");
            assertNear(helper, pet.getHealth(), 20.0, "health after taming");
            helper.assertTrue(pet.isOrderedToSit(), "a freshly tamed pet does not sit");
            assertSaid(helper, mark, TAMED, "on_tame");
            use(player, pet, ItemStack.EMPTY);
            helper.assertFalse(pet.isOrderedToSit(), "the owner's empty hand did not stand the pet up");
            use(player, pet, ItemStack.EMPTY);
            helper.assertTrue(pet.isOrderedToSit(), "the owner's empty hand did not sit the pet down");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    /** A wild pet takes no breeding food (as a wolf): cooked beef starts no love mode until a bone tamed it. */
    @GameTest
    public void wildPetIgnoresBeefUntilTamed(GameTestHelper helper) {
        TamableAnimal pet = helper.spawnWithNoFreeWill(type(helper, "pet"), MID);
        ServerPlayer player = player(helper, MID.east());
        try {
            helper.assertFalse(pet.isFood(new ItemStack(Items.COOKED_BEEF)), "cooked beef is food for a wild pet");
            use(player, pet, new ItemStack(Items.COOKED_BEEF));
            helper.assertFalse(pet.isInLove(), "cooked beef put a wild pet in love");
            helper.assertFalse(pet.isTame(), "cooked beef tamed the pet");
            use(player, pet, new ItemStack(Items.BONE));
            helper.assertTrue(pet.isTame(), "the bone did not tame the pet");
            helper.assertTrue(pet.isFood(new ItemStack(Items.COOKED_BEEF)), "cooked beef is not food for a tamed pet");
            helper.assertFalse(pet.isFood(new ItemStack(Items.WHEAT)), "wheat is food for the pet");
            use(player, pet, new ItemStack(Items.COOKED_BEEF));
            helper.assertTrue(pet.isInLove(), "cooked beef did not put the tamed pet in love");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    /** Two tamed pets fed cooked beef make exactly one baby: at baby_scale 0.5, owned by their owner, announced by on_breed. */
    @GameTest(structure = ARENA, maxTicks = 300)
    public void twoTamedPetsMakeOneOwnedBaby(GameTestHelper helper) {
        EntityType<TamableAnimal> type = type(helper, "pet");
        TamableAnimal a = helper.spawn(type, new BlockPos(4, 1, 5));
        TamableAnimal b = helper.spawn(type, new BlockPos(6, 1, 5));
        ServerPlayer player = player(helper, new BlockPos(5, 1, 2));
        int mark = ParityChat.mark();
        for (TamableAnimal pet : List.of(a, b)) {
            use(player, pet, new ItemStack(Items.BONE));
            use(player, pet, ItemStack.EMPTY); // stand up: a sitting pet does not walk to its partner
            helper.assertTrue(pet.isTame() && !pet.isOrderedToSit(), "the pet is not tamed and standing");
            use(player, pet, new ItemStack(Items.COOKED_BEEF));
            helper.assertTrue(pet.isInLove(), "cooked beef did not put a tamed pet in love");
        }
        helper.succeedWhen(() -> {
            List<TamableAnimal> babies = helper.getEntities(type).stream().filter(TamableAnimal::isBaby).toList();
            helper.assertValueEqual(babies.size(), 1, "babies");
            TamableAnimal baby = babies.getFirst();
            assertNear(helper, baby.getAgeScale(), 0.5, "the baby's age scale (baby_scale)");
            assertNear(helper, baby.getBbWidth(), 0.6 * 0.5, "the baby's hitbox width");
            helper.assertTrue(baby.isTame() && baby.isOwnedBy(player), "the baby is not its parents' owner's");
            helper.assertFalse(a.isInLove() || b.isInLove(), "a parent is still in love");
            assertSaid(helper, mark, BRED, "on_breed");
            helper.assertValueEqual(helper.getEntities(type).size(), 3, "pets after breeding");
            leave(helper, player);
        });
    }

    // Riding (ADR 0071 D3)

    /** A saddle from the hand equips the mount; an empty hand then mounts it, on_mount speaks, and the rider controls it. */
    @GameTest
    public void saddleThenEmptyHandRidesTheMount(GameTestHelper helper) {
        Mob mount = helper.spawnWithNoFreeWill(type(helper, "mount"), MID);
        ServerPlayer player = player(helper, MID.east(2));
        try {
            PlayerRideableJumping jumping = (PlayerRideableJumping) mount;
            helper.assertFalse(mount.isSaddled(), "a fresh mount is saddled");
            helper.assertFalse(jumping.canJump(), "an unsaddled mount offers the jump bar");
            use(player, mount, new ItemStack(Items.SADDLE));
            helper.assertTrue(mount.isSaddled(), "the saddle did not equip");
            helper.assertFalse(player.isPassenger(), "saddling also mounted");
            helper.assertTrue(jumping.canJump(), "a saddled mount offers no jump bar");
            int mark = ParityChat.mark();
            use(player, mount, ItemStack.EMPTY);
            helper.assertTrue(player.getVehicle() == mount, "the empty hand did not mount: vehicle " + player.getVehicle());
            helper.assertTrue(mount.getControllingPassenger() == player, "the rider does not control the saddled mount: "
                    + mount.getControllingPassenger());
            assertSaid(helper, mark, MOUNTED, "on_mount");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    /** Without a saddle the rider sits but does not steer (the pig's rule). */
    @GameTest
    public void unsaddledMountCarriesButIsNotSteered(GameTestHelper helper) {
        Mob mount = helper.spawnWithNoFreeWill(type(helper, "mount"), MID);
        ServerPlayer player = player(helper, MID.east(2));
        try {
            use(player, mount, ItemStack.EMPTY);
            helper.assertTrue(player.getVehicle() == mount, "the empty hand did not mount: vehicle " + player.getVehicle());
            helper.assertTrue(mount.getControllingPassenger() == null, "an unsaddled mount obeys " + mount.getControllingPassenger());
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    // Movement (ADR 0070 D3)

    @GameTest
    public void gliderFliesAndFishSwim(GameTestHelper helper) {
        Mob glider = helper.spawn(type(helper, "glider"), MID.above());
        helper.assertTrue(glider.getNavigation() instanceof FlyingPathNavigation, "glider navigation: " + glider.getNavigation());
        helper.assertTrue(glider.isNoGravity(), "the glider has gravity");
        Mob fish = helper.spawnWithNoFreeWill(type(helper, "fish"), MID);
        helper.assertTrue(fish.getNavigation() instanceof WaterBoundPathNavigation, "fish navigation: " + fish.getNavigation());
        helper.assertTrue(fish.canBreatheUnderwater(), "the fish cannot breathe under water");
        helper.assertFalse(fish.isPushedByFluid(), "the fish is pushed by currents");
        helper.succeed();
    }

    // Ranged attacks (ADR 0070 D5)

    /** The archer's arrow hits a pig it targets; on_shoot says its line. */
    @GameTest(structure = ARENA, maxTicks = 200)
    public void archerArrowHits(GameTestHelper helper) {
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(8, 1, 5));
        Mob archer = helper.spawn(type(helper, "archer"), new BlockPos(2, 1, 5));
        int mark = ParityChat.mark();
        float full = pig.getHealth();
        DamageSource[] hit = {null};
        helper.onEachTick(() -> {
            if (pig.isAlive() && archer.getTarget() != pig) {
                archer.setTarget(pig);
            }
            if (hit[0] == null && pig.getHealth() < full) {
                hit[0] = pig.getLastDamageSource();
            }
        });
        helper.succeedWhen(() -> {
            helper.assertTrue(hit[0] != null, "the pig has not been hit");
            helper.assertTrue(hit[0].is(DamageTypes.ARROW) && hit[0].getEntity() == archer, "the pig was not hit by the archer's arrow: " + hit[0]);
            assertSaid(helper, mark, ARCHER_SHOT, "the archer's on_shoot");
        });
    }

    /** The glider throws the project's spark at a zombie (its target type); the spark's on_hit_entity speaks. */
    @GameTest(structure = ARENA, maxTicks = 300)
    public void gliderSparkHitsZombie(GameTestHelper helper) {
        Mob zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, new BlockPos(7, 1, 5));
        Mob glider = helper.spawn(type(helper, "glider"), new BlockPos(3, 2, 5));
        int mark = ParityChat.mark();
        helper.onEachTick(() -> {
            if (zombie.isAlive() && glider.getTarget() != zombie) {
                glider.setTarget(zombie);
            }
        });
        helper.succeedWhen(() -> {
            assertSaid(helper, mark, GLIDER_SHOT, "the glider's on_shoot");
            assertSaid(helper, mark, SPARK_HIT, "the spark's on_hit_entity");
            helper.assertTrue(zombie.getHealth() < zombie.getMaxHealth() || !zombie.isAlive(), "the spark did not hurt the zombie");
        });
    }

    /**
     * The boss throws snowballs at its target. Its melee goal comes first while it can walk to the target, so the boss
     * floats ({@code NoGravity}, off the ground: a ground mob makes no path there) and the ranged goal runs.
     */
    @GameTest(structure = ARENA, maxTicks = 200)
    public void bossThrowsSnowballs(GameTestHelper helper) {
        Mob golem = helper.spawnWithNoFreeWill(EntityTypes.IRON_GOLEM, new BlockPos(8, 1, 5));
        Mob boss = helper.spawn(type(helper, "boss"), new BlockPos(2, 1, 5));
        boss.setNoGravity(true);
        boss.snapTo(boss.getX(), boss.getY() + 0.3, boss.getZ());
        int mark = ParityChat.mark();
        helper.onEachTick(() -> {
            if (golem.isAlive() && boss.getTarget() != golem) {
                boss.setTarget(golem);
            }
        });
        helper.succeedWhen(() -> assertSaid(helper, mark, BOSS_SHOT, "the boss's on_shoot"));
    }

    // Variants (ADR 0071 D4)

    /** {@code /summon} with {@code Variant} picks that variant; it survives saving and loading. A spawn without saved data picks one of the two. */
    @GameTest
    public void summonedVariantSurvivesSaveAndLoad(GameTestHelper helper) {
        EntityType<Mob> type = type(helper, "fish");
        ServerLevel level = helper.getLevel();
        Mob orange = summon(helper, "fish", MID, "{Variant:\"orange\",NoAI:1b,Tags:[\"msm_parity_orange\"]}", "msm_parity_orange");
        CompoundTag saved = save(level, orange);
        helper.assertValueEqual(saved.getStringOr("Variant", "none"), "orange", "saved Variant");
        Mob copy = type.create(level, EntitySpawnReason.LOAD);
        helper.assertTrue(copy != null, "no copy");
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), saved));
        helper.assertValueEqual(save(level, copy).getStringOr("Variant", "none"), "orange", "Variant of the loaded copy");
        copy.discard();
        // A spawn without saved data picks one of the variants (random, weights 2 and 1).
        Mob spawned = type.spawn(level, helper.absolutePos(MID), EntitySpawnReason.SPAWN_ITEM_USE);
        helper.assertTrue(spawned != null, "no fish spawned");
        String picked = save(level, spawned).getStringOr("Variant", "none");
        helper.assertTrue(Set.of("blue", "orange").contains(picked), "picked variant: " + picked);
        orange.discard();
        spawned.discard();
        helper.succeed();
    }

    private static CompoundTag save(ServerLevel level, Mob mob) {
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        mob.saveWithoutId(out);
        return out.buildResult();
    }

    // Boss bars (ADR 0071 D5)

    /**
     * A tracking player gets the boss bar (red, notched_10, sky darkened); its progress follows the boss's health; death
     * removes it, says on_death's line and drops the loot table's nether star.
     */
    @GameTest(structure = ARENA, maxTicks = 300)
    public void bossBarFollowsHealthAndDeathRemovesIt(GameTestHelper helper) {
        // A name of its own: the boss of a neighbouring test is in tracking range too.
        Mob boss = summon(helper, "boss", MID, "{CustomName:\"" + BAR_NAME + "\",Tags:[\"msm_parity_bar\"]}", "msm_parity_bar");
        ParityBossBars bars = new ParityBossBars(helper, MID.east(3), BAR_NAME);
        int[] mark = {0};
        helper.startSequence()
                .thenWaitUntil(() -> helper.assertTrue(bars.saw("add "), "no add packet yet: " + bars.events()))
                .thenExecute(() -> {
                    helper.assertValueEqual(bars.events().getFirst(),
                            "add " + BAR_NAME + " 1.0 red notched_10 darken true music false fog false", "add packet");
                    helper.assertTrue(boss.requiresCustomPersistence(), "a boss despawns");
                    boss.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 50.0f);
                })
                .thenWaitUntil(() -> helper.assertTrue(bars.saw("progress 0.75"), "no progress 0.75: " + bars.events()))
                .thenExecute(() -> {
                    mark[0] = ParityChat.mark();
                    boss.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 1000.0f);
                })
                .thenWaitUntil(() -> helper.assertTrue(bars.saw("remove"), "no remove packet after death: " + bars.events()))
                .thenExecute(() -> {
                    assertSaid(helper, mark[0], BOSS_DEFEATED, "the boss's on_death");
                    bars.close();
                })
                .thenWaitUntil(() -> {
                    List<ItemEntity> drops = helper.getEntities(EntityTypes.ITEM, MID, 4.0);
                    helper.assertTrue(drops.stream().anyMatch(i -> i.getItem().is(Items.NETHER_STAR)), "no nether star dropped: " + drops);
                })
                .thenSucceed();
    }
}
