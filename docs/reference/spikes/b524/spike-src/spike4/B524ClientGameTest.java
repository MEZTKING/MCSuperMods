package dev.mcsupermods.runtime.gametest.spike4;

import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.minecraft.client.CameraType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.animal.parrot.Parrot;
import net.minecraft.world.entity.monster.zombie.ZombieVillager;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerType;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * B524 spike (throwaway) client GameTest on a dedicated server ({@code createServer()}, headless Mesa EGL): the merchant
 * screen with a special price set by our code (X15), a villager and a zombie villager of the project type (X19), pets
 * and a parrot on the shoulders (X21), roosting upside down (X22), the ridden dash from vanilla's jump bar (X23), and
 * project boats drawn by vanilla's renderer, on water and ridden (X24).
 */
public class B524ClientGameTest implements FabricClientGameTest {
    static final B524Results R = B524Results.CLIENT;

    private static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().getFirst();
    }

    static BlockPos pad(TestDedicatedServerContext server, int dx, boolean water) {
        return server.computeOnServer(s -> {
            ServerPlayer p = player(s);
            BlockPos at = p.blockPosition().offset(dx, 0, 0);
            for (int x = -12; x <= 12; x++) {
                for (int z = -12; z <= 12; z++) {
                    boolean pool = water && z >= 2 && z <= 10 && Math.abs(x) <= 6;
                    p.level().setBlock(at.offset(x, -2, z), Blocks.STONE.defaultBlockState(), Block.UPDATE_CLIENTS);
                    p.level().setBlock(at.offset(x, -1, z), pool ? Blocks.WATER.defaultBlockState() : Blocks.STONE.defaultBlockState(), Block.UPDATE_CLIENTS);
                    for (int y = 0; y <= 7; y++) {
                        p.level().setBlock(at.offset(x, y, z), Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS);
                    }
                }
            }
            return at;
        });
    }

    static void teleport(TestDedicatedServerContext server, BlockPos at, float yaw, float pitch) {
        server.runOnServer(s -> player(s).connection.teleport(at.getX() + 0.5, at.getY(), at.getZ() + 0.5, yaw, pitch));
    }

    static String shot(ClientGameTestContext context, TestDedicatedServerConnection connection, String name) {
        connection.waitForChunksRender();
        context.waitTicks(20);
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.waitTick();
        return context.takeScreenshot(name + "_" + B524Results.mc()).toString();
    }

    @SuppressWarnings("unchecked")
    static <T extends Entity> T spawn(ServerLevel level, EntityType<T> type, Vec3 at, float yaw) {
        T e = type.create(level, EntitySpawnReason.COMMAND);
        e.snapTo(at.x, at.y, at.z, yaw, 0f);
        if (e instanceof LivingEntity l) {
            l.setYHeadRot(yaw);
            l.setYBodyRot(yaw);
        }
        if (e instanceof Mob mob) {
            mob.setNoAi(true);
            mob.setPersistenceRequired();
        }
        level.addFreshEntity(e);
        return e;
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        try (TestDedicatedServerContext server = context.worldBuilder().createServer()) {
            try (TestDedicatedServerConnection connection = server.connect()) {
                server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
                server.runCommand("time set noon");
                server.runCommand("weather clear");
                R.put("client.init", B524Client.INIT);
                R.section("client.x15", () -> trade(context, server, connection));
                R.section("client.x19", () -> villagers(context, server, connection));
                R.section("client.x21", () -> shoulders(context, server, connection));
                R.section("client.x22", () -> roost(context, server, connection));
                R.section("client.x23", () -> dash(context, server, connection));
                R.section("client.x24", () -> boats(context, server, connection));
                R.put("client.log", B524Mod.logMatching(""));
            }
        }
    }

    private static void trade(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos c = pad(server, 0, false);
        teleport(server, c, 0f, 0f);
        int id = server.computeOnServer(s -> {
            ServerLevel level = (ServerLevel) player(s).level();
            EntityType<?> type = BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.fromNamespaceAndPath("msm_test", "trader_basic"));
            Entity e = spawn(level, type, Vec3.atBottomCenterOf(c.offset(0, 0, 2)), 180f);
            return e.getId();
        });
        context.waitTicks(10);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("open", server.computeOnServer(s -> {
            ServerPlayer p = player(s);
            Entity e = p.level().getEntity(id);
            p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            p.interactOn(e, InteractionHand.MAIN_HAND, Vec3.ZERO);
            return p.containerMenu.getClass().getSimpleName();
        }));
        context.waitTicks(10);
        m.put("client.before", context.computeOnClient(mc -> mc.player.containerMenu instanceof MerchantMenu menu ? costs(menu) : List.of("no menu")));
        m.put("server.set", server.computeOnServer(s -> {
            ServerPlayer p = player(s);
            PathfinderMob mob = (PathfinderMob) p.level().getEntity(id);
            var offers = ((MsmMob) mob).driver().trader().getOffers();
            for (MerchantOffer o : offers) {
                o.setSpecialPriceDiff(3);
            }
            p.sendMerchantOffers(p.containerMenu.containerId, offers, 1, 0, true, true);
            return offers.size();
        }));
        context.waitTicks(10);
        m.put("client.after", context.computeOnClient(mc -> mc.player.containerMenu instanceof MerchantMenu menu ? costs(menu) : List.of("no menu")));
        m.put("screen", context.computeOnClient(mc -> mc.gui.screen() == null ? null : mc.gui.screen().getClass().getSimpleName()));
        m.put("screenshot", shot(context, connection, "b524_x15_trade"));
        server.runOnServer(s -> player(s).closeContainer());
        context.waitTicks(5);
        server.runOnServer(s -> player(s).level().getEntity(id).discard());
        R.put("client.x15", m);
    }

    private static List<String> costs(MerchantMenu menu) {
        List<String> out = new ArrayList<>();
        for (MerchantOffer o : menu.getOffers()) {
            out.add(o.getCostA().getCount() + " " + BuiltInRegistries.ITEM.getKey(o.getCostA().getItem()).getPath() + " (base "
                    + o.getBaseCostA().getCount() + ", special " + o.getSpecialPriceDiff() + ")");
        }
        return out;
    }

    private static void villagers(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos c = pad(server, 40, false);
        teleport(server, c, 0f, 10f);
        server.runOnServer(s -> {
            ServerLevel level = (ServerLevel) player(s).level();
            Holder<VillagerType> ours = BuiltInRegistries.VILLAGER_TYPE.getOrThrow(B524Mod.villagerType);
            Villager plain = spawn(level, EntityTypes.VILLAGER, Vec3.atBottomCenterOf(c.offset(-2, 0, 4)), 180f);
            Villager v = spawn(level, EntityTypes.VILLAGER, Vec3.atBottomCenterOf(c.offset(0, 0, 4)), 180f);
            v.setVillagerData(v.getVillagerData().withType(ours));
            ZombieVillager z = spawn(level, EntityTypes.ZOMBIE_VILLAGER, Vec3.atBottomCenterOf(c.offset(2, 0, 4)), 180f);
            z.setVillagerData(z.getVillagerData().withType(ours));
            plain.setCustomName(Component.literal("plains"));
        });
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("screenshot", shot(context, connection, "b524_x19_villagers"));
        m.put("client.types", context.computeOnClient(mc -> {
            List<String> out = new ArrayList<>();
            for (Entity e : mc.level.entitiesForRendering()) {
                if (e instanceof Villager v) {
                    out.add("villager " + v.getVillagerData().type().unwrapKey().map(k -> k.identifier().toString()).orElse("?"));
                } else if (e instanceof ZombieVillager z) {
                    out.add("zombie villager " + z.getVillagerData().type().unwrapKey().map(k -> k.identifier().toString()).orElse("?"));
                }
            }
            return out;
        }));
        m.put("client.textureResources", context.computeOnClient(mc -> List.of(
                "villager " + mc.getResourceManager().getResource(B524Mod.id("textures/entity/villager/type/spike.png")).isPresent(),
                "zombie " + mc.getResourceManager().getResource(B524Mod.id("textures/entity/zombie_villager/type/spike.png")).isPresent())));
        m.put("log", B524Mod.logMatching("villager"));
        R.put("client.x19", m);
    }

    private static void shoulders(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos c = pad(server, 80, false);
        teleport(server, c, 0f, 0f);
        context.waitTicks(10);
        Map<String, Object> m = new LinkedHashMap<>();
        int[] ids = server.computeOnServer(s -> {
            ServerPlayer p = player(s);
            p.setGameMode(GameType.SURVIVAL);
            ServerLevel level = (ServerLevel) p.level();
            EntityType<?> petType = BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.fromNamespaceAndPath("msm_test", "shoulder_pet"));
            TamableAnimal a = (TamableAnimal) petType.create(level, EntitySpawnReason.COMMAND);
            a.snapTo(p.getX() + 1, p.getY(), p.getZ() + 1, 0f, 0f);
            level.addFreshEntity(a);
            a.tame(p);
            TamableAnimal b = (TamableAnimal) petType.create(level, EntitySpawnReason.COMMAND);
            b.snapTo(p.getX() - 1, p.getY(), p.getZ() + 1, 0f, 0f);
            level.addFreshEntity(b);
            b.tame(p);
            m.put("a.perch", ((MsmMob) a).driver().shoulder().perch(p));
            Parrot parrot = (Parrot) EntityTypes.PARROT.create(level, EntitySpawnReason.COMMAND);
            parrot.snapTo(p.getX(), p.getY(), p.getZ() + 1, 0f, 0f);
            level.addFreshEntity(parrot);
            parrot.tame(p);
            m.put("parrot.onShoulder", parrot.setEntityOnShoulder(p) + " left " + p.getShoulderParrotLeft() + " right " + p.getShoulderParrotRight());
            b.snapTo(p.getX() + 6, p.getY(), p.getZ() + 6, 0f, 0f);
            return new int[] {a.getId(), b.getId()};
        });
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.THIRD_PERSON_BACK));
        context.waitTicks(20);
        m.put("screenshot.parrotInVanillaLeftSlotAndRuntimePet.back", shot(context, connection, "b524_x21_parrot_left_slot_and_pet_back"));
        m.put("client.positions.first", context.computeOnClient(mc -> {
            Entity a = mc.level.getEntity(ids[0]);
            Vec3 p = mc.player.position();
            double yaw = Math.toRadians(mc.player.yBodyRot);
            Vec3 off = a.position().subtract(p);
            return "body yaw " + mc.player.yBodyRot + " pet along (cos yaw, 0, sin yaw) " + String.format("%.3f", off.x * Math.cos(yaw) + off.z * Math.sin(yaw));
        }));
        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            p.setShoulderParrotRight(p.getShoulderParrotLeft());
            p.setShoulderParrotLeft(Optional.empty());
        });
        context.waitTicks(5);
        m.put("screenshot.parrotInVanillaRightSlotAndRuntimePet.back", shot(context, connection, "b524_x21_parrot_right_slot_and_pet_back"));
        server.runOnServer(s -> player(s).setShoulderParrotRight(Optional.empty()));
        for (int i = 0; i < 40; i++) {
            server.runOnServer(s -> placeRight(player(s), (TamableAnimal) player(s).level().getEntity(ids[1])));
            context.waitTick();
        }
        m.put("screenshot.twoPets.back", shot(context, connection, "b524_x21_two_pets_back"));
        m.put("client.positions", context.computeOnClient(mc -> {
            Entity a = mc.level.getEntity(ids[0]);
            Entity b = mc.level.getEntity(ids[1]);
            Vec3 p = mc.player.position();
            double yaw = Math.toRadians(mc.player.yBodyRot);
            Vec3 oa = a.position().subtract(p);
            Vec3 ob = b.position().subtract(p);
            return List.of("body yaw " + mc.player.yBodyRot, "a along (cos yaw, 0, sin yaw) " + String.format("%.3f", oa.x * Math.cos(yaw) + oa.z * Math.sin(yaw)),
                    "b along it " + String.format("%.3f", ob.x * Math.cos(yaw) + ob.z * Math.sin(yaw)));
        }));
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.FIRST_PERSON));
        server.runOnServer(s -> {
            ((MsmMob) player(s).level().getEntity(ids[0])).driver().shoulder().unperch();
            player(s).level().getEntity(ids[0]).discard();
            player(s).level().getEntity(ids[1]).discard();
            player(s).setGameMode(GameType.CREATIVE);
        });
        R.put("client.x21", m);
    }

    static void placeRight(ServerPlayer owner, TamableAnimal pet) {
        Vec3 off = dev.mcsupermods.runtime.registry.mob.MobShoulder.offset(owner);
        double yaw = Math.toRadians(owner.yBodyRot);
        Vec3 side = new Vec3(Math.cos(yaw), 0, Math.sin(yaw));
        double s = off.x * side.x + off.z * side.z;
        Vec3 right = off.subtract(side.scale(2 * s));
        pet.setNoGravity(true);
        pet.noPhysics = true;
        pet.setPos(owner.position().add(right));
        pet.setYRot(owner.getYRot());
        pet.setYBodyRot(owner.yBodyRot);
        pet.setDeltaMovement(Vec3.ZERO);
    }

    private static void roost(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos c = pad(server, 120, false);
        teleport(server, c.offset(0, 0, 1), 0f, -35f);
        Map<String, Object> m = new LinkedHashMap<>();
        int[] ids = server.computeOnServer(s -> {
            ServerLevel level = (ServerLevel) player(s).level();
            for (int x = -3; x <= 3; x++) {
                level.setBlock(c.offset(x, 4, 4), Blocks.STONE.defaultBlockState(), Block.UPDATE_CLIENTS);
            }
            SpikeMob named = spawn(level, B524Mod.roost, Vec3.atBottomCenterOf(c.offset(-1, 2, 4)), 180f);
            named.setNoAi(false);
            named.setCustomName(Component.literal("Dinnerbone"));
            SpikeMob plain = spawn(level, B524Mod.roost, Vec3.atBottomCenterOf(c.offset(1, 2, 4)), 180f);
            plain.setNoAi(false);
            m.put("roost", named.roost() + " " + plain.roost());
            return new int[] {named.getId(), plain.getId()};
        });
        context.waitTicks(20);
        m.put("client.flags", context.computeOnClient(mc -> {
            List<String> out = new ArrayList<>();
            for (int id : ids) {
                SpikeMob e = (SpikeMob) mc.level.getEntity(id);
                EntityRenderer<?, ?> r = mc.getEntityRenderDispatcher().getRenderer(e);
                @SuppressWarnings("unchecked")
                boolean upside = r instanceof LivingEntityRenderer<?, ?, ?> l && ((LivingEntityRenderer<LivingEntity, ?, ?>) l).isEntityUpsideDown(e);
                out.add(id + " flag " + e.flag() + " renderer " + r.getClass().getSimpleName() + " upsideDown " + upside + " y " + e.getY());
            }
            return out;
        }));
        m.put("screenshot", shot(context, connection, "b524_x22_roost"));
        server.runOnServer(s -> {
            for (int id : ids) {
                player(s).level().getEntity(id).discard();
            }
        });
        R.put("client.x22", m);
    }

    private static void dash(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos c = pad(server, 160, false);
        teleport(server, c, 0f, 0f);
        context.waitTicks(10);
        Map<String, Object> m = new LinkedHashMap<>();
        int id = server.computeOnServer(s -> {
            ServerPlayer p = player(s);
            p.setGameMode(GameType.SURVIVAL);
            SpikeMob d = spawn((ServerLevel) p.level(), B524Mod.dasher, Vec3.atBottomCenterOf(c.offset(0, 0, 1)), 0f);
            d.setNoAi(false);
            p.startRiding(d);
            return d.getId();
        });
        context.waitTicks(20);
        m.put("client.jumpable", context.computeOnClient(mc -> mc.player.jumpableVehicle() == null ? null
                : mc.player.jumpableVehicle().getClass().getSimpleName() + " canJump " + mc.player.jumpableVehicle().canJump()));
        Vec3 before = context.computeOnClient(mc -> mc.player.getVehicle() == null ? Vec3.ZERO : mc.player.getVehicle().position());
        context.getInput().holdKey(o -> o.keyJump);
        context.waitTicks(12);
        m.put("client.jumpScale.held", context.computeOnClient(mc -> mc.player.getJumpRidingScale()));
        context.getInput().releaseKey(o -> o.keyJump);
        context.waitTicks(20);
        Vec3 after = context.computeOnClient(mc -> mc.player.getVehicle() == null ? Vec3.ZERO : mc.player.getVehicle().position());
        m.put("client.moved", after.subtract(before).toString());
        m.put("client.dashes", context.computeOnClient(mc -> ((SpikeMob) mc.level.getEntity(id)).dashes));
        m.put("server", server.computeOnServer(s -> {
            SpikeMob d = (SpikeMob) player(s).level().getEntity(id);
            return "dashes " + d.dashes + " startJumps " + d.startJumps + " flag " + d.flag() + " at " + d.position().subtract(Vec3.atBottomCenterOf(c));
        }));
        server.runOnServer(s -> {
            player(s).stopRiding();
            player(s).level().getEntity(id).discard();
            player(s).setGameMode(GameType.CREATIVE);
        });
        R.put("client.x23", m);
    }

    private static void boats(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos c = pad(server, 200, true);
        teleport(server, c, 0f, 20f);
        connection.waitForChunksRender();
        context.waitTicks(20);
        Map<String, Object> m = new LinkedHashMap<>();
        int[] ids = server.computeOnServer(s -> {
            ServerLevel level = (ServerLevel) player(s).level();
            AbstractBoat ours = spawn(level, B524Mod.boat, new Vec3(c.getX() - 2.0, c.getY() - 0.4, c.getZ() + 5.0), 90f);
            AbstractBoat chest = spawn(level, B524Mod.chestBoat, new Vec3(c.getX() + 3.0, c.getY() - 0.4, c.getZ() + 5.0), 90f);
            AbstractBoat oak = spawn(level, EntityTypes.OAK_BOAT, new Vec3(c.getX() + 0.5, c.getY() - 0.4, c.getZ() + 8.0), 90f);
            return new int[] {ours.getId(), chest.getId(), oak.getId()};
        });
        connection.waitForChunksRender();
        context.waitTicks(40);
        m.put("server.boats", server.computeOnServer(s -> {
            List<String> out = new ArrayList<>();
            for (int id : ids) {
                Entity e = player(s).level().getEntity(id);
                out.add(id + " " + (e == null ? "gone" : BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()) + " removed " + e.isRemoved() + " at "
                        + e.position().subtract(Vec3.atBottomCenterOf(c))));
            }
            return out;
        }));
        m.put("client.renderers", context.computeOnClient(mc -> {
            List<String> out = new ArrayList<>();
            for (int id : ids) {
                Entity e = mc.level.getEntity(id);
                if (e == null) {
                    out.add(id + " not on the client");
                    continue;
                }
                out.add(BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()) + " " + mc.getEntityRenderDispatcher().getRenderer(e).getClass().getSimpleName()
                        + " y " + String.format("%.3f", e.getY()));
            }
            return out;
        }));
        m.put("screenshot.boats", shot(context, connection, "b524_x24_boats"));
        server.runOnServer(s -> player(s).startRiding(player(s).level().getEntity(ids[0])));
        context.waitTicks(10);
        Vec3 before = context.computeOnClient(mc -> mc.player.getVehicle() == null ? Vec3.ZERO : mc.player.getVehicle().position());
        context.getInput().holdKey(o -> o.keyUp);
        context.waitTicks(30);
        context.getInput().releaseKey(o -> o.keyUp);
        Vec3 after = context.computeOnClient(mc -> mc.player.getVehicle() == null ? Vec3.ZERO : mc.player.getVehicle().position());
        m.put("client.riding", context.computeOnClient(mc -> mc.player.getVehicle() == null ? null
                : BuiltInRegistries.ENTITY_TYPE.getKey(mc.player.getVehicle().getType()).toString()));
        m.put("client.paddledDistance", String.format("%.2f", after.distanceTo(before)));
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.THIRD_PERSON_BACK));
        m.put("screenshot.riding", shot(context, connection, "b524_x24_riding"));
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.FIRST_PERSON));
        m.put("log", B524Mod.logMatching("boat"));
        R.put("client.x24", m);
    }
}
