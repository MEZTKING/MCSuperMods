package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.PoiTypes;
import dev.mcsupermods.runtime.registry.mob.MsmProfessions;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.PoiTypeTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerProfession;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * Villager professions (ADR 0098 D2, B474) through the version seam {@code registry/PoiTypes} (Fabric's
 * {@code PoiHelper} on 26.3, reflection on 26.4): {@code pf_potter} at the project block {@code pf_wheel} (in
 * {@code #minecraft:acquirable_job_site} by the test pack, as lowering writes it), with its default trade sets
 * {@code msm_test:pf_potter/level_1} and {@code level_2}; {@code pf_taken} (the composter, a farmer's job site),
 * {@code pf_unknown} (no such block) and {@code pf_zcopy} ({@code pf_wheel} again) are refused.
 */
public class MsmProfessionGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Holder<VillagerProfession> potter() {
        return BuiltInRegistries.VILLAGER_PROFESSION.wrapAsHolder(BuiltInRegistries.VILLAGER_PROFESSION.getValue(id("pf_potter")));
    }

    private static Block wheel() {
        return BuiltInRegistries.BLOCK.getValue(id("pf_wheel"));
    }

    private static String key(Holder<?> holder) {
        return holder.unwrapKey().map(k -> k.identifier().toString()).orElse("(unnamed)");
    }

    private static List<String> items(MerchantOffers offers) {
        List<String> out = new ArrayList<>();
        for (MerchantOffer o : offers) {
            out.add(BuiltInRegistries.ITEM.getKey(o.getCostA().getItem()).getPath() + "->"
                    + BuiltInRegistries.ITEM.getKey(o.getResult().getItem()).getPath());
        }
        return out.stream().sorted().toList();
    }

    @GameTest
    public void professionsRegisterWithAPointOfInterestForEveryState(GameTestHelper helper) {
        helper.assertValueEqual(MsmRuntime.report().professions(), List.of(id("pf_potter")),
                "registered professions (logged as 'registered 1 villager profession(s)')");
        helper.assertTrue(MsmProfessions.registered().containsKey(id("pf_potter")), "pf_potter not kept");
        String route = PoiTypes.route();
        String version = SharedConstants.getCurrentVersion().name();
        helper.assertValueEqual(route, version.startsWith("26.3") ? "Fabric PoiHelper" : "reflection PoiTypes.register",
                "the seam's route on " + version);
        for (BlockState state : wheel().getStateDefinition().getPossibleStates()) {
            Optional<Holder<PoiType>> poi = net.minecraft.world.entity.ai.village.poi.PoiTypes.forState(state);
            helper.assertTrue(poi.isPresent(), "no point of interest for " + state);
            helper.assertValueEqual(key(poi.get()), "msm_test:pf_potter", "the job site's point of interest");
            helper.assertTrue(poi.get().is(PoiTypeTags.ACQUIRABLE_JOB_SITE), "not in #minecraft:acquirable_job_site");
            helper.assertTrue(VillagerProfession.ALL_ACQUIRABLE_JOBS.test(poi.get()), "not an acquirable job");
            helper.assertTrue(potter().value().heldJobSite().test(poi.get()), "the profession does not hold its job site");
        }
        VillagerProfession p = potter().value();
        helper.assertValueEqual(p.name().getContents() instanceof TranslatableContents t ? t.getKey() : "<literal>",
                "entity.msm_test.villager.pf_potter", "name key");
        helper.assertValueEqual(p.requestedItems().stream().map(BuiltInRegistries.ITEM::getKey).toList(),
                List.of(Identifier.withDefaultNamespace("clay_ball")), "requested items (the unknown one dropped)");
        helper.assertTrue(p.secondaryPoi().contains(Blocks.CLAY), "secondary job blocks");
        helper.assertTrue(p.workSound() == SoundEvents.VILLAGER_WORK_MASON, "work sound " + p.workSound());
        for (int level = 1; level <= 5; level++) {
            helper.assertValueEqual(p.getTrades(level).identifier(), id("pf_potter/level_" + level), "default trade set " + level);
        }
        helper.succeed();
    }

    @GameTest
    public void takenUnknownAndDuplicateJobSitesAreRefused(GameTestHelper helper) {
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("villager_profession/pf_taken.json") && e.contains("minecraft:composter")
                && e.contains("minecraft:farmer") && e.contains("not registered")), "no error for pf_taken: " + errors);
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("villager_profession/pf_unknown.json")
                && e.contains("msm_test:no_such_block") && e.contains("not a registered block")), "no error for pf_unknown: " + errors);
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("villager_profession/pf_zcopy.json")
                && e.contains("msm_test:pf_potter")), "no error for pf_zcopy: " + errors);
        for (String path : List.of("pf_taken", "pf_unknown", "pf_zcopy")) {
            helper.assertFalse(BuiltInRegistries.VILLAGER_PROFESSION.containsKey(id(path)), path + " registered");
            helper.assertFalse(BuiltInRegistries.POINT_OF_INTEREST_TYPE.containsKey(id(path)), path + "'s point of interest registered");
        }
        for (BlockState state : Blocks.COMPOSTER.getStateDefinition().getPossibleStates()) {
            helper.assertValueEqual(net.minecraft.world.entity.ai.village.poi.PoiTypes.forState(state).map(MsmProfessionGameTest::key)
                    .orElse("none"), "minecraft:farmer", "the composter kept its point of interest");
        }
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("pf_potter.json") && w.contains("msm_test:no_such_item")),
                "no warning for the unknown requested item: " + warnings);
        helper.succeed();
    }

    @GameTest
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    public void aVillagerWithTheProfessionTradesFromItsSets(GameTestHelper helper) {
        BlockPos mid = new BlockPos(1, 2, 1);
        Villager villager = helper.spawnWithNoFreeWill(EntityTypes.VILLAGER, mid);
        villager.setVillagerData(villager.getVillagerData().withProfession(potter()));
        helper.assertValueEqual(items(villager.getOffers()), List.of("clay_ball->emerald", "emerald->flower_pot"),
                "level 1 offers from msm_test:pf_potter/level_1");
        helper.assertValueEqual(villager.getDisplayName().getString().isEmpty(), false, "no name");
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        try {
            player.setGameMode(GameType.SURVIVAL);
            player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(mid.east(2))));
            player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            player.interactOn(villager, InteractionHand.MAIN_HAND, Vec3.ZERO);
            helper.assertTrue(player.containerMenu instanceof MerchantMenu, "the villager did not open its menu");
            helper.assertTrue(villager.getVillagerData().profession().value().requestedItems().contains(Items.CLAY_BALL),
                    "requested items");
        } finally {
            player.closeContainer();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
        helper.succeed();
    }

    /**
     * A villager with free will in the walled arena takes the job at {@code pf_wheel}, trades from the profession's sets,
     * and loses the job (no trading XP yet) when the block is broken. The arena's walls keep it from other tests' job sites.
     */
    @GameTest(structure = ARENA, maxTicks = 2400)
    public void aVillagerTakesTheJobAndLosesItWhenTheBlockBreaks(GameTestHelper helper) {
        BlockPos site = new BlockPos(2, 1, 2);
        Villager villager = helper.spawn(EntityTypes.VILLAGER, new BlockPos(7, 1, 7));
        helper.setBlock(site, wheel());
        int[] stage = {0};
        long[] tookAt = {-1};
        helper.onEachTick(() -> {
            Holder<VillagerProfession> now = villager.getVillagerData().profession();
            if (stage[0] == 0 && now.is(id("pf_potter"))) {
                tookAt[0] = helper.getTick();
                helper.assertValueEqual(items(villager.getOffers()), List.of("clay_ball->emerald", "emerald->flower_pot"),
                        "offers of the new potter");
                helper.assertValueEqual(villager.getVillagerXp(), 0, "trading XP of a new potter");
                helper.destroyBlock(site);
                stage[0] = 1;
            } else if (stage[0] == 0 && !now.is(VillagerProfession.NONE)) {
                helper.fail("the villager took another job: " + key(now));
            } else if (stage[0] == 1 && now.is(VillagerProfession.NONE)) {
                MsmRuntime.LOGGER.info("[msm_runtime] profession: took the job at tick {}, lost it at tick {}", tookAt[0], helper.getTick());
                helper.succeed();
            }
        });
    }
}
