package dev.mcsupermods.runtime.gametest.spike3;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.PoiTypeTags;
import net.minecraft.util.ProblemReporter;
import net.minecraft.util.Unit;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.ai.village.poi.PoiTypes;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerProfession;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.item.trading.TradeSet;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** B469 spike (throwaway): S11 and S12 on the GameTest server. Records into {@code msm-spike3/server-<mc>.json}. */
public class Spike3GameTest {
    private static final Spike3Results R = new Spike3Results("server");
    private static final BlockPos MID = new BlockPos(1, 2, 1);

    static String offer(MerchantOffer o) {
        return o.getCostA().getCount() + " " + BuiltInRegistries.ITEM.getKey(o.getCostA().getItem())
                + (o.getCostB().isEmpty() ? "" : " + " + o.getCostB().getCount() + " " + BuiltInRegistries.ITEM.getKey(o.getCostB().getItem()))
                + " -> " + o.getResult().getCount() + " " + BuiltInRegistries.ITEM.getKey(o.getResult().getItem())
                + (o.getResult().getComponentsPatch().isEmpty() ? "" : " " + o.getResult().getComponentsPatch())
                + " uses " + o.getUses() + "/" + o.getMaxUses() + " xp " + o.getXp();
    }

    static List<String> offers(MerchantOffers offers) {
        List<String> out = new ArrayList<>();
        for (MerchantOffer o : offers) {
            out.add(offer(o));
        }
        return out;
    }

    static ResourceKey<TradeSet> vanilla(String path) {
        return ResourceKey.create(Registries.TRADE_SET, Identifier.withDefaultNamespace(path));
    }

