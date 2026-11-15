package dev.mcsupermods.runtime.gametest.spike3;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.MerchantScreen;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.protocol.game.ClientboundSetPassengersPacket;
import net.minecraft.network.protocol.game.ServerboundSelectTradePacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.monster.zombie.ZombieVillager;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerProfession;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * B469 spike (throwaway): S11 (trader opened by a real client), S12 (profession textures) and S13 (inventory key while
 * riding, a shoulder pet) against a dedicated server ({@code createServer()}/{@code connect()}). Records into
 * {@code <gameDir>/msm-spike3/client-<mc>.json}; screenshots {@code b469_*} land in
 * {@code build/run/clientGameTest/screenshots/}.
 */
public class Spike3ClientGameTest implements FabricClientGameTest {
    private final Spike3Results r = new Spike3Results("client");
    private String mc;

    @Override
    public void runTest(ClientGameTestContext context) {
        mc = Spike3Results.mc().replace(' ', '_');
        try (TestDedicatedServerContext ds = context.worldBuilder().createServer()) {
            for (String mode : List.of("passenger", "follow")) {
                TestDedicatedServerConnection connection = ds.connect();
                boolean closed = false;
                try {
                    setup(ds);
                    connection.waitForChunksRender();
                    context.runOnClient(m -> m.gui.toastManager().clear());
                    if (mode.equals("passenger")) {
                        r.section("S11.client", () -> trader(context, ds));
                        r.section("S12.client", () -> professions(context, ds));
                        r.section("S13.storage", () -> storage(context, ds));
                    }
                    petMode = mode;
                    r.section("S13." + mode + ".shoulder", () -> shoulder(context, ds));
                    r.section("S13." + mode + ".dimension", () -> dimension(context, ds));
                    r.section("S13." + mode + ".disconnect", () -> {
                        remount(context, ds);
                        r.put("S13." + petMode + ".disconnect.before", petState(ds));
                        connection.close();
                    });
                    closed = true;
                } finally {
                    if (!closed) {
                        connection.close();
                    }
                }
                r.section("S13." + mode + ".afterDisconnect", () -> afterDisconnect(context, ds));
            }
        }
        r.put("log.spike", Spike3Mod.logMatching("msm_spike3"));
        r.put("log.texture", Spike3Mod.logMatching("texture"));
        r.put("log.passenger", Spike3Mod.logMatching("passenger"));
        r.put("log.riding", Spike3Mod.logMatching("riding"));
        r.put("log.moved", Spike3Mod.logMatching("moved wrongly"));
        r.put("log.all", new ArrayList<>(Spike3Mod.LOG));
        r.put("trader.events", new ArrayList<>(Spike3Trader.EVENTS));
        r.put("mule.opens", new ArrayList<>(Spike3Mule.OPENS));
        System.out.println("[spike3] client done " + mc);
    }

    // ---------------------------------------------------------------- helpers

