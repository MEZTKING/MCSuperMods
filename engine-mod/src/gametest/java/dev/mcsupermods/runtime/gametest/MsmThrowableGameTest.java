package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmThrowableItem;
import dev.mcsupermods.runtime.registry.MsmThrownItem;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.entity.DispenserBlockEntity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Throwables (ADR 0056, B203) on {@code msm/msm_test/item/}: the thrown entity {@code msm_runtime:thrown_item}, its
 * item, speed, owner and gravity, entity and block hits with their events, every {@code after_throw} mode, charging,
 * cooldown, {@code msm:on_use} together with a throw, and the dispenser.
 *
 * <p>Hits are made deterministic by placing a thrown entity right above its target and sending it straight down.
 */
public class MsmThrowableGameTest {
    private static final BlockPos AT = new BlockPos(1, 1, 1);
    /** A block in the test area that thrown items land on. */
    private static final BlockPos LANDING = new BlockPos(4, 1, 4);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    /** Records the events of one item definition (other tests run at the same time; {@code owner} tells them apart). */
    private static final class Recorder implements EventListener, AutoCloseable {
        /** {@code otherHealth}: the health of the other entity when the event fired, before its actions ran. */
        record Fired(String event, EventContext ctx, float otherHealth) {}

        final List<Fired> fired = Collections.synchronizedList(new ArrayList<>());
        private final Identifier owner;
        private final Player thrower;

        Recorder(Identifier owner, Player thrower) {
            this.owner = owner;
            this.thrower = thrower;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.equals(this.owner) && (thrower == null || ctx.player() == thrower)) {
                fired.add(new Fired(event.getPath(), ctx, ctx.other() == null ? -1 : ctx.other().getHealth()));
            }
        }

        List<Fired> of(String event) {
            synchronized (fired) {
                return fired.stream().filter(f -> f.event().equals(event)).toList();
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    private static Player thrower(GameTestHelper helper) {
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(AT)));
        return player;
    }

    /** The thrown items near {@code player} that carry {@code item}. */
    private static List<MsmThrownItem> thrown(GameTestHelper helper, Player player, Item item) {
        return helper.getLevel().getEntitiesOfClass(MsmThrownItem.class, new AABB(player.blockPosition()).inflate(6),
                e -> e.getItem().is(item) && e.getOwner() == player);
    }

    /** Puts a thrown item two blocks above {@code target} (relative) and sends it down. */
    private static void dropOnto(GameTestHelper helper, MsmThrownItem entity, Vec3 target) {
        Vec3 above = helper.absoluteVec(target.add(0, 2.5, 0));
        entity.snapTo(above.x, above.y, above.z);
        entity.setDeltaMovement(0, -0.8, 0);
    }