    @GameTest(maxTicks = 40)
    public void s11TradeSetsAndLootContext(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Spike3Trader trader = helper.spawnWithNoFreeWill(Spike3Mod.trader, MID);
        Villager villager = helper.spawnWithNoFreeWill(EntityTypes.VILLAGER, MID.east(2));
        R.put("S11.init", new ArrayList<>(Spike3Mod.INIT));
        List<ResourceKey<TradeSet>> sets = List.of(vanilla("farmer/level_1"), vanilla("librarian/level_1"),
                vanilla("fletcher/level_5"), vanilla("cartographer/level_2"), vanilla("wandering_trader/common"),
                vanilla("wandering_trader/buying"), vanilla("armorer/level_5"), Spike3Mod.tradeSet("trader/level_1"),
                Spike3Mod.tradeSet("trader/level_2"), Spike3Mod.tradeSet("spike_job/level_1"),
                Spike3Mod.tradeSet("spike_job/level_3"));
        for (ResourceKey<TradeSet> key : sets) {
            for (var self : List.of(trader, villager)) {
                String who = self == trader ? "projectMob" : "villager";
                R.section("S11.draw." + key.identifier() + "." + who, () -> {
                    MerchantOffers out = new MerchantOffers();
                    List<String> dropped = new ArrayList<>();
                    long t0 = System.nanoTime();
                    int n = Spike3Trader.addOffersFromTradeSet(level, self, out, key, dropped);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("added", n);
                    m.put("ms", (System.nanoTime() - t0) / 1_000_000);
                    m.put("offers", offers(out));
                    m.put("dropped", dropped);
                    R.put("S11.draw." + key.identifier() + "." + who, m);
                });
            }
        }
        // Which parameters VILLAGER_TRADE requires: leave each out once.
        R.put("S11.paramSet.required", LootContextParamSets.VILLAGER_TRADE.required().stream().map(k -> k.name().toString()).sorted().toList());
        R.put("S11.paramSet.allowed", LootContextParamSets.VILLAGER_TRADE.allowed().stream().map(k -> k.name().toString()).sorted().toList());
        for (String leaveOut : List.of("origin", "this_entity", "additional_cost_component_allowed")) {
            try {
                LootParams.Builder b = new LootParams.Builder(level);
                if (!leaveOut.equals("origin")) {
                    b.withParameter(LootContextParams.ORIGIN, trader.position());
                }
                if (!leaveOut.equals("this_entity")) {
                    b.withParameter(LootContextParams.THIS_ENTITY, trader);
                }
                if (!leaveOut.equals("additional_cost_component_allowed")) {
                    b.withParameter(LootContextParams.ADDITIONAL_COST_COMPONENT_ALLOWED, Unit.INSTANCE);
                }
                b.create(LootContextParamSets.VILLAGER_TRADE);
                R.put("S11.without." + leaveOut, "created");
            } catch (Throwable t) {
                R.put("S11.without." + leaveOut, t.toString());
            }
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 60)
    @SuppressWarnings("removal")
    public void s11MockPlayerTradesLevelsAndRestocks(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Spike3Trader.EVENTS.clear();
        Spike3Trader trader = helper.spawnWithNoFreeWill(Spike3Mod.trader, MID);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(MID.east(2))));
        player.setGameMode(GameType.SURVIVAL);
        var result = player.interactOn(trader, InteractionHand.MAIN_HAND, trader.position());
        R.put("S11.mock.interactResult", String.valueOf(result));
        R.put("S11.mock.menu", player.containerMenu.getClass().getName());
        if (!(player.containerMenu instanceof MerchantMenu menu)) {
            R.put("S11.mock.events", new ArrayList<>(Spike3Trader.EVENTS));
            helper.fail("no merchant menu: " + player.containerMenu);
            return;
        }
        R.put("S11.mock.menuState", "offers " + menu.getOffers().size() + " showProgressBar " + menu.showProgressBar()
                + " level " + menu.getTraderLevel() + " xp " + menu.getTraderXp() + " canRestock " + menu.canRestock());
        R.put("S11.mock.offersBefore", offers(trader.getOffers()));
        int dirtIndex = -1;
        for (int i = 0; i < trader.getOffers().size(); i++) {
            if (trader.getOffers().get(i).getCostA().is(Items.DIRT)) {
                dirtIndex = i;
            }
        }
        if (dirtIndex < 0) {
            helper.fail("no dirt offer in " + offers(trader.getOffers()));
            return;
        }
        // Trade 1: one dirt for an emerald (xp 10 = level 1's threshold).
        menu.setSelectionHint(dirtIndex);
        menu.getSlot(0).set(new ItemStack(Items.DIRT, 5));
        R.put("S11.mock.resultSlot", String.valueOf(menu.getSlot(2).getItem()));
        menu.quickMoveStack(player, 2);
        R.put("S11.mock.afterTrade1", "trader level " + trader.traderLevel() + " xp " + trader.getVillagerXp()
                + " offers " + offers(trader.getOffers()) + " player emeralds " + player.getInventory().countItem(Items.EMERALD)
                + " orbs " + level.getEntitiesOfClass(ExperienceOrb.class, new AABB(trader.blockPosition()).inflate(4)).size());
        // Trade 2: uses the dirt offer up (max_uses 2).
        menu.updateSellItem();
        R.put("S11.mock.resultSlot2", String.valueOf(menu.getSlot(2).getItem()));
        menu.quickMoveStack(player, 2);
        MerchantOffer dirt = trader.getOffers().get(dirtIndex);
        R.put("S11.mock.afterTrade2", "outOfStock " + dirt.isOutOfStock() + " " + offer(dirt) + " needsRestock " + dirt.needsRestock());
        menu.updateSellItem();
        R.put("S11.mock.resultSlotWhenOut", String.valueOf(menu.getSlot(2).getItem()));
        trader.restock();
        R.put("S11.mock.afterRestock", "outOfStock " + dirt.isOutOfStock() + " " + offer(dirt));
        // Saving and loading through the entity's own save data.
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        trader.saveWithoutId(out);
        CompoundTag tag = out.buildResult();
        R.put("S11.save.keys", String.valueOf(tag.keySet().stream().sorted().toList()));
        R.put("S11.save.offersTag", String.valueOf(tag.get("Offers")));
        Spike3Trader copy = Spike3Mod.trader.create(level, EntitySpawnReason.LOAD);
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
        R.put("S11.save.loaded", "level " + copy.traderLevel() + " xp " + copy.getVillagerXp() + " offers " + offers(copy.getOffers()));
        player.closeContainer();
        R.put("S11.mock.afterClose", "tradingPlayer " + trader.getTradingPlayer() + " menu " + player.containerMenu.getClass().getSimpleName());
        R.put("S11.mock.events", new ArrayList<>(Spike3Trader.EVENTS));
        player.discard();
        level.getServer().getPlayerList().remove(player);
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void s12Registration(GameTestHelper helper) {
        R.put("S12.init", new ArrayList<>(Spike3Mod.INIT));
        Optional<Holder<PoiType>> site = PoiTypes.forState(Spike3Mod.jobSite.defaultBlockState());
        Optional<Holder<PoiType>> untagged = PoiTypes.forState(Spike3Mod.jobSiteUntagged.defaultBlockState());
        Optional<Holder<PoiType>> composter = PoiTypes.forState(Blocks.COMPOSTER.defaultBlockState());
        R.put("S12.forState.site", site.map(h -> h.unwrapKey().map(Object::toString).orElse("unkeyed") + " acquirableTag="
                + h.is(PoiTypeTags.ACQUIRABLE_JOB_SITE) + " allAcquirable=" + VillagerProfession.ALL_ACQUIRABLE_JOBS.test(h)).orElse("none"));
        R.put("S12.forState.untagged", untagged.map(h -> h.unwrapKey().map(Object::toString).orElse("unkeyed") + " acquirableTag="
                + h.is(PoiTypeTags.ACQUIRABLE_JOB_SITE)).orElse("none"));
        R.put("S12.forState.composter", composter.map(h -> h.unwrapKey().map(Object::toString).orElse("unkeyed")).orElse("none"));
        R.put("S12.registry.dupComposter", String.valueOf(BuiltInRegistries.POINT_OF_INTEREST_TYPE.getValue(Spike3Mod.id("spike_dup_composter"))));
        R.put("S12.profession", String.valueOf(BuiltInRegistries.VILLAGER_PROFESSION.getValue(Spike3Mod.profession)));
        helper.succeed();
    }

