package dev.mcsupermods.runtime.gametest.spike4;

import static dev.mcsupermods.runtime.gametest.spike4.B524Help.R;
import static dev.mcsupermods.runtime.gametest.spike4.X15X16TradeGameTest.YARD;

import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.mob.MobShoulder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.targeting.TargetingConditions;
import net.minecraft.world.entity.animal.parrot.Parrot;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.entity.vehicle.boat.ChestBoat;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * B524 spike (throwaway), X20 to X24 on the GameTest server: a project fish caught in and released from a bucket, two
 * pets and parrots on the shoulders, hovering, phasing and roosting bodies, the five habits, and project boats placed,
 * ridden, opened and broken.
 */
public class X20X24MobGameTest {
    static String id(Entity e) {
        return BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString();
    }

    static String rel(GameTestHelper helper, Vec3 abs) {
        Vec3 o = helper.absoluteVec(Vec3.ZERO);
        return String.format("%.2f %.2f %.2f", abs.x - o.x, abs.y - o.y, abs.z - o.z);
    }

    static void pool(GameTestHelper helper, int x0, int x1, int z0, int z1) {
        for (int x = x0 - 1; x <= x1 + 1; x++) {
            for (int z = z0 - 1; z <= z1 + 1; z++) {
                boolean inside = x >= x0 && x <= x1 && z >= z0 && z <= z1;
                helper.setBlock(new BlockPos(x, 1, z), inside ? Blocks.WATER : Blocks.STONE);
            }
        }
    }

    /** The player at {@code at} (relative, block centre, given height) looking straight down. */
    static ServerPlayer looker(GameTestHelper helper, double x, double y, double z) {
        ServerPlayer p = B524Help.player(helper, BlockPos.ZERO, GameType.SURVIVAL);
        Vec3 abs = helper.absoluteVec(new Vec3(x, y, z));
        p.snapTo(abs.x, abs.y, abs.z, 0f, 90f);
        return p;
    }