    @GameTest
    public void throwOnUseSpawnsTheThrownItem(GameTestHelper helper) {
        Player player = thrower(helper);
        ItemStack stack = new ItemStack(item("ruby_ball"), 4);
        helper.assertTrue(stack.getItem() instanceof MsmThrowableItem, "ruby_ball is not an MsmThrowableItem");
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        InteractionResult result = stack.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(result.consumesAction(), "use did not throw: " + result);
        helper.assertValueEqual(stack.getCount(), 3, "consume uses one item");
        List<MsmThrownItem> thrown = thrown(helper, player, item("ruby_ball"));
        helper.assertValueEqual(thrown.size(), 1, "thrown entities");
        MsmThrownItem entity = thrown.getFirst();
        helper.assertValueEqual(BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()), MsmThrownItem.ID, "entity type");
        helper.assertValueEqual(entity.getItem().getCount(), 1, "the entity carries one item");
        helper.assertFalse(entity.carriesItem(), "consume does not bring the item back");
        double speed = entity.getDeltaMovement().length();
        helper.assertTrue(Math.abs(speed - 1.5) < 0.2, "default speed 1.5, got " + speed);
        helper.assertTrue(Math.abs(entity.getGravity() - 0.03) < 1.0e-6, "default gravity 0.03, got " + entity.getGravity());
        helper.assertTrue(entity.getType().getWidth() == 0.25f && entity.getType().getHeight() == 0.25f, "size 0.25");
        helper.assertValueEqual(entity.getType().clientTrackingRange(), 4, "tracking range");
        helper.assertValueEqual(entity.getType().updateInterval(), 10, "update interval");
        entity.discard();
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void gravityOverrideChangesTheFall(GameTestHelper helper) {
        Player player = thrower(helper);
        ItemStack feather = new ItemStack(item("feather_ball"), 2);
        player.setItemInHand(InteractionHand.MAIN_HAND, feather);
        feather.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        MsmThrownItem entity = thrown(helper, player, item("feather_ball")).getFirst();
        helper.assertTrue(entity.getGravity() == 0.0, "gravity 0, got " + entity.getGravity());
        double speed = entity.getDeltaMovement().length();
        helper.assertTrue(Math.abs(speed - 0.5) < 1.0e-3, "speed 0.5 with inaccuracy 0, got " + speed);
        Vec3 start = entity.getDeltaMovement();
        helper.runAfterDelay(5, () -> {
            Vec3 now = entity.getDeltaMovement();
            helper.assertTrue(Math.abs(now.y - start.y * Math.pow(0.99, 5)) < 1.0e-3,
                    "without gravity only air drag changes y: " + start.y + " -> " + now.y);
            entity.discard();
            List<String> warnings = MsmRuntime.report().warnings();
            helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("feather_ball.json") && w.contains("msm_test:no_such_sound")),
                    "no warning for the unknown throw sound: " + warnings);
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 40)
    public void entityHitDealsDamageAndFiresOnHitEntity(GameTestHelper helper) {
        Player player = thrower(helper);
        player.setHealth(10);
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, LANDING);
        float full = cow.getHealth();
        Recorder r = new Recorder(id("ruby_ball"), player);
        MsmThrownItem entity = new MsmThrownItem(helper.getLevel(), player, new ItemStack(item("ruby_ball")));
        dropOnto(helper, entity, Vec3.atBottomCenterOf(LANDING).add(0, 0.6, 0));
        helper.getLevel().addFreshEntity(entity);
        helper.runAfterDelay(10, () -> {
            r.close();
            helper.assertTrue(entity.isRemoved(), "the thrown item was not discarded after the hit");
            List<Recorder.Fired> hits = r.of("hit");
            helper.assertValueEqual(hits.size(), 1, "on_hit_entity firings");
            // The damage comes first, then on_hit_entity (whose frostbite on_start hurts again within the invulnerable time).
            helper.assertTrue(Math.abs(hits.getFirst().otherHealth() - (full - 3)) < 1.0e-3,
                    "damage 3 before on_hit_entity: health " + hits.getFirst().otherHealth() + " of " + full);
            helper.assertTrue(hits.getFirst().ctx().other() == cow, "other is the cow hit: " + hits.getFirst().ctx().other());
            helper.assertTrue(hits.getFirst().ctx().player() == player, "player is the thrower");
            Holder<MobEffect> frostbite = BuiltInRegistries.MOB_EFFECT.get(id("frostbite")).orElseThrow();
            helper.assertTrue(cow.hasEffect(frostbite), "apply_effect with target other did not reach the cow");
            helper.assertTrue(player.getHealth() > 10.5f, "heal with target self did not reach the thrower: " + player.getHealth());
            helper.assertTrue(r.of("land").isEmpty(), "on_hit_block fired for an entity hit");
            cow.discard();
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 40)
    public void blockHitFiresOnHitBlock(GameTestHelper helper) {
        helper.setBlock(LANDING, Blocks.STONE);
        Player player = thrower(helper);
        Recorder r = new Recorder(id("ruby_ball"), player);
        MsmThrownItem entity = new MsmThrownItem(helper.getLevel(), player, new ItemStack(item("ruby_ball")));
        dropOnto(helper, entity, Vec3.atBottomCenterOf(LANDING).add(0, 1, 0));
        helper.getLevel().addFreshEntity(entity);
        helper.runAfterDelay(10, () -> {
            r.close();
            helper.assertTrue(entity.isRemoved(), "the thrown item was not discarded after the hit");
            helper.assertValueEqual(r.of("land").size(), 1, "on_hit_block firings");
            helper.assertBlockPresent(Blocks.GOLD_BLOCK, LANDING.above());
            helper.assertTrue(r.of("land").getFirst().ctx().block().equals(helper.absolutePos(LANDING)), "block is the block hit");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 40)
    public void dropLeavesTheItemWhereItLands(GameTestHelper helper) {
        helper.setBlock(LANDING, Blocks.STONE);
        Player player = thrower(helper);
        ItemStack knife = new ItemStack(item("ruby_knife"));
        player.setItemInHand(InteractionHand.MAIN_HAND, knife);
        knife.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(player.getMainHandItem().isEmpty(), "drop takes the item from the hand");
        MsmThrownItem entity = thrown(helper, player, item("ruby_knife")).getFirst();
        helper.assertTrue(entity.carriesItem(), "drop carries the item");
        helper.assertValueEqual(entity.getItem().getDamageValue(), 1, "one durability per throw");
        dropOnto(helper, entity, Vec3.atBottomCenterOf(LANDING).add(0, 1, 0));
        helper.runAfterDelay(10, () -> {
            List<ItemEntity> dropped = helper.getLevel().getEntitiesOfClass(ItemEntity.class,
                    new AABB(helper.absolutePos(LANDING)).inflate(2), e -> e.getItem().is(item("ruby_knife")));
            helper.assertValueEqual(dropped.size(), 1, "dropped knives at the landing point");
            helper.assertValueEqual(dropped.getFirst().getItem().getDamageValue(), 1, "the dropped knife keeps its damage");
            dropped.forEach(ItemEntity::discard);
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 40)
    public void returnPutsTheItemBack(GameTestHelper helper) {
        helper.setBlock(LANDING, Blocks.STONE);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(AT)));
        ItemStack boomerang = new ItemStack(item("ruby_boomerang"));
        player.setItemInHand(InteractionHand.MAIN_HAND, boomerang);
        boomerang.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(player.getMainHandItem().isEmpty(), "return takes the item from the hand while it flies");
        MsmThrownItem entity = thrown(helper, player, item("ruby_boomerang")).getFirst();
        dropOnto(helper, entity, Vec3.atBottomCenterOf(LANDING).add(0, 1, 0));
        helper.runAfterDelay(10, () -> {
            int found = 0;
            for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
                ItemStack s = player.getInventory().getItem(i);
                if (s.is(item("ruby_boomerang"))) {
                    found += s.getCount();
                    helper.assertValueEqual(s.getDamageValue(), 1, "the returned item took one durability");
                }
            }
            helper.assertValueEqual(found, 1, "boomerangs back in the inventory");
            helper.assertTrue(helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(LANDING)).inflate(3),
                    e -> e.getItem().is(item("ruby_boomerang"))).isEmpty(), "the boomerang also dropped");
            helper.succeed();
        });
    }

