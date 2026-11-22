package dev.mcsupermods.runtime.gametest.spike4;

import static dev.mcsupermods.runtime.gametest.spike4.B524Help.R;

import dev.mcsupermods.runtime.registry.MsmMob;
import io.netty.buffer.Unpooled;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundMerchantOffersPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.gossip.GossipType;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerProfession;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.ItemCost;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.Vec3;

/**
 * B524 spike (throwaway), X15 and X16: vanilla's villager price after hits and trades (reputation, observed through its
 * public calls and its own menu), a project trader's price with a special price set by our code (menu, the packet the
 * player is sent, the network codec), a per-player reputation attachment saved with the mob, and vanilla's demand rule
 * on a villager's offer and on a project offer.
 */
public class X15X16TradeGameTest {
    static final String YARD = "msm_runtime_gametest:b524_yard";

    static List<String> costs(MerchantOffers offers) {
        List<String> out = new ArrayList<>();
        for (MerchantOffer o : offers) {
            out.add(o.getCostA().getCount() + " " + BuiltInRegistries.ITEM.getKey(o.getCostA().getItem()).getPath() + " (base "
                    + o.getBaseCostA().getCount() + ", special " + o.getSpecialPriceDiff() + ", demand " + o.getDemand() + ", x"
                    + o.getPriceMultiplier() + ", uses " + o.getUses() + "/" + o.getMaxUses() + ")");
        }
        return out;
    }

    static MerchantMenu open(ServerPlayer player, PathfinderMob mob) {
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        player.interactOn(mob, InteractionHand.MAIN_HAND, Vec3.ZERO);
        return player.containerMenu instanceof MerchantMenu m ? m : null;
    }

    static Villager farmer(GameTestHelper helper, BlockPos at) {
        ServerLevel level = helper.getLevel();
        Villager v = helper.spawn(EntityTypes.VILLAGER, at);
        v.setVillagerData(v.getVillagerData().withProfession(level.registryAccess(), VillagerProfession.FARMER).withLevel(1));
        v.setNoAi(true);
        MerchantOffers offers = v.getOffers();
        offers.clear();
        offers.add(new MerchantOffer(new ItemCost(Items.EMERALD, 10), new ItemStack(Items.BREAD), 12, 2, 0.05f));
        offers.add(new MerchantOffer(new ItemCost(Items.EMERALD, 20), new ItemStack(Items.COOKED_BEEF), 12, 2, 0.2f));
        offers.add(new MerchantOffer(new ItemCost(Items.WHEAT, 20), new ItemStack(Items.EMERALD), 16, 2, 0.05f));
        return v;
    }