    @GameTest(structure = YARD, maxTicks = 120)
    public void x20Bucket(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        pool(helper, 6, 10, 6, 10);
        SpikeFish fish = helper.spawn(B524Mod.fish, new BlockPos(8, 1, 8));
        fish.setCustomName(Component.literal("Finn"));
        fish.setHealth(3.0f);
        ServerPlayer p = B524Help.player(helper, new BlockPos(8, 2, 6), GameType.SURVIVAL);
        R.section("X20.pickup", () -> {
            p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.WATER_BUCKET));
            m.put("pickup.result", String.valueOf(p.interactOn(fish, InteractionHand.MAIN_HAND, Vec3.ZERO)));
            ItemStack held = p.getMainHandItem();
            m.put("pickup.held", BuiltInRegistries.ITEM.getKey(held.getItem()) + " x" + held.getCount());
            m.put("pickup.bucketData", String.valueOf(held.get(DataComponents.BUCKET_ENTITY_DATA)));
            m.put("pickup.fishRemoved", fish.isRemoved() + " " + fish.getRemovalReason());
        });
        helper.runAfterDelay(5, () -> R.section("X20.release", () -> {
            ServerPlayer releaser = looker(helper, 13.5, 1.0, 13.5);
            releaser.setItemInHand(InteractionHand.MAIN_HAND, p.getMainHandItem().copy());
            m.put("release.result", String.valueOf(releaser.getMainHandItem().use(level, releaser, InteractionHand.MAIN_HAND)));
            m.put("release.held", BuiltInRegistries.ITEM.getKey(releaser.getMainHandItem().getItem()).toString());
            m.put("release.water", String.valueOf(level.getBlockState(helper.absolutePos(new BlockPos(13, 1, 13)))));
            List<SpikeFish> out = level.getEntitiesOfClass(SpikeFish.class, new AABB(helper.absolutePos(new BlockPos(13, 1, 13))).inflate(2));
            List<String> fishes = new ArrayList<>();
            for (SpikeFish f : out) {
                fishes.add(id(f) + " name " + (f.getCustomName() == null ? null : f.getCustomName().getString()) + " health " + f.getHealth()
                        + " fromBucket " + f.fromBucket() + " persistent " + f.requiresCustomPersistence() + " at " + rel(helper, f.position()));
            }
            m.put("release.fish", fishes);
            releaser.discard();
            p.discard();
        }));
        helper.runAfterDelay(10, () -> {
            R.put("X20", m);
            helper.succeed();
        });
    }

    @GameTest(structure = YARD, maxTicks = 300)
    public void x21Shoulders(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerPlayer owner = B524Help.player(helper, new BlockPos(8, 1, 8), GameType.SURVIVAL);
        EntityType<?> petType = BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.fromNamespaceAndPath("msm_test", "shoulder_pet"));
        TamableAnimal a = (TamableAnimal) helper.spawn(petType, new BlockPos(8, 1, 9));
        TamableAnimal b = (TamableAnimal) helper.spawn(petType, new BlockPos(9, 1, 8));
        a.tame(owner);
        b.tame(owner);
        List<Parrot> parrots = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Parrot parrot = helper.spawn(EntityTypes.PARROT, new BlockPos(5 + i, 1, 3));
            parrot.tame(owner);
            parrot.setOrderedToSit(true);
            parrots.add(parrot);
        }
        helper.runAfterDelay(110, () -> {
        m.put("owner.onGround.mock", owner.onGround());
        owner.setOnGround(true);
        R.section("X21.pets", () -> {
            MobShoulder sa = ((MsmMob) a).driver().shoulder();
            MobShoulder sb = ((MsmMob) b).driver().shoulder();
            m.put("a.perch", sa.perch(owner));
            m.put("b.refusal", String.valueOf(sb.refusal(owner)));
            m.put("b.perch", sb.perch(owner));
            Vec3 off = MobShoulder.offset(owner);
            m.put("offset", String.format("%.3f %.3f %.3f yaw %.1f", off.x, off.y, off.z, owner.yBodyRot));
        });
        R.section("X21.parrots", () -> {
            List<String> steps = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                Parrot parrot = parrots.get(i);
                boolean on = parrot.setEntityOnShoulder(owner);
                steps.add("parrot " + (i + 1) + " canSit " + parrot.canSitOnShoulder() + " on " + on + " left " + owner.getShoulderParrotLeft()
                        + " right " + owner.getShoulderParrotRight() + " parrot removed " + parrot.isRemoved());
            }
            m.put("parrots", steps);
            owner.setShoulderParrotLeft(java.util.Optional.empty());
            m.put("setLeftEmpty", "left " + owner.getShoulderParrotLeft() + " right " + owner.getShoulderParrotRight());
            Parrot fourth = parrots.get(3);
            m.put("parrot.withRightTaken", fourth.setEntityOnShoulder(owner) + " left " + owner.getShoulderParrotLeft() + " right " + owner.getShoulderParrotRight());
            owner.setShoulderParrotLeft(java.util.Optional.empty());
            owner.setShoulderParrotRight(java.util.Optional.empty());
        });
        });
        // The second side by our own placement: the runtime's offset mirrored across the owner's body axis.
        int[] t = {0};
        helper.onEachTick(() -> {
            t[0]++;
            if (b.isRemoved() || t[0] < 112) {
                return;
            }
            Vec3 off = MobShoulder.offset(owner);
            double yaw = Math.toRadians(owner.yBodyRot);
            Vec3 side = new Vec3(Math.cos(yaw), 0, Math.sin(yaw)); // the body's x axis
            double s = off.x * side.x + off.z * side.z;
            Vec3 right = off.subtract(side.scale(2 * s));
            b.setNoGravity(true);
            b.noPhysics = true;
            b.setPos(owner.position().add(right));
            b.setDeltaMovement(Vec3.ZERO);
            if (t[0] == 160) {
                m.put("tick60.a", rel(helper, a.position()) + " perched " + ((MsmMob) a).driver().shoulder().perched());
                m.put("tick60.b", rel(helper, b.position()));
                m.put("tick60.owner", rel(helper, owner.position()));
                R.put("X21", m);
                owner.discard();
                helper.succeed();
            }
        });
    }

    @GameTest(structure = YARD, maxTicks = 340)
    public void x22Flight(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        for (int x = 9; x <= 15; x++) {
            for (int z = 1; z <= 6; z++) {
                for (int y = 1; y <= 3; y++) {
                    helper.setBlock(new BlockPos(x, y, z), Blocks.STONE);
                }
            }
        }
        for (int z = 9; z <= 15; z++) {
            for (int y = 1; y <= 6; y++) {
                helper.setBlock(new BlockPos(8, y, z), Blocks.STONE);
            }
        }
        helper.setBlock(new BlockPos(3, 6, 3), Blocks.STONE);
        SpikeMob hover = helper.spawn(B524Mod.hover, new BlockPos(5, 2, 4));
        SpikeMob phase = helper.spawn(B524Mod.phase, new BlockPos(4, 2, 11));
        SpikeMob blocked = helper.spawn(B524Mod.phase, new BlockPos(4, 2, 14));
        SpikeMob roost = helper.spawn(B524Mod.roost, new BlockPos(3, 3, 3));
        Vec3 aim = helper.absoluteVec(new Vec3(12.5, 2.0, 11.5));
        Vec3 aimBlocked = helper.absoluteVec(new Vec3(12.5, 2.0, 14.5));
        phase.chargeTo = aim;
        phase.charging = true;
        blocked.chargeTo = aimBlocked;
        blocked.charging = true;
        blocked.phaseThrough = false;
        float phaseHealth = phase.getHealth();
        m.put("roost.found", roost.roost());
        double roostY = roost.getY();
        List<String> heights = new ArrayList<>();
        List<String> phasePath = new ArrayList<>();
        int[] t = {0};
        boolean[] wall = {false};
        helper.onEachTick(() -> {
            t[0]++;
            if (t[0] % 10 == 0) {
                double ground = SpikeMob.groundBelow(level, hover.blockPosition());
                heights.add(t[0] + ": over " + String.format("%.2f", hover.getY() - ground) + " at " + rel(helper, hover.position()));
                phasePath.add(t[0] + ": " + rel(helper, phase.position()) + " | blocked " + rel(helper, blocked.position()));
            }
            if (phase.isInWall()) {
                wall[0] = true;
            }
            if (t[0] == 320) {
                m.put("hover.overGround", heights);
                m.put("phase.path", phasePath);
                m.put("phase.events", phase.events);
                m.put("phase.health", phaseHealth + " -> " + phase.getHealth() + ", in wall at some tick " + wall[0]);
                m.put("blocked.end", rel(helper, blocked.position()) + " health " + blocked.getHealth());
                m.put("roost", "y " + String.format("%.3f -> %.3f", roostY, roost.getY()) + " flag " + roost.flag() + " ceiling block bottom "
                        + (helper.absolutePos(new BlockPos(3, 6, 3)).getY()) + " box top " + String.format("%.3f", roost.getBoundingBox().maxY));
                R.put("X22", m);
                helper.succeed();
            }
        });
    }

    @GameTest(structure = YARD, maxTicks = 340)
    public void x23Habits(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        // Collect (allay-like): given an emerald, brings emeralds to its owner and leaves dirt.
        ServerPlayer owner = B524Help.player(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL);
        SpikeMob collector = helper.spawn(B524Mod.collector, new BlockPos(3, 1, 3));
        owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.EMERALD));
        m.put("collect.give", String.valueOf(owner.interactOn(collector, InteractionHand.MAIN_HAND, Vec3.ZERO)));
        for (int i = 0; i < 3; i++) {
            helper.spawnItem(Items.EMERALD, new Vec3(3.5 + i, 1, 12.5));
        }
        helper.spawnItem(Items.DIRT, new Vec3(4.5, 1, 13.5));
        // Dig (sniffer-like) on moss.
        for (int x = 11; x <= 13; x++) {
            for (int z = 2; z <= 4; z++) {
                helper.setBlock(new BlockPos(x, 0, z), Blocks.MOSS_BLOCK);
            }
        }
        SpikeMob digger = helper.spawn(B524Mod.digger, new BlockPos(12, 1, 3));
        // Play dead (axolotl-like).
        SpikeMob dead = helper.spawn(B524Mod.playDead, new BlockPos(12, 1, 12));
        Zombie zombie = helper.spawn(EntityTypes.ZOMBIE, new BlockPos(14, 1, 14));
        zombie.setNoAi(true);
        m.put("dead.seenAsEnemy.before", TargetingConditions.forCombat().test(level, zombie, dead));
        dead.hurtServer(level, level.damageSources().generic(), 12f);
        m.put("dead.afterHit", "health " + dead.getHealth() + " flag " + dead.flag() + " seenAsEnemy " + TargetingConditions.forCombat().test(level, zombie, dead));
        Vec3 deadAt = dead.position();
        // Barter (piglin-like) from a player's hand.
        SpikeMob barterer = helper.spawn(B524Mod.barterer, new BlockPos(8, 1, 8));
        ServerPlayer trader = B524Help.player(helper, new BlockPos(8, 1, 6), GameType.SURVIVAL);
        trader.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GOLD_INGOT, 2));
        m.put("barter.give", owner == null ? null : String.valueOf(trader.interactOn(barterer, InteractionHand.MAIN_HAND, Vec3.ZERO))
                + " left in hand " + trader.getMainHandItem().getCount() + " offhand " + barterer.getOffhandItem());
        int[] t = {0};
        helper.onEachTick(() -> {
            t[0]++;
            if (t[0] == 100) {
                m.put("dead.tick100", "moved " + String.format("%.3f", dead.position().distanceTo(deadAt)) + " health " + dead.getHealth() + " flag " + dead.flag());
            }
            if (t[0] == 140) {
                helper.spawnItem(Items.GOLD_INGOT, new Vec3(8.5, 1, 8.5));
            }
            if (t[0] == 320) {
                m.put("collect.events", collector.events);
                m.put("collect.delivered", collector.delivered + ", pickUpItem calls " + collector.vanillaPickups);
                List<String> nearOwner = new ArrayList<>();
                for (ItemEntity e : level.getEntitiesOfClass(ItemEntity.class, new AABB(owner.blockPosition()).inflate(4))) {
                    nearOwner.add(e.getItem().toString());
                }
                m.put("collect.itemsNearOwner", nearOwner);
                List<String> left = new ArrayList<>();
                for (ItemEntity e : level.getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(new BlockPos(4, 1, 13))).inflate(3))) {
                    left.add(e.getItem().toString());
                }
                m.put("collect.leftOnGround", left);
                m.put("dig", digger.digs + " " + digger.events);
                m.put("dead.events", dead.events + " health now " + dead.getHealth() + " flag " + dead.flag());
                m.put("barter", barterer.barters + " " + barterer.events);
                R.put("X23", m);
                owner.discard();
                trader.discard();
                helper.succeed();
            }
        });
    }

    @GameTest(structure = YARD, maxTicks = 200)
    public void x24Boats(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        pool(helper, 3, 13, 3, 13);
        m.put("init", B524Mod.INIT);
        ServerPlayer placer = looker(helper, 5.5, 3.0, 5.5);
        placer.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(B524Mod.boatItem));
        m.put("place.boat", String.valueOf(placer.getMainHandItem().use(level, placer, InteractionHand.MAIN_HAND)) + " left " + placer.getMainHandItem());
        ServerPlayer placer2 = looker(helper, 11.5, 3.0, 11.5);
        placer2.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(B524Mod.chestBoatItem));
        m.put("place.chestBoat", String.valueOf(placer2.getMainHandItem().use(level, placer2, InteractionHand.MAIN_HAND)) + " left " + placer2.getMainHandItem());
        ServerPlayer placer3 = looker(helper, 5.5, 3.0, 11.5);
        placer3.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.OAK_BOAT));
        m.put("place.oakBoat", String.valueOf(placer3.getMainHandItem().use(level, placer3, InteractionHand.MAIN_HAND)));
        placer3.discard();
        AABB area = new AABB(helper.absolutePos(new BlockPos(0, 0, 0))).expandTowards(17, 10, 17);
        List<AbstractBoat> boats = level.getEntitiesOfClass(AbstractBoat.class, area);
        List<String> found = new ArrayList<>();
        for (AbstractBoat b : boats) {
            found.add(id(b) + " at " + rel(helper, b.position()) + " pick " + BuiltInRegistries.ITEM.getKey(b.getPickResult().getItem()));
        }
        m.put("placed", found);
        AbstractBoat boat = boats.stream().filter(b -> b.getType() == B524Mod.boat).findFirst().orElse(null);
        ChestBoat chest = (ChestBoat) boats.stream().filter(b -> b.getType() == B524Mod.chestBoat).findFirst().orElse(null);
        R.section("X24.ride", () -> {
            ServerPlayer rider = B524Help.player(helper, new BlockPos(6, 2, 6), GameType.SURVIVAL);
            m.put("ride.interact", String.valueOf(rider.interactOn(boat, InteractionHand.MAIN_HAND, Vec3.ZERO)) + " passenger " + rider.isPassenger()
                    + " vehicle " + (rider.getVehicle() == null ? null : id(rider.getVehicle())));
            ServerPlayer sneaker = B524Help.player(helper, new BlockPos(11, 2, 9), GameType.SURVIVAL);
            sneaker.setShiftKeyDown(true);
            m.put("chest.interact", String.valueOf(sneaker.interactOn(chest, InteractionHand.MAIN_HAND, Vec3.ZERO)) + " menu "
                    + sneaker.containerMenu.getClass().getSimpleName() + " slots " + sneaker.containerMenu.slots.size() + " container " + chest.getContainerSize());
            sneaker.closeContainer();
            chest.setItem(0, new ItemStack(Items.DIAMOND, 3));
            sneaker.discard();
        });
        int[] t = {0};
        helper.onEachTick(() -> {
            t[0]++;
            if (t[0] == 60) {
                R.section("X24.float", () -> {
                    List<String> fl = new ArrayList<>();
                    for (AbstractBoat b : level.getEntitiesOfClass(AbstractBoat.class, area)) {
                        fl.add(id(b) + " " + rel(helper, b.position()) + " riders " + b.getPassengers().size());
                    }
                    m.put("float.tick60", fl);
                });
            }
            if (t[0] == 80) {
                R.section("X24.break", () -> {
                    ServerPlayer breaker = B524Help.player(helper, new BlockPos(8, 2, 8), GameType.SURVIVAL);
                    boat.ejectPassengers();
                    int hits = 0;
                    while (!boat.isRemoved() && hits < 10) {
                        boat.hurtServer(level, level.damageSources().playerAttack(breaker), 10f);
                        hits++;
                    }
                    m.put("break.boat", "hits " + hits + " removed " + boat.isRemoved());
                    hits = 0;
                    while (!chest.isRemoved() && hits < 10) {
                        chest.hurtServer(level, level.damageSources().playerAttack(breaker), 10f);
                        hits++;
                    }
                    m.put("break.chest", "hits " + hits + " removed " + chest.isRemoved());
                    breaker.discard();
                });
            }
            if (t[0] == 90) {
                List<String> drops = new ArrayList<>();
                for (ItemEntity e : level.getEntitiesOfClass(ItemEntity.class, area)) {
                    drops.add(e.getItem().toString());
                }
                m.put("drops", drops);
                R.put("X24", m);
                placer.discard();
                placer2.discard();
                helper.succeed();
            }
        });
    }
}