    @GameTest
    public void keepWithOnUseAndCooldown(GameTestHelper helper) {
        Player player = thrower(helper);
        Recorder r = new Recorder(id("ruby_orb"), player);
        ItemStack orb = new ItemStack(item("ruby_orb"));
        player.setItemInHand(InteractionHand.MAIN_HAND, orb);
        orb.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        r.close();
        helper.assertValueEqual(r.of("cast").size(), 1, "msm:on_use fired with the throw");
        helper.assertValueEqual(orb.getCount(), 1, "keep uses no item");
        helper.assertValueEqual(orb.getDamageValue(), 1, "keep takes one durability from the held item");
        List<MsmThrownItem> thrown = thrown(helper, player, item("ruby_orb"));
        helper.assertValueEqual(thrown.size(), 1, "keep still throws");
        helper.assertFalse(thrown.getFirst().carriesItem(), "the kept item does not come back twice");
        helper.assertTrue(player.getCooldowns().isOnCooldown(orb), "cooldown_ticks starts a cooldown");
        InteractionResult again = orb.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(again instanceof InteractionResult.Fail, "used during the cooldown: " + again);
        helper.assertValueEqual(thrown(helper, player, item("ruby_orb")).size(), 1, "a second throw during the cooldown");
        thrown.forEach(MsmThrownItem::discard);
        helper.succeed();
    }