    @GameTest(structure = YARD, maxTicks = 300)
    public void x15VanillaReputation(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        Map<String, Object> types = new LinkedHashMap<>();
        for (GossipType g : GossipType.values()) {
            types.put(g.id, "weight " + g.weight + " max " + g.max + " decayPerDay " + g.decayPerDay + " decayPerTransfer " + g.decayPerTransfer);
        }
        m.put("gossipTypes", types);
        m.put("constants", "per event " + GossipType.REPUTATION_CHANGE_PER_EVENT + ", everlasting " + GossipType.REPUTATION_CHANGE_PER_EVERLASTING_MEMORY
                + ", per trade " + GossipType.REPUTATION_CHANGE_PER_TRADE);
        Villager v = farmer(helper, new BlockPos(8, 1, 8));
        ServerPlayer p = B524Help.player(helper, new BlockPos(8, 1, 6), GameType.SURVIVAL);
        List<String> steps = new ArrayList<>();
        Runnable look = () -> {
            MerchantMenu menu = open(p, v);
            steps.add("rep " + v.getPlayerReputation(p) + " menu " + (menu != null) + " " + (menu == null ? "" : costs(menu.getOffers())));
            p.closeContainer();
            steps.add("  after close " + costs(v.getOffers()));
        };
        steps.add("start");
        look.run();
        int[] tick = {0};
        int[] hits = {0};
        helper.onEachTick(() -> {
            tick[0]++;
            if (tick[0] % 15 == 0 && hits[0] < 5) {
                R.section("X15.vanilla.hit", () -> {
                    boolean hurt = v.hurtServer(level, level.damageSources().playerAttack(p), 1.0f);
                    v.setHealth(v.getMaxHealth());
                    hits[0]++;
                    steps.add("hit " + hits[0] + " hurt " + hurt);
                    look.run();
                });
            }
        });
        helper.runAfterDelay(100, () -> R.section("X15.vanilla.trades", () -> {
            for (int k = 1; k <= 6; k++) {
                MerchantMenu menu = open(p, v);
                menu.setSelectionHint(0);
                menu.getSlot(0).set(new ItemStack(Items.EMERALD, 64));
                menu.slotsChanged(menu.getSlot(0).container);
                menu.clicked(2, 0, net.minecraft.world.inventory.ContainerInput.PICKUP, p);
                p.closeContainer();
                steps.add("menu trade " + k + " rep " + v.getPlayerReputation(p) + " carried " + p.containerMenu.getCarried() + " uses " + v.getOffers().get(0).getUses());
                p.containerMenu.setCarried(ItemStack.EMPTY);
            }
            for (int k = 1; k <= 3; k++) {
                level.onReputationEvent(net.minecraft.world.entity.ai.village.ReputationEventType.TRADE, p, v);
                steps.add("TRADE event " + k + " rep " + v.getPlayerReputation(p));
            }
            level.onReputationEvent(net.minecraft.world.entity.ai.village.ReputationEventType.ZOMBIE_VILLAGER_CURED, p, v);
            steps.add("CURED event rep " + v.getPlayerReputation(p));
            steps.add("after 6 trades");
            TagValueOutput gout = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
            v.saveWithoutId(gout);
            m.put("savedGossips", String.valueOf(gout.buildResult().get("Gossips")));
            look.run();
            ServerPlayer other = B524Help.player(helper, new BlockPos(6, 1, 6), GameType.SURVIVAL);
            MerchantMenu otherMenu = open(other, v);
            steps.add("another player: rep " + v.getPlayerReputation(other) + " " + (otherMenu == null ? "no menu" : costs(otherMenu.getOffers())));
            other.closeContainer();
            other.discard();
            p.discard();
            m.put("steps", steps);
            R.put("X15.vanilla", m);
            helper.succeed();
        }));
    }