    /**
     * A villager with free will near the untagged job site only (600 ticks), then the tagged one is placed: it must
     * take the tagged profession, and its offers come from {@code msm_spike3:spike_job/level_1}.
     */
    @GameTest(maxTicks = 3000)
    public void s12VillagerTakesTheJob(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos untaggedPos = new BlockPos(4, 2, 1);
        BlockPos sitePos = new BlockPos(1, 2, 4);
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                helper.setBlock(new BlockPos(x, 1, z), Blocks.STONE);
            }
        }
        helper.setBlock(untaggedPos, Spike3Mod.jobSiteUntagged);
        Villager villager = helper.spawn(EntityTypes.VILLAGER, MID);
        long start = helper.getTick();
        R.put("S12.job.untaggedPoiInManager", String.valueOf(level.getPoiManager().getType(helper.absolutePos(untaggedPos))
                .map(h -> h.unwrapKey().map(Object::toString).orElse("?")).orElse("none")));
        final boolean[] placed = {false};
        final List<String> trace = new ArrayList<>();
        helper.onEachTick(() -> {
            long t = helper.getTick() - start;
            String prof = villager.getVillagerData().profession().unwrapKey().map(k -> k.identifier().toString()).orElse("?");
            if (t % 100 == 0) {
                trace.add("t=" + t + " pos=" + helper.relativePos(villager.blockPosition()).toShortString() + " prof=" + prof + " jobSite=" + villager.getBrain().getMemory(MemoryModuleType.JOB_SITE)
                        .map(g -> g.pos().toShortString()).orElse("-") + " potential=" + villager.getBrain()
                        .getMemory(MemoryModuleType.POTENTIAL_JOB_SITE).map(g -> g.pos().toShortString()).orElse("-"));
            }
            if (!placed[0] && t >= 600) {
                placed[0] = true;
                R.put("S12.job.profAfter600WithUntaggedOnly", prof);
                helper.setBlock(sitePos, Spike3Mod.jobSite);
                R.put("S12.job.sitePoiInManager", String.valueOf(level.getPoiManager().getType(helper.absolutePos(sitePos))
                        .map(h -> h.unwrapKey().map(Object::toString).orElse("?")).orElse("none")));
            }
            if (placed[0] && villager.getVillagerData().profession().is(Spike3Mod.profession)) {
                R.put("S12.job.takenAtTick", t);
                R.put("S12.job.trace", trace);
                R.put("S12.job.villagerData", String.valueOf(villager.getVillagerData()));
                R.put("S12.job.offers", offers(villager.getOffers()));
                R.put("S12.job.jobSiteMemory", String.valueOf(villager.getBrain().getMemory(MemoryModuleType.JOB_SITE)));
                R.put("S12.job.absSitePos", helper.absolutePos(sitePos).toShortString());
                helper.succeed();
            }
        });
        helper.runAtTickTime(start + 2990, () -> {
            R.put("S12.job.trace", trace);
            R.put("S12.job.timeout", String.valueOf(villager.getVillagerData()));
        });
    }

    /** A villager given the profession directly trades from the profession's sets; a mock player opens it. */
    @GameTest(maxTicks = 40)
    @SuppressWarnings("removal")
    public void s12VillagerWithProfessionTrades(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Villager villager = helper.spawnWithNoFreeWill(EntityTypes.VILLAGER, MID);
        Holder<VillagerProfession> prof = BuiltInRegistries.VILLAGER_PROFESSION.getOrThrow(Spike3Mod.profession);
        villager.setVillagerData(villager.getVillagerData().withProfession(prof));
        R.put("S12.direct.offers", offers(villager.getOffers()));
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(MID.east(2))));
        player.setGameMode(GameType.SURVIVAL);
        var result = player.interactOn(villager, InteractionHand.MAIN_HAND, villager.position());
        R.put("S12.direct.open", result + " " + player.containerMenu.getClass().getSimpleName());
        // Level 2 and 3: the level-3 trade set is missing on purpose.
        villager.setVillagerXp(70);
        villager.setVillagerData(villager.getVillagerData().withLevel(2));
        R.put("S12.direct.name", villager.getDisplayName().getString() + " / " + prof.value().name().getString());
        player.closeContainer();
        player.discard();
        level.getServer().getPlayerList().remove(player);
        helper.succeed();
    }
}