    @GameTest
    public void chargeThrowsOnlyAfterTheThreshold(GameTestHelper helper) {
        Player player = thrower(helper);
        ItemStack javelin = new ItemStack(item("ruby_javelin"), 2);
        player.setItemInHand(InteractionHand.MAIN_HAND, javelin);
        javelin.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(player.isUsingItem(), "charge_ticks: use starts charging");
        helper.assertTrue(thrown(helper, player, item("ruby_javelin")).isEmpty(), "thrown before release");
        int duration = javelin.getUseDuration(player);
        helper.assertFalse(javelin.getItem().releaseUsing(javelin, helper.getLevel(), player, duration - 5), "released after 5 of 10 ticks");
        helper.assertTrue(thrown(helper, player, item("ruby_javelin")).isEmpty(), "thrown after 5 of 10 ticks");
        helper.assertValueEqual(javelin.getCount(), 2, "an early release keeps the item");
        helper.assertTrue(javelin.getItem().releaseUsing(javelin, helper.getLevel(), player, duration - 12), "release after 12 ticks");
        player.stopUsingItem();
        List<MsmThrownItem> thrown = thrown(helper, player, item("ruby_javelin"));
        helper.assertValueEqual(thrown.size(), 1, "thrown after 12 of 10 ticks");
        double speed = thrown.getFirst().getDeltaMovement().length();
        helper.assertTrue(Math.abs(speed - 2.5) < 0.25, "speed 2.5, got " + speed);
        helper.assertValueEqual(javelin.getCount(), 1, "consume after the throw");
        thrown.forEach(MsmThrownItem::discard);
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void dispenserShootsOne(GameTestHelper helper) {
        helper.assertTrue(DispenserBlock.DISPENSER_REGISTRY.containsKey(item("ruby_ball")), "ruby_ball has no dispenser behaviour");
        helper.assertFalse(DispenserBlock.DISPENSER_REGISTRY.containsKey(item("ruby_boomerang")), "dispensable false is dispensed");
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at, Blocks.DISPENSER.defaultBlockState().setValue(DispenserBlock.FACING, Direction.UP));
        DispenserBlockEntity dispenser = (DispenserBlockEntity) helper.getBlockEntity(at, DispenserBlockEntity.class);
        dispenser.setItem(0, new ItemStack(item("ruby_ball"), 3));
        helper.setBlock(at.east(), Blocks.REDSTONE_BLOCK);
        ServerLevel level = helper.getLevel();
        List<MsmThrownItem> seen = new ArrayList<>();
        helper.onEachTick(() -> seen.addAll(level.getEntitiesOfClass(MsmThrownItem.class, new AABB(helper.absolutePos(at)).inflate(8),
                e -> e.getItem().is(item("ruby_ball")) && !seen.contains(e))));
        helper.runAfterDelay(12, () -> {
            helper.assertValueEqual(dispenser.getItem(0).getCount(), 2, "the dispenser used one item");
            helper.assertValueEqual(seen.size(), 1, "thrown items from the dispenser");
            seen.forEach(MsmThrownItem::discard);
            helper.succeed();
        });
    }

    /** {@code msm_runtime:thrown_item} is registered even when no definition uses it, and only once. */
    @GameTest
    public void thrownItemTypeIsRegistered(GameTestHelper helper) {
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(MsmThrownItem.ID), "msm_runtime:thrown_item not registered");
        helper.assertFalse(MsmRuntime.report().entities().contains(MsmThrownItem.ID), "the runtime's own type is not a definition entity");
        helper.succeed();
    }
}