    @GameTest(structure = YARD, maxTicks = 100)
    public void x15ProjectPrice(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        R.section("X15.project", () -> {
            EntityType<?> type = BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.fromNamespaceAndPath("msm_test", "trader_basic"));
            PathfinderMob trader = (PathfinderMob) helper.spawn(type, new BlockPos(8, 1, 8));
            try (B524Help.Ears ears = new B524Help.Ears(helper, new BlockPos(8, 1, 6), GameType.SURVIVAL, "Ann")) {
                MerchantMenu menu = open(ears.player, trader);
                m.put("menu", menu != null);
                MerchantOffers offers = ((MsmMob) trader).driver().trader().getOffers();
                m.put("sameOffers", menu != null && menu.getOffers() == offers);
                m.put("base", costs(offers));
                for (int diff : new int[] {-5, -1, 2, 3}) {
                    offers.forEach(o -> o.setSpecialPriceDiff(diff));
                    m.put("diff " + diff, costs(offers));
                }
                offers.forEach(o -> o.setSpecialPriceDiff(3));
                ears.packets();
                ears.player.sendMerchantOffers(menu.containerId, offers, 1, 0, true, true);
                List<String> sent = new ArrayList<>();
                for (Packet<?> packet : ears.packets()) {
                    if (packet instanceof ClientboundMerchantOffersPacket mp) {
                        sent.add("container " + mp.getContainerId() + " " + costs(mp.getOffers()));
                    }
                }
                m.put("packet", sent);
                RegistryFriendlyByteBuf buf = new RegistryFriendlyByteBuf(Unpooled.buffer(), level.registryAccess());
                MerchantOffers.STREAM_CODEC.encode(buf, offers);
                m.put("streamCodecRoundTrip", costs(MerchantOffers.STREAM_CODEC.decode(buf)));
                Object saved = MerchantOffers.CODEC.encodeStart(level.registryAccess().createSerializationContext(NbtOps.INSTANCE), offers)
                        .getOrThrow();
                m.put("codecSaved", saved.toString());
                ears.player.closeContainer();
                m.put("afterClose", costs(offers));
            }
            // A per-trader, per-player store of our own: a persistent Fabric attachment on the mob, saved and loaded with it.
            UUID ann = UUID.nameUUIDFromBytes("Ann".getBytes());
            trader.setAttached(B524Mod.REPUTATION, Map.of(ann, -25));
            TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
            trader.saveWithoutId(out);
            CompoundTag tag = out.buildResult();
            m.put("savedAttachments", String.valueOf(tag.get("fabric:attachments")));
            PathfinderMob copy = (PathfinderMob) type.create(level, EntitySpawnReason.LOAD);
            copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
            m.put("loadedReputation", String.valueOf(copy.getAttached(B524Mod.REPUTATION)));
        });
        R.put("X15.project", m);
        helper.succeed();
    }

    @GameTest(structure = YARD, maxTicks = 100)
    public void x16Demand(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        R.section("X16.vanilla", () -> {
            Villager v = farmer(helper, new BlockPos(8, 1, 8));
            ServerPlayer p = B524Help.player(helper, new BlockPos(8, 1, 6), GameType.SURVIVAL);
            List<String> steps = new ArrayList<>();
            int[] uses = {12, 12, 0, 0, 6, 12, 12, 12};
            for (int cycle = 0; cycle < uses.length; cycle++) {
                for (MerchantOffer o : v.getOffers()) {
                    for (int u = 0; u < Math.min(uses[cycle], o.getMaxUses()); u++) {
                        o.increaseUses();
                    }
                }
                boolean should = v.shouldRestock(level);
                v.restock();
                MerchantMenu menu = open(p, v);
                steps.add("cycle " + (cycle + 1) + " used " + uses[cycle] + " shouldRestock " + should + " -> "
                        + (menu == null ? costs(v.getOffers()) : costs(menu.getOffers())));
                p.closeContainer();
            }
            m.put("vanillaRestock", steps);
            p.discard();
        });
        R.section("X16.project", () -> {
            EntityType<?> type = BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.fromNamespaceAndPath("msm_test", "trader_basic"));
            PathfinderMob trader = (PathfinderMob) helper.spawn(type, new BlockPos(4, 1, 4));
            MerchantOffers offers = ((MsmMob) trader).driver().trader().getOffers();
            List<String> steps = new ArrayList<>();
            steps.add("drawn " + costs(offers));
            for (int cycle = 1; cycle <= 4; cycle++) {
                for (MerchantOffer o : offers) {
                    while (!o.isOutOfStock()) {
                        o.increaseUses();
                    }
                    o.updateDemand();
                    o.resetUses();
                }
                steps.add("heavy cycle " + cycle + " -> " + costs(offers));
            }
            for (int cycle = 1; cycle <= 3; cycle++) {
                for (MerchantOffer o : offers) {
                    o.updateDemand();
                    o.resetUses();
                }
                steps.add("idle cycle " + cycle + " -> " + costs(offers));
            }
            m.put("projectRestock", steps);
            RegistryFriendlyByteBuf buf = new RegistryFriendlyByteBuf(Unpooled.buffer(), level.registryAccess());
            for (MerchantOffer o : offers) {
                for (int u = 0; u < o.getMaxUses(); u++) {
                    o.increaseUses();
                }
                o.updateDemand();
                o.resetUses();
            }
            MerchantOffers.STREAM_CODEC.encode(buf, offers);
            m.put("beforeRoundTrip", costs(offers));
            m.put("streamCodecRoundTrip", costs(MerchantOffers.STREAM_CODEC.decode(buf)));
            var ops = level.registryAccess().createSerializationContext(NbtOps.INSTANCE);
            Object saved = MerchantOffers.CODEC.encodeStart(ops, offers).getOrThrow();
            m.put("codecSaved", saved.toString());
            m.put("codecRoundTrip", costs(MerchantOffers.CODEC.parse(ops, (net.minecraft.nbt.Tag) saved).getOrThrow()));
        });
        R.put("X16", m);
        helper.succeed();
    }
}