    private static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().getFirst();
    }

    private static void setup(TestDedicatedServerContext ds) {
        ds.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
        ds.runCommand("time set noon");
        ds.runCommand("weather clear");
        ds.runCommand("gamerule doDaylightCycle false");
        ds.runCommand("fill -30 99 -30 30 99 40 minecraft:stone");
        ds.runCommand("fill -30 100 -30 30 106 40 minecraft:air");
        ds.runCommand("tp @a 0.5 100 0.5 0 0");
    }

    private static <T extends Mob> T spawn(MinecraftServer s, EntityType<T> type, double x, double y, double z, float yaw, boolean noAi) {
        ServerLevel level = s.overworld();
        T mob = type.create(level, EntitySpawnReason.COMMAND);
        mob.snapTo(x, y, z, yaw, 0);
        mob.setYHeadRot(yaw);
        mob.setYBodyRot(yaw);
        mob.setNoAi(noAi);
        mob.setPersistenceRequired();
        level.addFreshEntity(mob);
        return mob;
    }

    private static Entity client(Minecraft m, int id) {
        return m.level == null ? null : m.level.getEntity(id);
    }

    private static String v(Vec3 p) {
        return String.format("(%.3f, %.3f, %.3f)", p.x, p.y, p.z);
    }

    private static String screen(Minecraft m) {
        return m.gui.screen() == null ? "null" : m.gui.screen().getClass().getName();
    }

    private static List<String> offers(List<MerchantOffer> list) {
        List<String> out = new ArrayList<>();
        for (MerchantOffer o : list) {
            out.add(Spike3GameTest.offer(o) + (o.isOutOfStock() ? " OUT" : ""));
        }
        return out;
    }

    private String clientMenu(Minecraft m) {
        if (m.player.containerMenu instanceof MerchantMenu menu) {
            return "level " + menu.getTraderLevel() + " xp " + menu.getTraderXp() + " showProgressBar " + menu.showProgressBar()
                    + " canRestock " + menu.canRestock() + " offers " + offers(menu.getOffers());
        }
        return "not a merchant menu: " + m.player.containerMenu.getClass().getSimpleName();
    }

    // ---------------------------------------------------------------- S11

    private void trader(ClientGameTestContext context, TestDedicatedServerContext ds) throws Throwable {
        Spike3Trader.EVENTS.clear();
        int id = ds.computeOnServer(s -> {
            ServerPlayer p = player(s);
            p.getInventory().add(new ItemStack(Items.DIRT, 1));
            p.getInventory().add(new ItemStack(Items.EMERALD, 10));
            return spawn(s, Spike3Mod.trader, 0.5, 100, 2.5, 180, true).getId();
        });
        context.waitFor(m -> client(m, id) != null, 100);
        context.getInput().lookAt(0, 20);
        context.waitTicks(10);
        r.put("S11.client.hitResult", context.computeOnClient(m -> m.hitResult instanceof EntityHitResult ehr
                ? "entity " + ehr.getEntity().getId() + " (trader " + id + ")" : String.valueOf(m.hitResult == null ? null : m.hitResult.getType())));
        // A real right click (use key): Minecraft.startUseItem -> gameMode.interact -> ServerboundInteractPacket.
        context.getInput().pressKey(o -> o.keyUse);
        int waited = context.waitFor(m -> m.gui.screen() instanceof MerchantScreen, 60);
        r.put("S11.client.screenAfterUseKey", context.computeOnClient(Spike3ClientGameTest::screen) + " after " + waited + " ticks");
        context.waitTicks(5);
        r.put("S11.client.menuOpened", context.computeOnClient(this::clientMenu));
        context.runOnClient(m -> m.gui.toastManager().clear());
        context.waitTicks(2);
        r.put("S11.client.shotOpen", context.takeScreenshot("b469_trader_screen_" + mc).toString());
        // Select the dirt trade the way MerchantScreen's buttons do, then shift-click the result slot.
        int dirt = context.computeOnClient(m -> {
            MerchantMenu menu = (MerchantMenu) m.player.containerMenu;
            for (int i = 0; i < menu.getOffers().size(); i++) {
                if (menu.getOffers().get(i).getCostA().is(Items.DIRT)) {
                    return i;
                }
            }
            return -1;
        });
        r.put("S11.client.dirtIndex", dirt);
        for (int trade = 1; trade <= 2; trade++) {
            final int t = trade;
            if (trade == 2) {
                ds.runOnServer(s -> player(s).getInventory().add(new ItemStack(Items.DIRT, 1)));
                context.waitTicks(3);
            }
            context.runOnClient(m -> m.gui.toastManager().clear());
            context.runOnClient(m -> {
                MerchantMenu menu = (MerchantMenu) m.player.containerMenu;
                menu.setSelectionHint(dirt);
                menu.tryMoveItems(dirt);
                m.getConnection().send(new ServerboundSelectTradePacket(dirt));
            });
            context.waitTicks(5);
            r.put("S11.client.resultSlot." + t, context.computeOnClient(m -> String.valueOf(m.player.containerMenu.getSlot(2).getItem())));
            context.runOnClient(m -> m.gameMode.handleContainerInput(m.player.containerMenu.containerId, 2, 0, ContainerInput.QUICK_MOVE, m.player));
            context.waitTicks(10);
            r.put("S11.client.afterTrade." + t, context.computeOnClient(this::clientMenu));
            r.put("S11.server.afterTrade." + t, ds.computeOnServer(s -> {
                Spike3Trader tr = (Spike3Trader) s.overworld().getEntity(id);
                return "level " + tr.traderLevel() + " xp " + tr.getVillagerXp() + " offers " + offers(tr.getOffers())
                        + " emeralds " + player(s).getInventory().countItem(Items.EMERALD);
            }));
            r.put("S11.client.shotTrade" + t, context.takeScreenshot("b469_trader_after_trade" + t + "_" + mc).toString());
        }
        ds.runOnServer(s -> ((Spike3Trader) s.overworld().getEntity(id)).restock());
        context.waitTicks(5);
        r.put("S11.client.afterRestock", context.computeOnClient(this::clientMenu));
        r.put("S11.client.shotRestock", context.takeScreenshot("b469_trader_restocked_" + mc).toString());
        context.runOnClient(m -> m.player.closeContainer());
        context.waitTicks(5);
        r.put("S11.server.afterClose", ds.computeOnServer(s -> "tradingPlayer " + ((Spike3Trader) s.overworld().getEntity(id)).getTradingPlayer()));
        // Holding an item the mob does not use (a stick) still opens it; a lead is the mob's (leash) first.
        ds.runOnServer(s -> player(s).setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STICK)));
        context.waitTicks(3);
        context.getInput().pressKey(o -> o.keyUse);
        context.waitTicks(10);
        r.put("S11.client.useWithStick", context.computeOnClient(Spike3ClientGameTest::screen));
        context.runOnClient(m -> {
            if (m.gui.screen() != null) {
                m.player.closeContainer();
            }
        });
        ds.runOnServer(s -> {
            player(s).setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            s.overworld().getEntity(id).discard();
        });
        context.waitTicks(5);
    }

    // ---------------------------------------------------------------- S12

    private void professions(ClientGameTestContext context, TestDedicatedServerContext ds) throws Throwable {
        ds.runCommand("tp @a 0.5 100 -1.5 0 0");
        ds.runCommand("fill 1 103 2 3 103 5 minecraft:stone_slab");
        int[] ids = ds.computeOnServer(s -> {
            Holder<VillagerProfession> prof = BuiltInRegistries.VILLAGER_PROFESSION.getOrThrow(Spike3Mod.profession);
            Villager villager = spawn(s, EntityTypes.VILLAGER, -1.0, 100, 3.5, 180, true);
            villager.setVillagerData(villager.getVillagerData().withProfession(prof).withLevel(2));
            ZombieVillager zombie = spawn(s, EntityTypes.ZOMBIE_VILLAGER, 2.0, 100, 3.5, 180, true);
            zombie.setVillagerData(zombie.getVillagerData().withProfession(prof).withLevel(2));
            Villager farmer = spawn(s, EntityTypes.VILLAGER, -3.0, 100, 4.5, 180, true);
            farmer.setVillagerData(farmer.getVillagerData().withProfession(
                    BuiltInRegistries.VILLAGER_PROFESSION.getOrThrow(VillagerProfession.FARMER)).withLevel(2));
            return new int[] {villager.getId(), zombie.getId(), farmer.getId()};
        });
        context.waitFor(m -> client(m, ids[0]) != null && client(m, ids[1]) != null, 100);
        context.getInput().lookAt(0, 15);
        context.waitTicks(20);
        r.put("S12.client.villagerData", context.computeOnClient(m -> ((Villager) client(m, ids[0])).getVillagerData()
                + " / zombie " + ((ZombieVillager) client(m, ids[1])).getVillagerData()));
        r.put("S12.client.resources", context.computeOnClient(m -> {
            Map<String, Boolean> res = new LinkedHashMap<>();
            for (String path : List.of("textures/entity/villager/profession/spike_job.png",
                    "textures/entity/zombie_villager/profession/spike_job.png")) {
                res.put(path, m.getResourceManager().getResource(Spike3Mod.id(path)).isPresent());
            }
            return res;
        }));
        r.put("S12.client.name", context.computeOnClient(m -> client(m, ids[0]).getDisplayName().getString()));
        context.runOnClient(m -> m.gui.toastManager().clear());
        context.waitTicks(2);
        r.put("S12.client.shot", context.takeScreenshot("b469_professions_" + mc).toString());
        // The villager's own trade screen (vanilla villager, project profession).
        context.runOnClient(m -> {
            Entity e = client(m, ids[0]);
            m.gameMode.interact(m.player, e, new EntityHitResult(e), InteractionHand.MAIN_HAND);
        });
        context.waitFor(m -> m.gui.screen() instanceof MerchantScreen, 60);
        context.waitTicks(5);
        r.put("S12.client.villagerMenu", context.computeOnClient(m -> screen(m) + " " + clientMenu(m)));
        context.runOnClient(m -> m.gui.toastManager().clear());
        context.waitTicks(2);
        r.put("S12.client.shotTrades", context.takeScreenshot("b469_villager_trades_" + mc).toString());
        context.runOnClient(m -> m.player.closeContainer());
        context.waitTicks(3);
        ds.runOnServer(s -> {
            for (int id : ids) {
                s.overworld().getEntity(id).discard();
            }
            s.getCommands().performPrefixedCommand(s.createCommandSourceStack(), "fill 1 103 2 3 103 5 minecraft:air");
        });
        context.waitTicks(5);
    }

    // ---------------------------------------------------------------- S13 storage

    private void storage(ClientGameTestContext context, TestDedicatedServerContext ds) throws Throwable {
        Spike3Mule.OPENS.clear();
        ds.runCommand("tp @a 0.5 100 0.5 0 0");
        int id = ds.computeOnServer(s -> spawn(s, Spike3Mod.mule, 0.5, 100, 2.5, 180, false).getId());
        context.waitFor(m -> client(m, id) != null, 100);
        context.waitTicks(5);
        // Mount by a real interaction (empty hand; msm:rideable with saddle false).
        context.runOnClient(m -> {
            Entity e = client(m, id);
            m.gameMode.interact(m.player, e, new EntityHitResult(e), InteractionHand.MAIN_HAND);
        });
        context.waitTicks(10);
        r.put("S13.storage.mounted", context.computeOnClient(m -> "client passenger " + m.player.isPassenger() + " vehicle "
                + (m.player.getVehicle() == null ? null : m.player.getVehicle().getClass().getSimpleName())
                + " serverControlledInventory " + m.gameMode.isServerControlledInventory()));
        if (!context.computeOnClient(m -> m.player.isPassenger())) {
            ds.runOnServer(s -> player(s).startRiding(s.overworld().getEntity(id), true, true));
            context.waitTicks(10);
            r.put("S13.storage.mountedByServer", context.computeOnClient(m -> "client passenger " + m.player.isPassenger()));
        }
        context.getInput().pressKey(o -> o.keyInventory);
        context.waitFor(m -> m.gui.screen() != null, 40);
        context.waitTicks(5);
        r.put("S13.storage.keyWhileRiding", context.computeOnClient(m -> screen(m) + " menu " + m.player.containerMenu.getClass().getSimpleName()));
        context.runOnClient(m -> m.gui.toastManager().clear());
        context.waitTicks(2);
        r.put("S13.storage.shot", context.takeScreenshot("b469_mule_inventory_" + mc).toString());
        context.runOnClient(m -> m.player.closeContainer());
        context.waitTicks(5);
        ds.runOnServer(s -> player(s).stopRiding());
        context.waitTicks(10);
        context.getInput().pressKey(o -> o.keyInventory);
        context.waitFor(m -> m.gui.screen() != null, 40);
        r.put("S13.storage.keyNotRiding", context.computeOnClient(Spike3ClientGameTest::screen));
        context.runOnClient(m -> m.gui.setScreen(null));
        context.waitTicks(5);
        // Control: riding a runtime mob without HasCustomInventoryScreen.
        int pair = ds.computeOnServer(s -> {
            @SuppressWarnings("unchecked")
            EntityType<Mob> type = (EntityType<Mob>) BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.fromNamespaceAndPath("msm_test", "rd_pair"));
            Mob mob = spawn(s, type, 3.5, 100, 2.5, 180, true);
            player(s).startRiding(mob, true, true);
            return mob.getId();
        });
        context.waitTicks(10);
        context.getInput().pressKey(o -> o.keyInventory);
        context.waitFor(m -> m.gui.screen() != null, 40);
        r.put("S13.storage.keyRidingPlainMob", context.computeOnClient(m -> "passenger " + m.player.isPassenger() + " screen " + screen(m)));
        context.runOnClient(m -> m.gui.setScreen(null));
        ds.runOnServer(s -> {
            player(s).stopRiding();
            s.overworld().getEntity(pair).discard();
            s.overworld().getEntity(id).discard();
        });
        context.waitTicks(5);
        r.put("S13.storage.opens", new ArrayList<>(Spike3Mule.OPENS));
    }

    // ---------------------------------------------------------------- S13 shoulder

    private String petMode = "passenger";
    private int petId = -1;
    private UUID petUuid;

    /** Puts the pet on the player's shoulder in the current mode; runs on the server thread. */
    private String attach(ServerPlayer p, Spike3Pet pet) {
        if (petMode.equals("passenger")) {
            boolean vanilla = pet.startRiding(p, true, true);
            String forced = vanilla ? "" : " then " + Spike3Pet.forceRide(pet, p);
            return "startRiding(player, force, events)=" + vanilla + forced;
        }
        pet.stopRiding();
        pet.setPerched(true);
        return "perched (follow mode)";
    }

    private boolean onShoulderServer(ServerPlayer p, Entity pet) {
        return petMode.equals("passenger") ? pet.getVehicle() == p : pet instanceof Spike3Pet sp && sp.perched();
    }

    private Map<String, Object> sample(ClientGameTestContext context, TestDedicatedServerContext ds, String label, int ticks,
            Runnable perTick) {
        List<Double> clientErr = new ArrayList<>();
        List<Double> serverErr = new ArrayList<>();
        List<Double> clientStep = new ArrayList<>();
        List<String> rows = new ArrayList<>();
        double[] lastErr = {Double.NaN};
        for (int i = 0; i < ticks; i++) {
            if (perTick != null) {
                perTick.run();
            }
            context.waitTick();
            String c = context.computeOnClient(m -> {
                Entity pet = client(m, petId);
                Player p = m.player;
                if (pet == null) {
                    return "client pet null";
                }
                Vec3 off = pet.position().subtract(p.position());
                Vec3 exp = Spike3Pet.shoulderOffset(p.yBodyRot);
                return off.subtract(exp).length() + "|" + "vehicle=" + (pet.getVehicle() == p) + " off=" + v(off) + " exp=" + v(exp)
                        + " bodyYaw=" + String.format("%.1f", p.yBodyRot) + " headYaw=" + String.format("%.1f", p.getYHeadRot())
                        + " petYaw=" + String.format("%.1f", pet.getYRot()) + " petBody=" + String.format("%.1f", ((Mob) pet).yBodyRot)
                        + " crouch=" + p.isCrouching() + " h=" + String.format("%.2f", p.getBbHeight()) + " ground=" + p.onGround();
            });
            String sv = ds.computeOnServer(s -> {
                ServerPlayer p = player(s);
                Entity pet = p.level().getEntity(petId);
                if (pet == null) {
                    return "server pet null";
                }
                Vec3 off = pet.position().subtract(p.position());
                Vec3 exp = Spike3Pet.shoulderOffset(p.yBodyRot);
                return off.subtract(exp).length() + "|" + "onShoulder=" + onShoulderServer(p, pet) + " off=" + v(off)
                        + " bodyYaw=" + String.format("%.1f", p.yBodyRot) + " petYaw=" + String.format("%.1f", pet.getYRot());
            });
            if (c.contains("|")) {
                double e = Double.parseDouble(c.substring(0, c.indexOf('|')));
                clientErr.add(e);
                if (!Double.isNaN(lastErr[0])) {
                    clientStep.add(Math.abs(e - lastErr[0]));
                }
                lastErr[0] = e;
            }
            if (sv.contains("|")) {
                serverErr.add(Double.parseDouble(sv.substring(0, sv.indexOf('|'))));
            }
            rows.add("t" + i + " C " + c + " || S " + sv);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("clientMaxErr", clientErr.stream().mapToDouble(d -> d).max().orElse(-1));
        out.put("clientMeanErr", clientErr.stream().mapToDouble(d -> d).average().orElse(-1));
        out.put("clientMaxErrJump", clientStep.stream().mapToDouble(d -> d).max().orElse(-1));
        out.put("serverMaxErr", serverErr.stream().mapToDouble(d -> d).max().orElse(-1));
        out.put("serverMeanErr", serverErr.stream().mapToDouble(d -> d).average().orElse(-1));
        out.put("rows", rows);
        r.put("S13." + petMode + ".sample." + label, out);
        return out;
    }

    private String petState(TestDedicatedServerContext ds) {
        return ds.computeOnServer(s -> {
            List<String> where = new ArrayList<>();
            for (ServerLevel level : s.getAllLevels()) {
                Entity e = petUuid == null ? null : level.getEntity(petUuid);
                if (e != null) {
                    where.add(level.dimension().identifier() + " id " + e.getId() + " pos " + v(e.position()) + " removed "
                            + e.getRemovalReason() + " vehicle " + (e.getVehicle() == null ? null : e.getVehicle().getName().getString())
                            + " perched " + (e instanceof Spike3Pet sp && sp.perched()) + " shouldBeSaved " + e.shouldBeSaved());
                }
            }
            if (s.getPlayerList().getPlayers().isEmpty()) {
                return "no player | pet " + where;
            }
            ServerPlayer p = player(s);
            return "player " + p.level().dimension().identifier() + " " + v(p.position()) + " passengers "
                    + p.getPassengers().stream().map(e -> e.getType().toShortString() + "#" + e.getId()).toList() + " | pet " + where;
        });
    }

    private void shoulder(ClientGameTestContext context, TestDedicatedServerContext ds) throws Throwable {
        String m = petMode;
        Spike3Pet.turnWithOwner = false;
        ds.runCommand("tp @a 0.5 100 0.5 0 0");
        context.getInput().lookAt(0, 0);
        context.waitTicks(5);
        int[] got = new int[1];
        String mount = ds.computeOnServer(s -> {
            ServerPlayer p = player(s);
            Spike3Pet pet = spawn(s, Spike3Mod.pet, 1.5, 100, 1.5, 0, false);
            pet.tame(p);
            petUuid = pet.getUUID();
            got[0] = pet.getId();
            String how = attach(p, pet);
            return how + " | vehicle " + (pet.getVehicle() == p) + " passengers " + p.getPassengers().size()
                    + " pos " + v(pet.position()) + " player " + v(p.position()) + " shouldBeSaved " + pet.shouldBeSaved();
        });
        petId = got[0];
        r.put("S13." + m + ".mount", mount);
        context.waitTicks(10);
        r.put("S13." + m + ".clientAfterMount", context.computeOnClient(mc -> {
            Entity pet = client(mc, petId);
            return pet == null ? "client has no pet" : "client vehicle " + (pet.getVehicle() == null ? null : pet.getVehicle().getClass().getSimpleName())
                    + " localPlayerPassengers " + mc.player.getPassengers().size() + " off " + v(pet.position().subtract(mc.player.position()))
                    + " perched " + ((Spike3Pet) pet).perched() + " owner " + ((Spike3Pet) pet).ownerEntity();
        }));
        if (m.equals("passenger")) {
            boolean clientKnows = context.computeOnClient(mc -> client(mc, petId) != null && client(mc, petId).getVehicle() == mc.player);
            r.put("S13.passenger.clientKnowsWithoutHelp", clientKnows);
            if (!clientKnows) {
                ds.runOnServer(s -> player(s).connection.send(new ClientboundSetPassengersPacket(player(s))));
                context.waitTicks(5);
                r.put("S13.passenger.clientAfterOwnPacket", context.computeOnClient(mc -> client(mc, petId) != null
                        && client(mc, petId).getVehicle() == mc.player));
            }
        }
        sample(context, ds, "standing", 10, null);
        // Third-person pictures.
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT));
        context.waitTicks(5);
        r.put("S13." + m + ".shotFront", context.takeScreenshot("b469_shoulder_" + m + "_front_" + mc).toString());
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.THIRD_PERSON_BACK));
        context.waitTicks(5);
        r.put("S13." + m + ".shotBack", context.takeScreenshot("b469_shoulder_" + m + "_back_" + mc).toString());
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.FIRST_PERSON));
        context.getInput().lookAt(-60, 30);
        context.waitTicks(5);
        r.put("S13." + m + ".shotFirst", context.takeScreenshot("b469_shoulder_" + m + "_first_person_" + mc).toString());
        r.put("S13." + m + ".crosshairWhileLookingAtShoulder", context.computeOnClient(mc -> String.valueOf(mc.hitResult == null ? null
                : mc.hitResult instanceof EntityHitResult e ? "entity " + e.getEntity().getId() : mc.hitResult.getType())));
        context.getInput().lookAt(0, 0);
        // Turning: the head turns 9 degrees a tick, standing still (the body follows with vanilla's lag).
        float[] yaw = {0};
        sample(context, ds, "turning", 30, () -> {
            if (yaw[0] < 180) {
                yaw[0] += 9;
                context.getInput().lookAt(yaw[0], 0);
            }
        });
        Spike3Pet.turnWithOwner = true;
        sample(context, ds, "turningWithYawCopy", 30, () -> {
            if (yaw[0] > 0) {
                yaw[0] -= 9;
                context.getInput().lookAt(yaw[0], 0);
            }
        });
        r.put("S13." + m + ".shotTurned", context.takeScreenshot("b469_shoulder_" + m + "_turned_" + mc).toString());
        // Walking forward (south, +z) and sideways, sprint jumping; the pad reaches z = 40.
        context.getInput().holdKey(o -> o.keyUp);
        sample(context, ds, "walking", 20, null);
        context.getInput().releaseKey(o -> o.keyUp);
        context.getInput().holdKey(o -> o.keyRight);
        sample(context, ds, "strafing", 10, null);
        context.getInput().releaseKey(o -> o.keyRight);
        context.getInput().holdKey(o -> o.keyUp);
        context.getInput().holdKey(o -> o.keySprint);
        sample(context, ds, "sprintJumping", 15, () -> context.getInput().pressKey(o -> o.keyJump));
        context.getInput().releaseKey(o -> o.keySprint);
        context.getInput().releaseKey(o -> o.keyUp);
        context.waitTicks(10);
        // Sneaking: vanilla does nothing to a player's passengers; the player is shorter.
        context.getInput().holdKey(o -> o.keyShift);
        sample(context, ds, "sneaking", 10, null);
        r.put("S13." + m + ".whileSneaking", petState(ds));
        context.getInput().releaseKey(o -> o.keyShift);
        context.waitTicks(5);
        // Damage: vanilla keeps the passenger; our own stopRiding then decides where it lands.
        ds.runOnServer(s -> {
            ServerPlayer p = player(s);
            p.setGameMode(GameType.SURVIVAL);
            p.hurtServer(p.level(), p.damageSources().generic(), 1.0f);
        });
        context.waitTicks(5);
        r.put("S13." + m + ".afterDamageNoReaction", petState(ds));
        r.put("S13." + m + ".dismount", ds.computeOnServer(s -> {
            ServerPlayer p = player(s);
            Entity pet = p.level().getEntity(petId);
            if (petMode.equals("passenger")) {
                Vec3 loc = p.getDismountLocationForPassenger((Mob) pet);
                pet.stopRiding();
                return "right after stopRiding: " + v(pet.position()) + " player " + v(p.position()) + " dismountLocation " + v(loc);
            }
            ((Spike3Pet) pet).setPerched(false);
            return "unperched at " + v(pet.position()) + " player " + v(p.position());
        }));
        context.waitTicks(20);
        r.put("S13." + m + ".afterDismount20", petState(ds));
        r.put("S13." + m + ".clientAfterDismount", context.computeOnClient(mc -> {
            Entity pet = client(mc, petId);
            return pet == null ? "null" : "vehicle " + pet.getVehicle() + " off " + v(pet.position().subtract(mc.player.position()));
        }));
        ds.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
        // Remount, then a same-dimension teleport.
        remount(context, ds);
        ds.runCommand("tp @a 12.5 100 0.5 0 0");
        context.waitTicks(10);
        r.put("S13." + m + ".afterTpSameDimension", petState(ds));
        r.put("S13." + m + ".clientAfterTp", context.computeOnClient(mc -> {
            Entity pet = client(mc, petId);
            return pet == null ? "null" : "vehicle " + (pet.getVehicle() == mc.player) + " off " + v(pet.position().subtract(mc.player.position()));
        }));
        ds.runCommand("tp @a 0.5 100 0.5 0 0");
        context.waitTicks(10);
        r.put("S13." + m + ".afterTpBack", petState(ds));
        // The owner rides a mob.
        remount(context, ds);
        int mule = ds.computeOnServer(s -> {
            Mob mob = spawn(s, Spike3Mod.mule, 0.5, 100, 2.5, 0, true);
            boolean ok = player(s).startRiding(mob, true, true);
            return ok ? mob.getId() : -mob.getId();
        });
        context.waitTicks(10);
        r.put("S13." + m + ".ownerRidesMule", mule + " " + petState(ds));
        sample(context, ds, "ownerOnMule", 5, null);
        ds.runOnServer(s -> {
            player(s).stopRiding();
            Entity mob = s.overworld().getEntity(Math.abs(mule));
            if (mob != null) {
                mob.discard();
            }
        });
        context.waitTicks(5);
        Spike3Pet.turnWithOwner = false;
    }

    private void remount(ClientGameTestContext context, TestDedicatedServerContext ds) {
        String state = ds.computeOnServer(s -> {
            ServerPlayer p = player(s);
            Entity pet = null;
            for (ServerLevel level : s.getAllLevels()) {
                if (petUuid != null && level.getEntity(petUuid) != null) {
                    pet = level.getEntity(petUuid);
                }
            }
            String fresh = "";
            if (pet == null || pet.level() != p.level()) {
                Spike3Pet made = spawn(s, Spike3Mod.pet, p.getX() + 1, p.getY(), p.getZ(), 0, false);
                made.tame(p);
                petUuid = made.getUUID();
                pet = made;
                fresh = "fresh pet; ";
            }
            petId = pet.getId();
            if (!onShoulderServer(p, pet)) {
                pet.teleportTo(p.getX() + 1, p.getY(), p.getZ());
                return fresh + "remount " + attach(p, (Spike3Pet) pet);
            }
            return fresh + "already on the shoulder";
        });
        context.waitTicks(10);
        r.put("S13." + petMode + ".remount." + System.nanoTime(), state + " | " + petState(ds));
    }

    private void dimension(ClientGameTestContext context, TestDedicatedServerContext ds) throws Throwable {
        String m = petMode;
        remount(context, ds);
        r.put("S13." + m + ".dimension.before", petState(ds));
        ds.runCommand("execute in minecraft:the_nether run tp @a 0.5 120 0.5");
        context.waitFor(mc -> mc.level != null && mc.level.dimension() == Level.NETHER, 200);
        ds.runCommand("execute in minecraft:the_nether run fill -3 119 -3 3 119 3 minecraft:obsidian");
        ds.runCommand("execute in minecraft:the_nether run fill -3 120 -3 3 123 3 minecraft:air");
        ds.runCommand("execute in minecraft:the_nether run tp @a 0.5 120 0.5");
        context.waitTicks(20);
        r.put("S13." + m + ".dimension.afterToNether", petState(ds));
        r.put("S13." + m + ".dimension.clientInNether", context.computeOnClient(mc -> mc.level.dimension().identifier() + " pets near "
                + mc.level.getEntitiesOfClass(Spike3Pet.class, mc.player.getBoundingBox().inflate(16)).size()
                + " localPassengers " + mc.player.getPassengers().size()));
        ds.runCommand("execute in minecraft:overworld run tp @a 0.5 100 0.5");
        context.waitFor(mc -> mc.level != null && mc.level.dimension() == Level.OVERWORLD, 200);
        context.waitTicks(20);
        r.put("S13." + m + ".dimension.afterBack", petState(ds));
    }

    private void afterDisconnect(ClientGameTestContext context, TestDedicatedServerContext ds) throws Throwable {
        String m = petMode;
        r.put("S13." + m + ".disconnect.serverRightAfter", petState(ds));
        TestDedicatedServerConnection again = ds.connect();
        try {
            again.waitForChunksRender();
            context.waitTicks(20);
            r.put("S13." + m + ".disconnect.afterReconnect", petState(ds));
            r.put("S13." + m + ".disconnect.clientAfterReconnect", context.computeOnClient(mc -> "pets near "
                    + mc.level.getEntitiesOfClass(Spike3Pet.class, mc.player.getBoundingBox().inflate(16)).stream()
                    .map(p -> p.getId() + " vehicle " + (p.getVehicle() == mc.player) + " perched " + p.perched()
                            + " off " + v(p.position().subtract(mc.player.position()))).toList()));
            // Clear every pet before the next mode.
            ds.runCommand("kill @e[type=msm_spike3:pet]");
            context.waitTicks(5);
        } finally {
            again.close();
        }
    }
}
